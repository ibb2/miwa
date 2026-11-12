import type { SQLCommand, Storage, Store } from '../app.contract.d.ts';
import { listAccounts } from './accounts';
import { mapWithConcurrency, messageFor } from './async';
import { str, withDb } from './db';
import { GmailApiError, gmailGet } from './gmail';
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
  type AddressRow,
  type GmailPart,
} from './gmail-content';
import { latestHistoryId } from './history';
import { mailChanged, removeInboxThread } from './thread-store';
import type { ConnectedAccount } from './types';

export const DEFAULT_INBOX_DOWNLOAD_LIMIT = 1_000;

const GMAIL_MAX_PAGE_SIZE = 500;
const THREAD_CONCURRENCY = 4;
const ATTACHMENT_CONCURRENCY = 4;
/** A full thread's JSON; attachments over Gmail's inline size arrive separately. */
const THREAD_RESPONSE_BYTES = 12 * 1024 * 1024;
/** Gmail's largest attachment (25 MB) grows by a third in base64. */
const ATTACHMENT_RESPONSE_BYTES = 36 * 1024 * 1024;

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

type AttachmentRow = {
  id: string;
  messageId: string;
  providerAttachmentId: string | null;
  providerPartId: string;
  filename: string;
  mimeType: string;
  contentId: string | null;
  contentDisposition: string | null;
  size: number;
  inline: boolean;
  data: Uint8Array;
};

type MessageRow = {
  id: string;
  threadId: string;
  providerMessageId: string;
  providerHistoryId: string | null;
  rfc822MessageId: string | null;
  inReplyTo: string | null;
  references: string;
  sender: string;
  recipients: string;
  subject: string;
  snippet: string;
  sentAt: number;
  sizeEstimate: number | null;
  labelIds: string[];
  headers: string;
  plainTextBody: string;
  htmlBody: string | null;
  hasAttachments: boolean;
};

type DownloadedMessage = { row: MessageRow; addresses: AddressRow[]; attachments: AttachmentRow[] };

export type DownloadedThread = {
  providerThreadId: string;
  subject: string;
  sender: string;
  snippet: string;
  lastMessageAt: number;
  unread: boolean;
  messages: DownloadedMessage[];
};

async function getPartBytes(
  store: Store,
  accountId: string,
  messageId: string,
  body: GmailPart['body'],
): Promise<Uint8Array> {
  if (body?.data) return decodeBase64UrlBytes(body.data);
  if (!body?.attachmentId) return new Uint8Array();
  const attachment = await gmailGet<{ data?: string }>(
    store,
    accountId,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(body.attachmentId)}`,
    ATTACHMENT_RESPONSE_BYTES,
  );
  return decodeBase64UrlBytes(attachment.data);
}

async function downloadMessage(
  store: Store,
  accountId: string,
  threadLocalId: string,
  message: GmailMessage,
): Promise<DownloadedMessage> {
  const sourceHeaders = message.payload?.headers ?? [];
  const messageLocalId = `${accountId}:${message.id}`;
  const downloadedParts = await mapWithConcurrency(
    collectLeafParts(message.payload),
    ATTACHMENT_CONCURRENCY,
    async ({ part, path }) => ({
      part,
      path,
      bytes: await getPartBytes(store, accountId, message.id, part.body),
    }),
  );

  const plain: string[] = [];
  const html: string[] = [];
  const attachments: AttachmentRow[] = [];

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
      providerAttachmentId: part.body?.attachmentId ?? null,
      providerPartId,
      filename: part.filename?.trim() ?? '',
      mimeType: part.mimeType ?? 'application/octet-stream',
      contentId: partContentId ?? null,
      contentDisposition: disposition || null,
      size: bytes.length || part.body?.size || 0,
      inline: Boolean(partContentId) || disposition.toLowerCase().startsWith('inline'),
      data: bytes,
    });
  }

  const joinedHtml = html.join('\n');
  const plainText = plain.join('\n').trim() || stripHtml(joinedHtml);
  // Sanitizing a long newsletter is the heaviest step; give it a turn of its own.
  if (joinedHtml) await scheduler.yield();

  return {
    row: {
      id: messageLocalId,
      threadId: threadLocalId,
      providerMessageId: message.id,
      providerHistoryId: message.historyId ?? null,
      rfc822MessageId: removeAngleBrackets(header(sourceHeaders, 'Message-ID')) || null,
      inReplyTo: removeAngleBrackets(header(sourceHeaders, 'In-Reply-To')) || null,
      references: JSON.stringify(parseReferences(header(sourceHeaders, 'References'))),
      sender: header(sourceHeaders, 'From') || 'Unknown sender',
      recipients: header(sourceHeaders, 'To'),
      subject: header(sourceHeaders, 'Subject') || '(No subject)',
      snippet: message.snippet ?? '',
      sentAt: Number(message.internalDate ?? 0),
      sizeEstimate: message.sizeEstimate ?? null,
      labelIds: message.labelIds ?? [],
      headers: JSON.stringify(sourceHeaders),
      plainTextBody: plainText,
      htmlBody: joinedHtml ? sanitizeEmailHtml(joinedHtml) : null,
      hasAttachments: attachments.length > 0,
    },
    addresses: parseAddresses(messageLocalId, sourceHeaders),
    attachments,
  };
}

export async function downloadThread(
  store: Store,
  accountId: string,
  providerThreadId: string,
): Promise<DownloadedThread> {
  const thread = await gmailGet<GmailThread>(
    store,
    accountId,
    `/threads/${encodeURIComponent(providerThreadId)}?format=full`,
    THREAD_RESPONSE_BYTES,
  );
  const threadLocalId = `${accountId}:${thread.id}`;
  const messages: DownloadedMessage[] = [];
  for (const message of thread.messages ?? []) {
    if (message.labelIds?.includes('TRASH')) continue;
    messages.push(await downloadMessage(store, accountId, threadLocalId, message));
  }
  messages.sort((left, right) => left.row.sentAt - right.row.sentAt);
  const latest = messages.at(-1);

  return {
    providerThreadId: thread.id,
    subject: latest?.row.subject ?? '(No subject)',
    sender: latest?.row.sender ?? 'Unknown sender',
    snippet: latest?.row.snippet ?? '',
    lastMessageAt: latest?.row.sentAt ?? 0,
    unread: messages.some((item) => item.row.labelIds.includes('UNREAD')),
    messages,
  };
}

/** Replaces the local copy of a thread in one transaction, keeping its local done and pinned flags. */
export async function persistThread(
  storage: Storage,
  accountId: string,
  thread: DownloadedThread,
  now: number,
): Promise<void> {
  const threadLocalId = `${accountId}:${thread.providerThreadId}`;
  const commands: SQLCommand[] = [
    {
      sql: `INSERT INTO mail_threads (id, account_id, provider_thread_id, subject, sender, snippet,
              last_message_at, unread, message_count, fully_downloaded, downloaded_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET subject = excluded.subject, sender = excluded.sender,
              snippet = excluded.snippet, last_message_at = excluded.last_message_at,
              unread = excluded.unread, message_count = excluded.message_count,
              fully_downloaded = 1, downloaded_at = excluded.downloaded_at,
              updated_at = excluded.updated_at`,
      params: [
        threadLocalId,
        accountId,
        thread.providerThreadId,
        thread.subject,
        thread.sender,
        thread.snippet,
        thread.lastMessageAt,
        thread.unread ? 1 : 0,
        thread.messages.length,
        now,
        now,
      ],
    },
    // Foreign keys cascade the old messages' addresses and attachments.
    { sql: 'DELETE FROM mail_messages WHERE thread_id = ?', params: [threadLocalId] },
  ];

  for (const { row, addresses, attachments } of thread.messages) {
    commands.push({
      sql: `INSERT INTO mail_messages (id, thread_id, account_id, provider_message_id,
              provider_history_id, rfc822_message_id, in_reply_to, "references", sender, recipients,
              subject, snippet, sent_at, size_estimate, label_ids, headers, plain_text_body,
              html_body, has_attachments, downloaded_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        row.id,
        row.threadId,
        accountId,
        row.providerMessageId,
        row.providerHistoryId,
        row.rfc822MessageId,
        row.inReplyTo,
        row.references,
        row.sender,
        row.recipients,
        row.subject,
        row.snippet,
        row.sentAt,
        row.sizeEstimate,
        JSON.stringify(row.labelIds),
        row.headers,
        row.plainTextBody,
        row.htmlBody,
        row.hasAttachments ? 1 : 0,
        now,
        now,
      ],
    });
    for (const address of addresses) {
      commands.push({
        sql: `INSERT INTO mail_message_addresses (message_id, kind, position, name, address, raw_value)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [
          address.messageId,
          address.kind,
          address.position,
          address.name,
          address.address,
          address.rawValue,
        ],
      });
    }
    for (const attachment of attachments) {
      commands.push({
        sql: `INSERT INTO mail_attachments (id, message_id, provider_attachment_id, provider_part_id,
                filename, mime_type, content_id, content_disposition, size, inline, download_state,
                data, downloaded_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?)`,
        params: [
          attachment.id,
          attachment.messageId,
          attachment.providerAttachmentId,
          attachment.providerPartId,
          attachment.filename,
          attachment.mimeType,
          attachment.contentId,
          attachment.contentDisposition,
          attachment.size,
          attachment.inline ? 1 : 0,
          attachment.data,
          now,
        ],
      });
    }
  }

  await withDb(storage, (db) => db.batch(commands));
  mailChanged();
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
  store: Store,
  storage: Storage,
  accountId: string,
  providerThreadId: string,
  now: number,
): Promise<ThreadReconcileResult> {
  let thread: DownloadedThread;
  try {
    thread = await downloadThread(store, accountId, providerThreadId);
  } catch (error) {
    if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
    await withDb(storage, (db) => removeInboxThread(db, accountId, providerThreadId));
    return { action: 'removed', messagesStored: 0, attachmentsStored: 0 };
  }

  const historyId = latestHistoryId(
    thread.messages.map((message) => message.row.providerHistoryId),
  );
  if (!thread.messages.some((message) => message.row.labelIds.includes('INBOX'))) {
    await withDb(storage, (db) => removeInboxThread(db, accountId, providerThreadId));
    return { action: 'removed', messagesStored: 0, attachmentsStored: 0, historyId };
  }

  await persistThread(storage, accountId, thread, now);
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

type GmailMessageReference = { id: string; threadId: string };
type GmailMessageList = {
  messages?: GmailMessageReference[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

/** Lists INBOX message references, paging until `limit` or the end of the inbox. */
export async function listInboxMessageRefs(
  store: Store,
  accountId: string,
  limit: number,
  onPage?: (collected: number, estimatedTotal: number | undefined) => void,
): Promise<{ refs: GmailMessageReference[]; resultSizeEstimate?: number }> {
  const refs: GmailMessageReference[] = [];
  let pageToken: string | undefined;
  let resultSizeEstimate: number | undefined;

  do {
    const query = new URLSearchParams({
      labelIds: 'INBOX',
      maxResults: String(Math.min(GMAIL_MAX_PAGE_SIZE, limit - refs.length)),
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await gmailGet<GmailMessageList>(store, accountId, `/messages?${query}`);
    const received = page.messages ?? [];
    refs.push(...received.slice(0, limit - refs.length));
    resultSizeEstimate = page.resultSizeEstimate;
    onPage?.(refs.length, resultSizeEstimate);
    if (!received.length) break;
    pageToken = page.nextPageToken;
  } while (pageToken && refs.length < limit);

  return { refs, resultSizeEstimate };
}

type InboxProgress = {
  phase: 'listing' | 'downloading';
  fraction: number;
  done: number;
  total: number;
};

async function saveAccount(storage: Storage, account: ConnectedAccount, now: number) {
  await withDb(storage, (db) =>
    db.batch([
      {
        sql: `INSERT INTO mail_accounts (id, provider, email, display_name, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, email = excluded.email,
                display_name = excluded.display_name, sort_order = excluded.sort_order,
                updated_at = excluded.updated_at`,
        params: [
          account.id,
          account.provider,
          account.email,
          account.displayName,
          account.order,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO mailbox_sync_state (account_id, mailbox, last_attempt_at, initial_sync_complete, last_error)
              VALUES (?, 'INBOX', ?, 0, NULL)
              ON CONFLICT(account_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, last_error = NULL`,
        params: [account.id, now],
      },
    ]),
  );
}

/**
 * Downloads a read-only snapshot of one Gmail account's INBOX into SQLite.
 * Only Gmail GET endpoints are called; labels and server-side mail never change.
 */
async function downloadInbox(
  store: Store,
  storage: Storage,
  account: ConnectedAccount,
  maxEmails: number,
  now: number,
  onProgress: (progress: InboxProgress) => void,
) {
  await saveAccount(storage, account, now);
  try {
    onProgress({ phase: 'listing', fraction: 0, done: 0, total: 0 });
    const { refs } = await listInboxMessageRefs(
      store,
      account.id,
      maxEmails,
      (collected, estimate) =>
        onProgress({
          phase: 'listing',
          fraction: Math.min(
            0.1,
            (collected / Math.min(maxEmails, estimate ?? maxEmails)) * 0.1 || 0,
          ),
          done: 0,
          total: 0,
        }),
    );
    const threadIds = [...new Set(refs.map((message) => message.threadId))];
    let threadsDownloaded = 0;
    let messagesStored = 0;
    let attachmentsStored = 0;
    let downloadedHistoryId: string | undefined;

    await mapWithConcurrency(threadIds, THREAD_CONCURRENCY, async (threadId) => {
      const thread = await downloadThread(store, account.id, threadId);
      await persistThread(storage, account.id, thread, now);
      downloadedHistoryId = latestHistoryId([
        downloadedHistoryId,
        ...thread.messages.map((message) => message.row.providerHistoryId),
      ]);
      threadsDownloaded += 1;
      messagesStored += thread.messages.length;
      attachmentsStored += thread.messages.reduce(
        (total, item) => total + item.attachments.length,
        0,
      );
      onProgress({
        phase: 'downloading',
        fraction: 0.1 + (threadsDownloaded / threadIds.length) * 0.9,
        done: threadsDownloaded,
        total: threadIds.length,
      });
    });

    await withDb(storage, async (db) => {
      const existing = await db.get(
        'SELECT history_id FROM mailbox_sync_state WHERE account_id = ?',
        [account.id],
      );
      await db.run(
        `UPDATE mailbox_sync_state SET next_page_token = NULL, history_id = ?,
           last_successful_sync_at = ?, initial_sync_complete = 1, last_error = NULL
         WHERE account_id = ?`,
        [
          latestHistoryId([existing ? str(existing.history_id) : undefined, downloadedHistoryId]) ??
            null,
          now,
          account.id,
        ],
      );
    });
    return { inboxEmailsSelected: refs.length, messagesStored, attachmentsStored };
  } catch (error) {
    await withDb(storage, (db) =>
      db.run('UPDATE mailbox_sync_state SET last_error = ? WHERE account_id = ?', [
        messageFor(error),
        account.id,
      ]),
    ).catch(() => undefined);
    throw error;
  }
}

export type DownloadStatus = {
  active: boolean;
  fraction: number;
  label: string;
  accountId: string;
};

const idle: DownloadStatus = { active: false, fraction: 0, label: '', accountId: '' };
/** The running download, read by a resource the view polls while it runs. */
let status: DownloadStatus = idle;

export const downloadStatus = (): DownloadStatus => status;

export type DownloadOutcome = { ok: boolean; title: string; message: string };

const formatCount = (value: number) => value.toLocaleString('en-US');

/** Downloads each chosen inbox in turn; the result is the alert the original showed. */
export async function downloadAccounts(
  store: Store,
  storage: Storage,
  accountIds: string[],
  now: number,
): Promise<DownloadOutcome> {
  if (status.active) return { ok: false, title: '', message: '' };
  const wanted = new Set(accountIds);
  const accounts = listAccounts(store).filter((account) => wanted.has(account.id));
  if (!accounts.length) return { ok: false, title: '', message: '' };
  const totals = { selected: 0, messages: 0, attachments: 0 };
  status = {
    active: true,
    fraction: 0,
    accountId: accounts[0].id,
    label: `Preparing ${accounts[0].email}…`,
  };
  try {
    for (const [index, account] of accounts.entries()) {
      const position = `(${index + 1} of ${accounts.length})`;
      status = {
        active: true,
        fraction: index / accounts.length,
        accountId: account.id,
        label: `Scanning ${account.email} ${position}`,
      };
      const result = await downloadInbox(
        store,
        storage,
        account,
        DEFAULT_INBOX_DOWNLOAD_LIMIT,
        now,
        (progress) => {
          status = {
            active: true,
            fraction: (index + progress.fraction) / accounts.length,
            accountId: account.id,
            label:
              progress.phase === 'listing'
                ? `Scanning ${account.email} ${position}`
                : `Downloading ${account.email} ${position}: ` +
                  `${formatCount(progress.done)} of ${formatCount(progress.total)} conversations`,
          };
        },
      );
      totals.selected += result.inboxEmailsSelected;
      totals.messages += result.messagesStored;
      totals.attachments += result.attachmentsStored;
    }
  } catch (error) {
    return { ok: false, title: 'Inbox download failed', message: messageFor(error) };
  } finally {
    status = idle;
  }
  return {
    ok: true,
    title: 'Inbox download complete',
    message:
      `${formatCount(totals.selected)} INBOX emails selected across ${formatCount(accounts.length)} ` +
      `${accounts.length === 1 ? 'inbox' : 'inboxes'}. ${formatCount(totals.messages)} conversation messages ` +
      `and ${formatCount(totals.attachments)} attachments are available offline.`,
  };
}
