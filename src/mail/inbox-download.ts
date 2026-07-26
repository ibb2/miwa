import { and, eq, inArray } from "drizzle-orm";

import db from "../db/db";
import {
  mailAccounts,
  mailAttachments,
  mailMessageAddresses,
  mailMessages,
  mailboxSyncState,
  mailThreads,
  type NewMailAttachmentRow,
  type NewMailMessageAddressRow,
  type NewMailMessageRow,
} from "../db/schema";
import { gmailAccountAuth } from "./account-auth";
import { GmailApiError, gmailGet } from "./gmail";
import { latestHistoryId } from "./gmail-history";
import {
  decodeBase64UrlBytes,
  sanitizeEmailHtml,
  stripHtml,
  type GmailPart,
} from "./gmail-utils";

export const DEFAULT_INBOX_DOWNLOAD_LIMIT = 1_000;
const GMAIL_MAX_PAGE_SIZE = 500;
const DEFAULT_THREAD_CONCURRENCY = 4;
const DEFAULT_ATTACHMENT_CONCURRENCY = 4;

type GmailHeader = {
  name: string;
  value: string;
};

type GmailMessageReference = {
  id: string;
  threadId: string;
};

type GmailMessageList = {
  messages?: GmailMessageReference[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  sizeEstimate?: number;
  payload?: GmailPart;
};

type GmailThread = {
  id: string;
  messages?: GmailMessage[];
};

type GmailAttachmentBody = {
  attachmentId?: string;
  data?: string;
  size?: number;
};

type AddressKind = NewMailMessageAddressRow["kind"];

type DownloadedMessage = {
  row: NewMailMessageRow;
  addresses: NewMailMessageAddressRow[];
  attachments: NewMailAttachmentRow[];
};

type DownloadedThread = {
  providerThreadId: string;
  subject: string;
  sender: string;
  snippet: string;
  lastMessageAt: number;
  unread: boolean;
  messages: DownloadedMessage[];
};

export type InboxThreadReconciliationResult = {
  providerThreadId: string;
  action: "upserted" | "removed";
  messagesStored: number;
  attachmentsStored: number;
  historyId?: string;
};

export type InboxDownloadOptions = {
  /**
   * Maximum number of messages carrying the INBOX label to select.
   *
   * Full conversation threads are stored, so the number of rows written to
   * `mail_messages` can be higher when a selected thread also contains sent or
   * archived replies.
   */
  maxEmails?: number;
  signal?: AbortSignal;
  threadConcurrency?: number;
  attachmentConcurrency?: number;
  onProgress?: (progress: InboxDownloadProgress) => void;
};

export type InboxDownloadProgress = {
  accountId: string;
  phase: "listing" | "downloading" | "complete";
  fraction: number;
  inboxEmailsSelected: number;
  targetInboxEmails: number;
  threadsDownloaded: number;
  totalThreads: number;
  messagesStored: number;
  attachmentsStored: number;
};

export type InboxDownloadResult = {
  accountId: string;
  inboxEmailsSelected: number;
  threadsDownloaded: number;
  messagesStored: number;
  attachmentsStored: number;
  entireInboxDownloaded: boolean;
  stoppedAtLimit: boolean;
  nextPageToken?: string;
};

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("INBOX download aborted.");
  error.name = "AbortError";
  throw error;
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return (
    headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

function headers(part: GmailPart | undefined): GmailHeader[] {
  return part?.headers ?? [];
}

function removeAngleBrackets(value: string): string {
  return value.trim().replace(/^<|>$/g, "");
}

function splitAddressList(value: string): string[] {
  const addresses: string[] = [];
  let start = 0;
  let quoted = false;
  let angleDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && value[index - 1] !== "\\") quoted = !quoted;
    if (!quoted && character === "<") angleDepth += 1;
    if (!quoted && character === ">") angleDepth = Math.max(0, angleDepth - 1);
    if (!quoted && angleDepth === 0 && character === ",") {
      addresses.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  addresses.push(value.slice(start).trim());
  return addresses.filter(Boolean);
}

function parseAddresses(
  messageId: string,
  sourceHeaders: GmailHeader[],
): NewMailMessageAddressRow[] {
  const definitions: Array<{ headerName: string; kind: AddressKind }> = [
    { headerName: "From", kind: "from" },
    { headerName: "Sender", kind: "sender" },
    { headerName: "Reply-To", kind: "replyTo" },
    { headerName: "To", kind: "to" },
    { headerName: "Cc", kind: "cc" },
    { headerName: "Bcc", kind: "bcc" },
  ];
  const result: NewMailMessageAddressRow[] = [];

  for (const { headerName, kind } of definitions) {
    const values = sourceHeaders.filter(
      (item) => item.name.toLowerCase() === headerName.toLowerCase(),
    );
    let position = 0;
    for (const value of values) {
      for (const rawValue of splitAddressList(value.value)) {
        const angleMatch = rawValue.match(/^(.*?)<([^<>]+)>\s*$/);
        const bareAddress = angleMatch?.[2]?.trim() ?? rawValue.trim();
        const rawName = angleMatch?.[1]?.trim();
        result.push({
          messageId,
          kind,
          position,
          name: rawName
            ? rawName.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"')
            : null,
          address: bareAddress.includes("@") ? bareAddress : null,
          rawValue,
        });
        position += 1;
      }
    }
  }

  return result;
}

function parseReferences(value: string): Array<{ messageId: string }> {
  return Array.from(value.matchAll(/<([^<>]+)>/g), (match) => ({
    messageId: match[1],
  }));
}

function contentDisposition(part: GmailPart): string {
  return header(part.headers, "Content-Disposition");
}

function contentId(part: GmailPart): string | undefined {
  const value = header(part.headers, "Content-ID");
  return value ? removeAngleBrackets(value) : undefined;
}

function isBodyPart(part: GmailPart): boolean {
  const disposition = contentDisposition(part).toLowerCase();
  return (
    (part.mimeType === "text/plain" || part.mimeType === "text/html") &&
    !part.filename?.trim() &&
    !disposition.startsWith("attachment")
  );
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      async () => {
        while (cursor < values.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await transform(values[index], index);
        }
      },
    ),
  );
  return results;
}

async function getPartBytes(
  accountId: string,
  messageId: string,
  body: GmailPart["body"],
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (body?.data) return decodeBase64UrlBytes(body.data);
  if (!body?.attachmentId) return new Uint8Array();
  const attachment = await gmailGet<GmailAttachmentBody>(
    accountId,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(body.attachmentId)}`,
    signal,
  );
  return decodeBase64UrlBytes(attachment.data);
}

type CollectedPart = {
  part: GmailPart;
  path: string;
};

function collectLeafParts(
  part: GmailPart | undefined,
  path = "0",
): CollectedPart[] {
  if (!part) return [];
  if (part.parts?.length) {
    return part.parts.flatMap((child, index) =>
      collectLeafParts(child, `${path}.${index}`),
    );
  }
  return [{ part, path }];
}

async function downloadMessage(
  accountId: string,
  threadLocalId: string,
  message: GmailMessage,
  attachmentConcurrency: number,
  signal?: AbortSignal,
): Promise<DownloadedMessage> {
  const sourceHeaders = headers(message.payload);
  const messageLocalId = `${accountId}:${message.id}`;
  const leaves = collectLeafParts(message.payload);
  const downloadedParts = await mapWithConcurrency(
    leaves,
    attachmentConcurrency,
    async ({ part, path }) => {
      throwIfAborted(signal);
      const bytes = await getPartBytes(
        accountId,
        message.id,
        part.body,
        signal,
      );
      return { part, path, bytes };
    },
  );

  const plain: string[] = [];
  const html: string[] = [];
  const attachments: NewMailAttachmentRow[] = [];

  for (const { part, path, bytes } of downloadedParts) {
    if (isBodyPart(part)) {
      if (part.mimeType === "text/plain") plain.push(bytesToText(bytes));
      if (part.mimeType === "text/html") html.push(bytesToText(bytes));
      continue;
    }

    const partContentId = contentId(part);
    const disposition = contentDisposition(part);
    const hasDownloadableContent =
      bytes.length > 0 ||
      Boolean(part.body?.attachmentId) ||
      Boolean(part.filename?.trim()) ||
      Boolean(partContentId);
    if (!hasDownloadableContent) continue;

    const providerPartId = part.partId || path;
    attachments.push({
      id: `${messageLocalId}:${providerPartId}`,
      messageId: messageLocalId,
      providerAttachmentId: part.body?.attachmentId,
      providerPartId,
      filename: part.filename?.trim() ?? "",
      mimeType: part.mimeType ?? "application/octet-stream",
      contentId: partContentId,
      contentDisposition: disposition || null,
      size: bytes.length || part.body?.size || 0,
      inline:
        Boolean(partContentId) ||
        disposition.toLowerCase().startsWith("inline"),
      downloadState: "complete",
      data: bytes,
      downloadedAt: Date.now(),
    });
  }

  const joinedHtml = html.join("\n");
  const plainText = plain.join("\n").trim() || stripHtml(joinedHtml);
  const referencesHeader = header(sourceHeaders, "References");

  return {
    row: {
      id: messageLocalId,
      threadId: threadLocalId,
      accountId,
      providerMessageId: message.id,
      providerHistoryId: message.historyId,
      rfc822MessageId:
        removeAngleBrackets(header(sourceHeaders, "Message-ID")) || null,
      inReplyTo:
        removeAngleBrackets(header(sourceHeaders, "In-Reply-To")) || null,
      references: parseReferences(referencesHeader),
      sender: header(sourceHeaders, "From") || "Unknown sender",
      recipients: header(sourceHeaders, "To"),
      subject: header(sourceHeaders, "Subject") || "(No subject)",
      snippet: message.snippet ?? "",
      sentAt: Number(message.internalDate ?? 0),
      sizeEstimate: message.sizeEstimate,
      labelIds: message.labelIds ?? [],
      headers: sourceHeaders,
      plainTextBody: plainText,
      htmlBody: joinedHtml ? sanitizeEmailHtml(joinedHtml) : null,
      hasAttachments: attachments.length > 0,
      downloadedAt: Date.now(),
      updatedAt: Date.now(),
    },
    addresses: parseAddresses(messageLocalId, sourceHeaders),
    attachments,
  };
}

async function downloadThread(
  accountId: string,
  providerThreadId: string,
  attachmentConcurrency: number,
  signal?: AbortSignal,
): Promise<DownloadedThread> {
  const thread = await gmailGet<GmailThread>(
    accountId,
    `/threads/${encodeURIComponent(providerThreadId)}?format=full`,
    signal,
  );
  const threadLocalId = `${accountId}:${thread.id}`;
  const messages = await mapWithConcurrency(
    thread.messages ?? [],
    attachmentConcurrency,
    (message) =>
      downloadMessage(
        accountId,
        threadLocalId,
        message,
        attachmentConcurrency,
        signal,
      ),
  );
  messages.sort((left, right) => left.row.sentAt - right.row.sentAt);
  const latest = messages.at(-1);

  return {
    providerThreadId: thread.id,
    subject: latest?.row.subject ?? "(No subject)",
    sender: latest?.row.sender ?? "Unknown sender",
    snippet: latest?.row.snippet ?? "",
    lastMessageAt: latest?.row.sentAt ?? 0,
    unread: messages.some((item) =>
      (item.row.labelIds ?? []).includes("UNREAD"),
    ),
    messages,
  };
}

async function fetchBinary(
  url: string,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; mimeType?: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onload = () => {
      cleanup();
      if (
        request.status >= 200 &&
        request.status < 300 &&
        request.response instanceof ArrayBuffer
      ) {
        resolve({
          bytes: new Uint8Array(request.response),
          mimeType: request.getResponseHeader("Content-Type") ?? undefined,
        });
      } else {
        reject(new Error(`Binary download failed (${request.status}).`));
      }
    };
    request.onerror = () => {
      cleanup();
      reject(new Error("Binary download failed."));
    };
    request.onabort = () => {
      cleanup();
      const error = new Error("Binary download aborted.");
      error.name = "AbortError";
      reject(error);
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    request.send();
  });
}

async function persistThread(
  accountId: string,
  thread: DownloadedThread,
): Promise<void> {
  const timestamp = Date.now();
  const threadLocalId = `${accountId}:${thread.providerThreadId}`;

  db.transaction((transaction) => {
    transaction
      .insert(mailThreads)
      .values({
        id: threadLocalId,
        accountId,
        providerThreadId: thread.providerThreadId,
        subject: thread.subject,
        sender: thread.sender,
        snippet: thread.snippet,
        lastMessageAt: thread.lastMessageAt,
        unread: thread.unread,
        messageCount: thread.messages.length,
        fullyDownloaded: true,
        downloadedAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: mailThreads.id,
        set: {
          subject: thread.subject,
          sender: thread.sender,
          snippet: thread.snippet,
          lastMessageAt: thread.lastMessageAt,
          unread: thread.unread,
          messageCount: thread.messages.length,
          fullyDownloaded: true,
          downloadedAt: timestamp,
          updatedAt: timestamp,
        },
      })
      .run();

    const existingMessages = transaction
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(eq(mailMessages.threadId, threadLocalId))
      .all();
    const existingIds = existingMessages.map((message) => message.id);
    if (existingIds.length) {
      transaction
        .delete(mailAttachments)
        .where(inArray(mailAttachments.messageId, existingIds))
        .run();
      transaction
        .delete(mailMessageAddresses)
        .where(inArray(mailMessageAddresses.messageId, existingIds))
        .run();
      transaction
        .delete(mailMessages)
        .where(inArray(mailMessages.id, existingIds))
        .run();
    }

    for (const message of thread.messages) {
      transaction.insert(mailMessages).values(message.row).run();
      if (message.addresses.length) {
        transaction
          .insert(mailMessageAddresses)
          .values(message.addresses)
          .run();
      }
      if (message.attachments.length) {
        transaction
          .insert(mailAttachments)
          .values(message.attachments)
          .run();
      }
    }
  });
}

async function removeDownloadedThread(
  accountId: string,
  providerThreadId: string,
): Promise<void> {
  await db
    .delete(mailThreads)
    .where(
      and(
        eq(mailThreads.accountId, accountId),
        eq(mailThreads.providerThreadId, providerThreadId),
      ),
    );
}

/**
 * Re-fetches one Gmail thread and makes its local INBOX representation match.
 *
 * A thread remains local while at least one message carries the INBOX label.
 * The complete thread is stored so sent and archived replies remain available
 * in the offline conversation view.
 */
export async function reconcileInboxThread(
  accountId: string,
  providerThreadId: string,
  options: Pick<
    InboxDownloadOptions,
    "attachmentConcurrency" | "signal"
  > = {},
): Promise<InboxThreadReconciliationResult> {
  const attachmentConcurrency =
    options.attachmentConcurrency ?? DEFAULT_ATTACHMENT_CONCURRENCY;
  assertPositiveInteger(attachmentConcurrency, "attachmentConcurrency");
  throwIfAborted(options.signal);

  let thread: DownloadedThread;
  try {
    thread = await downloadThread(
      accountId,
      providerThreadId,
      attachmentConcurrency,
      options.signal,
    );
  } catch (error) {
    if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
    await removeDownloadedThread(accountId, providerThreadId);
    return {
      providerThreadId,
      action: "removed",
      messagesStored: 0,
      attachmentsStored: 0,
    };
  }

  const remainsInInbox = thread.messages.some((message) =>
    (message.row.labelIds ?? []).includes("INBOX"),
  );
  if (!remainsInInbox) {
    await removeDownloadedThread(accountId, providerThreadId);
    return {
      providerThreadId,
      action: "removed",
      messagesStored: 0,
      attachmentsStored: 0,
      historyId: latestHistoryId(
        thread.messages.map((message) => message.row.providerHistoryId),
      ),
    };
  }

  await persistThread(accountId, thread);
  return {
    providerThreadId,
    action: "upserted",
    messagesStored: thread.messages.length,
    attachmentsStored: thread.messages.reduce(
      (total, message) => total + message.attachments.length,
      0,
    ),
    historyId: latestHistoryId(
      thread.messages.map((message) => message.row.providerHistoryId),
    ),
  };
}

/**
 * Downloads a read-only snapshot of one Gmail account's INBOX into SQLite.
 *
 * This function only calls Gmail GET endpoints. It never modifies labels,
 * marks messages read, archives mail, or invokes a delete endpoint.
 */
export function downloadInbox(
  accountId: string,
  maxEmails?: number,
): Promise<InboxDownloadResult>;
export function downloadInbox(
  accountId: string,
  options?: InboxDownloadOptions,
): Promise<InboxDownloadResult>;
export async function downloadInbox(
  accountId: string,
  maxEmailsOrOptions: number | InboxDownloadOptions = {},
): Promise<InboxDownloadResult> {
  const options =
    typeof maxEmailsOrOptions === "number"
      ? { maxEmails: maxEmailsOrOptions }
      : maxEmailsOrOptions;
  const maxEmails = options.maxEmails ?? DEFAULT_INBOX_DOWNLOAD_LIMIT;
  const threadConcurrency =
    options.threadConcurrency ?? DEFAULT_THREAD_CONCURRENCY;
  const attachmentConcurrency =
    options.attachmentConcurrency ?? DEFAULT_ATTACHMENT_CONCURRENCY;
  assertNonNegativeInteger(maxEmails, "maxEmails");
  assertPositiveInteger(threadConcurrency, "threadConcurrency");
  assertPositiveInteger(attachmentConcurrency, "attachmentConcurrency");
  throwIfAborted(options.signal);

  const account = (await gmailAccountAuth.listAccounts()).find(
    (item) => item.id === accountId,
  );
  if (!account) {
    throw new Error(`Gmail account "${accountId}" is not connected.`);
  }

  const startedAt = Date.now();
  await db
    .insert(mailAccounts)
    .values({
      id: account.id,
      provider: account.provider,
      email: account.email,
      displayName: account.displayName,
      sortOrder: account.order,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: mailAccounts.id,
      set: {
        provider: account.provider,
        email: account.email,
        displayName: account.displayName,
        sortOrder: account.order,
        updatedAt: startedAt,
      },
    });

  if (account.avatarUrl) {
    try {
      const avatar = await fetchBinary(account.avatarUrl, options.signal);
      await db
        .update(mailAccounts)
        .set({
          avatarData: avatar.bytes,
          avatarMimeType: avatar.mimeType,
          updatedAt: Date.now(),
        })
        .where(eq(mailAccounts.id, accountId));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      // Account initials remain available offline when the optional avatar fails.
    }
  }

  await db
    .insert(mailboxSyncState)
    .values({
      accountId,
      mailbox: "INBOX",
      lastAttemptAt: startedAt,
      initialSyncComplete: false,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: mailboxSyncState.accountId,
      set: { lastAttemptAt: startedAt, lastError: null },
    });

  let inboxEmailsSelected = 0;
  let threadsDownloaded = 0;
  let messagesStored = 0;
  let attachmentsStored = 0;
  let pageToken: string | undefined;
  let nextPageToken: string | undefined;
  let entireInboxDownloaded = false;
  let downloadedHistoryId: string | undefined;

  try {
    const messageReferences: GmailMessageReference[] = [];
    let targetInboxEmails = maxEmails;

    options.onProgress?.({
      accountId,
      phase: "listing",
      fraction: 0,
      inboxEmailsSelected: 0,
      targetInboxEmails,
      threadsDownloaded: 0,
      totalThreads: 0,
      messagesStored: 0,
      attachmentsStored: 0,
    });

    while (inboxEmailsSelected < maxEmails) {
      throwIfAborted(options.signal);
      const remaining = maxEmails - inboxEmailsSelected;
      const query = new URLSearchParams({
        labelIds: "INBOX",
        maxResults: String(Math.min(GMAIL_MAX_PAGE_SIZE, remaining)),
      });
      if (pageToken) query.set("pageToken", pageToken);
      const page = await gmailGet<GmailMessageList>(
        accountId,
        `/messages?${query}`,
        options.signal,
      );
      const references = (page.messages ?? []).slice(0, remaining);
      messageReferences.push(...references);
      inboxEmailsSelected += references.length;
      nextPageToken = page.nextPageToken;
      if (page.resultSizeEstimate !== undefined) {
        targetInboxEmails = Math.min(maxEmails, page.resultSizeEstimate);
      }

      options.onProgress?.({
        accountId,
        phase: "listing",
        fraction:
          targetInboxEmails > 0
            ? Math.min(0.1, (inboxEmailsSelected / targetInboxEmails) * 0.1)
            : 0.1,
        inboxEmailsSelected,
        targetInboxEmails,
        threadsDownloaded: 0,
        totalThreads: 0,
        messagesStored: 0,
        attachmentsStored: 0,
      });

      if (!nextPageToken) {
        entireInboxDownloaded = true;
        break;
      }
      if (!references.length) break;
      pageToken = nextPageToken;
    }

    const threadIds = Array.from(
      new Set(messageReferences.map((message) => message.threadId)),
    );
    const totalThreads = threadIds.length;

    for (
      let offset = 0;
      offset < threadIds.length;
      offset += threadConcurrency
    ) {
      const batchIds = threadIds.slice(offset, offset + threadConcurrency);
      const batch = await Promise.all(
        batchIds.map((threadId) =>
          downloadThread(
            accountId,
            threadId,
            attachmentConcurrency,
            options.signal,
          ),
        ),
      );
      for (const thread of batch) {
        await persistThread(accountId, thread);
        downloadedHistoryId = latestHistoryId([
          downloadedHistoryId,
          ...thread.messages.map(
            (message) => message.row.providerHistoryId,
          ),
        ]);
        threadsDownloaded += 1;
        messagesStored += thread.messages.length;
        attachmentsStored += thread.messages.reduce(
          (total, message) => total + message.attachments.length,
          0,
        );
        options.onProgress?.({
          accountId,
          phase: "downloading",
          fraction:
            totalThreads > 0
              ? 0.1 + (threadsDownloaded / totalThreads) * 0.9
              : 1,
          inboxEmailsSelected,
          targetInboxEmails,
          threadsDownloaded,
          totalThreads,
          messagesStored,
          attachmentsStored,
        });
      }
    }

    const completedAt = Date.now();
    const existingSyncState = await db
      .select({ historyId: mailboxSyncState.historyId })
      .from(mailboxSyncState)
      .where(eq(mailboxSyncState.accountId, accountId))
      .get();
    await db
      .update(mailboxSyncState)
      .set({
        nextPageToken: entireInboxDownloaded ? null : nextPageToken,
        historyId: latestHistoryId([
          existingSyncState?.historyId,
          downloadedHistoryId,
        ]),
        lastSuccessfulSyncAt: completedAt,
        initialSyncComplete: entireInboxDownloaded,
        lastError: null,
      })
      .where(eq(mailboxSyncState.accountId, accountId));

    options.onProgress?.({
      accountId,
      phase: "complete",
      fraction: 1,
      inboxEmailsSelected,
      targetInboxEmails,
      threadsDownloaded,
      totalThreads,
      messagesStored,
      attachmentsStored,
    });

    return {
      accountId,
      inboxEmailsSelected,
      threadsDownloaded,
      messagesStored,
      attachmentsStored,
      entireInboxDownloaded,
      stoppedAtLimit: !entireInboxDownloaded && inboxEmailsSelected >= maxEmails,
      nextPageToken: entireInboxDownloaded ? undefined : nextPageToken,
    };
  } catch (error) {
    await db
      .update(mailboxSyncState)
      .set({
        // Resume the page that was in progress, never the following page.
        nextPageToken: pageToken,
        lastError:
          error instanceof Error ? error.message : "INBOX download failed.",
      })
      .where(eq(mailboxSyncState.accountId, accountId))
      .catch(() => undefined);
    throw error;
  }
}
