import { eq } from 'drizzle-orm';

import { db } from '../db/db';
import {
  mailAttachments,
  mailMessageAddresses,
  mailMessages,
  mailThreads,
  type NewMailAttachmentRow,
  type NewMailMessageRow,
} from '../db/schema';
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

import { removeInboxThread } from './thread-store';

const THREAD_CONCURRENCY = 4;
const ATTACHMENT_CONCURRENCY = 4;

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

export async function downloadThread(
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
  const messages = await mapWithConcurrency(
    (thread.messages ?? []).filter((message) => !message.labelIds?.includes('TRASH')),
    THREAD_CONCURRENCY,
    (message) => downloadMessage(accountId, threadLocalId, message, signal),
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
export async function persistThread(accountId: string, thread: DownloadedThread): Promise<void> {
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

    // Foreign keys cascade the old messages' addresses and attachments.
    transaction.delete(mailMessages).where(eq(mailMessages.threadId, threadLocalId)).run();

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
    await removeInboxThread(accountId, providerThreadId);
    return { action: 'removed', messagesStored: 0, attachmentsStored: 0 };
  }

  const historyId = latestHistoryId(
    thread.messages.map((message) => message.row.providerHistoryId),
  );
  const remainsInInbox = thread.messages.some((message) =>
    (message.row.labelIds ?? []).includes('INBOX'),
  );
  if (!remainsInInbox) {
    await removeInboxThread(accountId, providerThreadId);
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
