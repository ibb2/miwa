import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db/db';
import {
  mailAccounts,
  mailAttachments,
  mailMessageAddresses,
  mailMessages,
  mailboxSyncState,
  mailThreads,
  type NewMailAttachmentRow,
  type NewMailMessageRow,
} from '../db/schema';
import { gmailAccountAuth } from './accounts';
import { mapWithConcurrency, throwIfAborted } from './async';
import { GmailApiError, gmailGet } from './gmail';
import { latestHistoryId } from './history';
import {
  collectLeafParts,
  contentDisposition,
  contentId,
  decodeBase64UrlBytes,
  header,
  isBodyPart,
  parseAddresses,
  parseReferences,
  removeAngleBrackets,
  sanitizeEmailHtml,
  stripHtml,
  type GmailPart,
} from './gmail-content';

export const DEFAULT_INBOX_DOWNLOAD_LIMIT = 1_000;

const GMAIL_MAX_PAGE_SIZE = 500;
const THREAD_CONCURRENCY = 4;
const ATTACHMENT_CONCURRENCY = 4;

type GmailMessageReference = { id: string; threadId: string };

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

type GmailThread = { id: string; messages?: GmailMessage[] };

type GmailAttachmentBody = { attachmentId?: string; data?: string; size?: number };

type DownloadedMessage = {
  row: NewMailMessageRow;
  addresses: ReturnType<typeof parseAddresses>;
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

export type InboxDownloadProgress = {
  accountId: string;
  phase: 'listing' | 'downloading' | 'complete';
  fraction: number;
  inboxEmailsSelected: number;
  targetInboxEmails: number;
  threadsDownloaded: number;
  totalThreads: number;
  messagesStored: number;
  attachmentsStored: number;
};

export type InboxDownloadResult = {
  inboxEmailsSelected: number;
  threadsDownloaded: number;
  messagesStored: number;
  attachmentsStored: number;
};

export type InboxDownloadOptions = {
  /** Maximum number of INBOX-labeled messages to select (whole threads are stored). */
  maxEmails?: number;
  signal?: AbortSignal;
  onProgress?: (progress: InboxDownloadProgress) => void;
};

/** Lists INBOX message references, paging until `limit` or the end of the inbox. */
export async function listInboxMessageRefs(
  accountId: string,
  limit: number,
  signal?: AbortSignal,
  onPage?: (collected: number, estimatedTotal: number | undefined) => void,
): Promise<{ refs: GmailMessageReference[]; nextPageToken?: string; resultSizeEstimate?: number }> {
  const refs: GmailMessageReference[] = [];
  let pageToken: string | undefined;
  let nextPageToken: string | undefined;
  let resultSizeEstimate: number | undefined;

  do {
    throwIfAborted(signal);
    const query = new URLSearchParams({
      labelIds: 'INBOX',
      maxResults: String(Math.min(GMAIL_MAX_PAGE_SIZE, limit - refs.length)),
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await gmailGet<GmailMessageList>(accountId, `/messages?${query}`, signal);
    const received = page.messages ?? [];
    refs.push(...received.slice(0, limit - refs.length));
    nextPageToken = page.nextPageToken;
    resultSizeEstimate = page.resultSizeEstimate;
    onPage?.(refs.length, resultSizeEstimate);
    if (!received.length) break;
    pageToken = nextPageToken;
  } while (pageToken && refs.length < limit);

  return { refs, nextPageToken, resultSizeEstimate };
}

async function getPartBytes(
  accountId: string,
  messageId: string,
  body: GmailPart['body'],
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

async function downloadMessage(
  accountId: string,
  threadLocalId: string,
  message: GmailMessage,
  signal?: AbortSignal,
): Promise<DownloadedMessage> {
  const sourceHeaders = message.payload?.headers ?? [];
  const messageLocalId = `${accountId}:${message.id}`;
  const leaves = collectLeafParts(message.payload);
  const downloadedParts = await mapWithConcurrency(
    leaves,
    ATTACHMENT_CONCURRENCY,
    async ({ part, path }) => {
      throwIfAborted(signal);
      return { part, path, bytes: await getPartBytes(accountId, message.id, part.body, signal) };
    },
  );

  const plain: string[] = [];
  const html: string[] = [];
  const attachments: NewMailAttachmentRow[] = [];

  for (const { part, path, bytes } of downloadedParts) {
    if (isBodyPart(part)) {
      const text = new TextDecoder().decode(bytes);
      if (part.mimeType === 'text/plain') plain.push(text);
      if (part.mimeType === 'text/html') html.push(text);
      continue;
    }

    const partContentId = contentId(part);
    const disposition = contentDisposition(part);
    const hasContent =
      bytes.length > 0 ||
      Boolean(part.body?.attachmentId) ||
      Boolean(part.filename?.trim()) ||
      Boolean(partContentId);
    if (!hasContent) continue;

    const providerPartId = part.partId || path;
    attachments.push({
      id: `${messageLocalId}:${providerPartId}`,
      messageId: messageLocalId,
      providerAttachmentId: part.body?.attachmentId,
      providerPartId,
      filename: part.filename?.trim() ?? '',
      mimeType: part.mimeType ?? 'application/octet-stream',
      contentId: partContentId,
      contentDisposition: disposition || null,
      size: bytes.length || part.body?.size || 0,
      inline: Boolean(partContentId) || disposition.toLowerCase().startsWith('inline'),
      downloadState: 'complete',
      data: bytes,
      downloadedAt: Date.now(),
    });
  }

  const joinedHtml = html.join('\n');
  const plainText = plain.join('\n').trim() || stripHtml(joinedHtml);

  return {
    row: {
      id: messageLocalId,
      threadId: threadLocalId,
      accountId,
      providerMessageId: message.id,
      providerHistoryId: message.historyId,
      rfc822MessageId: removeAngleBrackets(header(sourceHeaders, 'Message-ID')) || null,
      inReplyTo: removeAngleBrackets(header(sourceHeaders, 'In-Reply-To')) || null,
      references: parseReferences(header(sourceHeaders, 'References')),
      sender: header(sourceHeaders, 'From') || 'Unknown sender',
      recipients: header(sourceHeaders, 'To'),
      subject: header(sourceHeaders, 'Subject') || '(No subject)',
      snippet: message.snippet ?? '',
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
  signal?: AbortSignal,
): Promise<DownloadedThread> {
  const thread = await gmailGet<GmailThread>(
    accountId,
    `/threads/${encodeURIComponent(providerThreadId)}?format=full`,
    signal,
  );
  const threadLocalId = `${accountId}:${thread.id}`;
  const messages = await mapWithConcurrency(thread.messages ?? [], THREAD_CONCURRENCY, (message) =>
    downloadMessage(accountId, threadLocalId, message, signal),
  );
  messages.sort((left, right) => left.row.sentAt - right.row.sentAt);
  const latest = messages.at(-1);

  return {
    providerThreadId: thread.id,
    subject: latest?.row.subject ?? '(No subject)',
    sender: latest?.row.sender ?? 'Unknown sender',
    snippet: latest?.row.snippet ?? '',
    lastMessageAt: latest?.row.sentAt ?? 0,
    unread: messages.some((item) => (item.row.labelIds ?? []).includes('UNREAD')),
    messages,
  };
}

/** Replaces the local copy of a thread inside one transaction. */
async function persistThread(accountId: string, thread: DownloadedThread): Promise<void> {
  const timestamp = Date.now();
  const threadLocalId = `${accountId}:${thread.providerThreadId}`;
  const threadRow = {
    subject: thread.subject,
    sender: thread.sender,
    snippet: thread.snippet,
    lastMessageAt: thread.lastMessageAt,
    unread: thread.unread,
    messageCount: thread.messages.length,
    fullyDownloaded: true,
    downloadedAt: timestamp,
    updatedAt: timestamp,
  };

  db.transaction((transaction) => {
    transaction
      .insert(mailThreads)
      .values({
        id: threadLocalId,
        accountId,
        providerThreadId: thread.providerThreadId,
        ...threadRow,
      })
      .onConflictDoUpdate({ target: mailThreads.id, set: threadRow })
      .run();

    const existingIds = transaction
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(eq(mailMessages.threadId, threadLocalId))
      .all()
      .map((message) => message.id);
    if (existingIds.length) {
      transaction.delete(mailAttachments).where(inArray(mailAttachments.messageId, existingIds)).run();
      transaction.delete(mailMessageAddresses).where(inArray(mailMessageAddresses.messageId, existingIds)).run();
      transaction.delete(mailMessages).where(inArray(mailMessages.id, existingIds)).run();
    }

    for (const message of thread.messages) {
      transaction.insert(mailMessages).values(message.row).run();
      if (message.addresses.length) {
        transaction.insert(mailMessageAddresses).values(message.addresses).run();
      }
      if (message.attachments.length) {
        transaction.insert(mailAttachments).values(message.attachments).run();
      }
    }
  });
}

async function removeThread(accountId: string, providerThreadId: string): Promise<void> {
  await db
    .delete(mailThreads)
    .where(
      and(
        eq(mailThreads.accountId, accountId),
        eq(mailThreads.providerThreadId, providerThreadId),
      ),
    );
}

export type ThreadReconcileResult = {
  action: 'upserted' | 'removed';
  messagesStored: number;
  attachmentsStored: number;
  historyId?: string;
};

/**
 * Re-fetches one Gmail thread and makes its local copy match. A thread stays
 * local while at least one message carries the INBOX label; the whole thread
 * is stored so sent and archived replies remain readable offline.
 */
export async function reconcileThread(
  accountId: string,
  providerThreadId: string,
  signal?: AbortSignal,
): Promise<ThreadReconcileResult> {
  throwIfAborted(signal);

  let thread: DownloadedThread;
  try {
    thread = await downloadThread(accountId, providerThreadId, signal);
  } catch (error) {
    if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
    await removeThread(accountId, providerThreadId);
    return { action: 'removed', messagesStored: 0, attachmentsStored: 0 };
  }

  const historyId = latestHistoryId(
    thread.messages.map((message) => message.row.providerHistoryId),
  );
  const remainsInInbox = thread.messages.some((message) =>
    (message.row.labelIds ?? []).includes('INBOX'),
  );
  if (!remainsInInbox) {
    await removeThread(accountId, providerThreadId);
    return { action: 'removed', messagesStored: 0, attachmentsStored: 0, historyId };
  }

  await persistThread(accountId, thread);
  return {
    action: 'upserted',
    messagesStored: thread.messages.length,
    attachmentsStored: thread.messages.reduce(
      (total, message) => total + message.attachments.length,
      0,
    ),
    historyId,
  };
}

/**
 * Downloads a read-only snapshot of one Gmail account's INBOX into SQLite.
 * Only Gmail GET endpoints are called; labels and server-side mail never change.
 */
export async function downloadInbox(
  accountId: string,
  options: InboxDownloadOptions = {},
): Promise<InboxDownloadResult> {
  const maxEmails = options.maxEmails ?? DEFAULT_INBOX_DOWNLOAD_LIMIT;
  if (!Number.isSafeInteger(maxEmails) || maxEmails < 0) {
    throw new RangeError('maxEmails must be a non-negative safe integer.');
  }
  throwIfAborted(options.signal);

  const account = (await gmailAccountAuth.listAccounts()).find((item) => item.id === accountId);
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

  await db
    .insert(mailboxSyncState)
    .values({
      accountId,
      mailbox: 'INBOX',
      lastAttemptAt: startedAt,
      initialSyncComplete: false,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: mailboxSyncState.accountId,
      set: { lastAttemptAt: startedAt, lastError: null },
    });

  const progress = (patch: Partial<InboxDownloadProgress>) =>
    options.onProgress?.({
      accountId,
      phase: 'listing',
      fraction: 0,
      inboxEmailsSelected: 0,
      targetInboxEmails: maxEmails,
      threadsDownloaded: 0,
      totalThreads: 0,
      messagesStored: 0,
      attachmentsStored: 0,
      ...patch,
    });

  try {
    progress({ phase: 'listing' });
    const { refs, resultSizeEstimate } = await listInboxMessageRefs(
      accountId,
      maxEmails,
      options.signal,
      (collected, estimate) =>
        progress({
          phase: 'listing',
          fraction: Math.min(0.1, (collected / Math.min(maxEmails, estimate ?? maxEmails)) * 0.1 || 0),
          inboxEmailsSelected: collected,
          targetInboxEmails: Math.min(maxEmails, estimate ?? maxEmails),
        }),
    );
    const inboxEmailsSelected = refs.length;
    const targetInboxEmails = Math.min(maxEmails, resultSizeEstimate ?? maxEmails);

    const threadIds = [...new Set(refs.map((message) => message.threadId))];
    const totalThreads = threadIds.length;
    let threadsDownloaded = 0;
    let messagesStored = 0;
    let attachmentsStored = 0;
    let downloadedHistoryId: string | undefined;

    for (let offset = 0; offset < threadIds.length; offset += THREAD_CONCURRENCY) {
      const batch = await Promise.all(
        threadIds
          .slice(offset, offset + THREAD_CONCURRENCY)
          .map((threadId) => downloadThread(accountId, threadId, options.signal)),
      );
      for (const thread of batch) {
        await persistThread(accountId, thread);
        downloadedHistoryId = latestHistoryId([
          downloadedHistoryId,
          ...thread.messages.map((message) => message.row.providerHistoryId),
        ]);
        threadsDownloaded += 1;
        messagesStored += thread.messages.length;
        attachmentsStored += thread.messages.reduce(
          (total, message) => total + message.attachments.length,
          0,
        );
        progress({
          phase: 'downloading',
          fraction: totalThreads > 0 ? 0.1 + (threadsDownloaded / totalThreads) * 0.9 : 1,
          inboxEmailsSelected,
          targetInboxEmails,
          threadsDownloaded,
          totalThreads,
          messagesStored,
          attachmentsStored,
        });
      }
    }

    const existingSyncState = await db
      .select({ historyId: mailboxSyncState.historyId })
      .from(mailboxSyncState)
      .where(eq(mailboxSyncState.accountId, accountId))
      .get();
    await db
      .update(mailboxSyncState)
      .set({
        nextPageToken: null,
        historyId: latestHistoryId([existingSyncState?.historyId, downloadedHistoryId]),
        lastSuccessfulSyncAt: Date.now(),
        initialSyncComplete: true,
        lastError: null,
      })
      .where(eq(mailboxSyncState.accountId, accountId));

    progress({
      phase: 'complete',
      fraction: 1,
      inboxEmailsSelected,
      targetInboxEmails,
      threadsDownloaded,
      totalThreads,
      messagesStored,
      attachmentsStored,
    });

    return { inboxEmailsSelected, threadsDownloaded, messagesStored, attachmentsStored };
  } catch (error) {
    await db
      .update(mailboxSyncState)
      .set({
        lastError: error instanceof Error ? error.message : 'INBOX download failed.',
      })
      .where(eq(mailboxSyncState.accountId, accountId))
      .catch(() => undefined);
    throw error;
  }
}
