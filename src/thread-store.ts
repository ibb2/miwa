import type { SQLCommand } from '../app.contract.d.ts';
import { bool, bytes, json, num, optStr, str, type Db } from './db';
import { parseAddresses, type GmailHeader } from './gmail-content';
import { mailCategoryForLabels } from './inbox-tabs';
import { inlineImageHtml } from './message-images';
import type { MailThreadDetail, MailThreadSummary } from './types';

/** Bumped by every local write, so the thread list is rebuilt only when mail changed. */
let revision = 0;
let cached: { revision: number; threads: MailThreadSummary[] } | null = null;

export function mailChanged() {
  revision += 1;
}

const yieldEvery = async (index: number) => {
  if (index > 0 && index % 400 === 0) await scheduler.yield();
};

/** Loads every downloaded thread, newest first, hiding Gatekeeper-blocked senders. */
export async function loadThreads(db: Db): Promise<MailThreadSummary[]> {
  if (cached?.revision === revision) return cached.threads;
  const startedAt = revision;
  const rows = await db.all(
    `SELECT id, account_id, provider_thread_id, sender, subject, snippet, last_message_at,
       unread, done, pinned, message_count
     FROM mail_threads WHERE fully_downloaded = 1
     ORDER BY last_message_at DESC, id DESC`,
  );
  const messageRows = await db.all(
    `SELECT thread_id, label_ids, substr(plain_text_body, 1, 2000) AS body, subject, sender,
       has_attachments
     FROM mail_messages ORDER BY sent_at DESC`,
  );
  const blockedRows = await db.all(
    `SELECT m.thread_id, m.label_ids FROM mail_messages m
     JOIN mail_message_addresses a ON a.message_id = m.id
     JOIN gatekeeper_senders g ON lower(trim(a.address)) = g.email
     WHERE a.kind = 'from' AND g.status = 'blocked'`,
  );
  const attachmentRows = await db.all(
    `SELECT m.thread_id, a.filename FROM mail_attachments a
     JOIN mail_messages m ON a.message_id = m.id WHERE a.inline = 0`,
  );

  const blockedThreadIds = new Set(
    blockedRows
      .filter((row) => json<string[]>(row.label_ids, []).includes('INBOX'))
      .map((row) => str(row.thread_id)),
  );
  // Rows arrive newest first, so the first label set seen per thread is latest.
  const categoryByThreadId = new Map<string, MailThreadSummary['category']>();
  const previewByThreadId = new Map<string, string>();
  const attachmentThreadIds = new Set<string>();
  const searchByThread = new Map<string, NonNullable<MailThreadSummary['searchFields']>>();
  for (const [index, message] of messageRows.entries()) {
    await yieldEvery(index);
    const threadId = str(message.thread_id);
    const fields = searchByThread.get(threadId) ?? {
      subject: '',
      sender: '',
      body: '',
      attachment: '',
    };
    const bodySlice = str(message.body);
    fields.subject += `\n${str(message.subject)}`;
    fields.sender += `\n${str(message.sender)}`;
    if (fields.body.length < 8000) fields.body += `\n${bodySlice}`;
    searchByThread.set(threadId, fields);
    if (!categoryByThreadId.has(threadId)) {
      categoryByThreadId.set(threadId, mailCategoryForLabels(json(message.label_ids, [])));
    }
    if (!previewByThreadId.has(threadId)) {
      const preview = bodySlice.replace(/\s+/g, ' ').trim();
      if (preview) previewByThreadId.set(threadId, preview.slice(0, 500));
    }
    if (bool(message.has_attachments)) attachmentThreadIds.add(threadId);
  }

  for (const attachment of attachmentRows) {
    const fields = searchByThread.get(str(attachment.thread_id));
    if (fields) fields.attachment += `\n${str(attachment.filename)}`;
  }

  const threads = rows
    .filter((row) => !blockedThreadIds.has(str(row.id)))
    .map((row): MailThreadSummary => {
      const id = str(row.id);
      return {
        accountId: str(row.account_id),
        searchFields: searchByThread.get(id),
        threadId: str(row.provider_thread_id),
        sender: str(row.sender),
        subject: str(row.subject),
        snippet: str(row.snippet),
        preview: previewByThreadId.get(id) ?? str(row.snippet),
        receivedAt: num(row.last_message_at),
        unread: bool(row.unread),
        done: bool(row.done),
        pinned: bool(row.pinned),
        messageCount: num(row.message_count),
        hasAttachments: attachmentThreadIds.has(id),
        category: categoryByThreadId.get(id) ?? 'primary',
      };
    });
  if (startedAt === revision) cached = { revision, threads };
  return threads;
}

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/** Loads one downloaded conversation with its messages and attachments. */
export async function loadThreadDetail(
  db: Db,
  accountId: string,
  providerThreadId: string,
): Promise<MailThreadDetail> {
  const thread = await db.get(
    'SELECT id, subject FROM mail_threads WHERE account_id = ? AND provider_thread_id = ?',
    [accountId, providerThreadId],
  );
  if (!thread) throw new Error('This downloaded conversation is no longer available.');

  const messages = await db.all(
    `SELECT id, provider_message_id, headers, sender, recipients, sent_at, subject,
       plain_text_body, html_body
     FROM mail_messages WHERE thread_id = ? ORDER BY sent_at ASC`,
    [str(thread.id)],
  );
  const messageIds = messages.map((message) => str(message.id));
  const inList = placeholders(messageIds.length);
  const attachments = messageIds.length
    ? await db.all(
        `SELECT id, message_id, filename, mime_type, size FROM mail_attachments
         WHERE message_id IN (${inList}) AND download_state = 'complete' AND inline = 0`,
        messageIds,
      )
    : [];
  const inlineImages = messageIds.length
    ? await db.all(
        `SELECT message_id, content_id, mime_type, data FROM mail_attachments
         WHERE message_id IN (${inList}) AND inline = 1 AND download_state = 'complete'`,
        messageIds,
      )
    : [];

  const parsedAddresses = new Map(
    messages.map((message) => [
      str(message.id),
      parseAddresses(str(message.id), json<GmailHeader[]>(message.headers, [])),
    ]),
  );
  const emails = [
    ...new Set(
      [...parsedAddresses.values()].flatMap((addresses) =>
        addresses.flatMap((address) => (address.address ? [address.address.toLowerCase()] : [])),
      ),
    ),
  ];
  const knownNames = emails.length
    ? await db.all(
        `SELECT address, name FROM mail_message_addresses
         WHERE lower(address) IN (${placeholders(emails.length)}) ORDER BY id DESC`,
        emails,
      )
    : [];
  const namesByEmail = new Map<string, string>();
  for (const item of knownNames) {
    const address = optStr(item.address)?.toLowerCase();
    const name = optStr(item.name);
    if (address && name?.trim() && !name.includes('@') && !namesByEmail.has(address)) {
      namesByEmail.set(address, name);
    }
  }

  return {
    accountId,
    threadId: providerThreadId,
    subject: str(thread.subject),
    messages: messages.map((message) => {
      const id = str(message.id);
      return {
        id,
        providerMessageId: str(message.provider_message_id),
        addresses: (parsedAddresses.get(id) ?? []).map((address) => ({
          kind: address.kind,
          address: address.address,
          rawValue: address.rawValue,
          name:
            address.name && !address.name.includes('@')
              ? address.name
              : (namesByEmail.get(address.address?.toLowerCase() ?? '') ?? address.name),
        })),
        sender: str(message.sender),
        recipients: str(message.recipients),
        sentAt: num(message.sent_at),
        subject: str(message.subject),
        plainText: str(message.plain_text_body),
        safeHtml: inlineImageHtml(
          optStr(message.html_body) ?? undefined,
          inlineImages
            .filter((image) => str(image.message_id) === id)
            .map((image) => ({
              contentId: optStr(image.content_id),
              mimeType: str(image.mime_type),
              data: bytes(image.data),
            })),
        ),
        attachments: attachments
          .filter((attachment) => str(attachment.message_id) === id)
          .map((attachment) => ({
            id: str(attachment.id),
            filename: str(attachment.filename),
            mimeType: str(attachment.mime_type),
            size: num(attachment.size),
          })),
      };
    }),
  };
}

async function findThreadId(db: Db, accountId: string, providerThreadId: string) {
  const thread = await db.get(
    'SELECT id FROM mail_threads WHERE account_id = ? AND provider_thread_id = ?',
    [accountId, providerThreadId],
  );
  if (!thread) throw new Error('This downloaded conversation is no longer available.');
  return str(thread.id);
}

/** Mirrors a Gmail read/unread change in the local database. */
export async function setThreadReadState(
  db: Db,
  accountId: string,
  providerThreadId: string,
  unread: boolean,
  now: number,
): Promise<void> {
  const threadId = await findThreadId(db, accountId, providerThreadId);
  const messages = await db.all('SELECT id, label_ids FROM mail_messages WHERE thread_id = ?', [
    threadId,
  ]);
  const commands: SQLCommand[] = [
    {
      sql: 'UPDATE mail_threads SET unread = ?, updated_at = ? WHERE id = ?',
      params: [unread ? 1 : 0, now, threadId],
    },
  ];
  for (const message of messages) {
    const current = json<string[]>(message.label_ids, []);
    const labelIds = unread
      ? [...new Set([...current, 'UNREAD'])]
      : current.filter((label) => label !== 'UNREAD');
    commands.push({
      sql: 'UPDATE mail_messages SET label_ids = ?, updated_at = ? WHERE id = ?',
      params: [JSON.stringify(labelIds), now, str(message.id)],
    });
  }
  await db.batch(commands);
  mailChanged();
}

/** Pins are local-only; Gmail has no equivalent label to keep in sync. */
export async function setThreadPinnedState(
  db: Db,
  accountId: string,
  providerThreadId: string,
  pinned: boolean,
  now: number,
): Promise<void> {
  const threadId = await findThreadId(db, accountId, providerThreadId);
  await db.run('UPDATE mail_threads SET pinned = ?, updated_at = ? WHERE id = ?', [
    pinned ? 1 : 0,
    now,
    threadId,
  ]);
  mailChanged();
}

export async function setThreadDoneState(
  db: Db,
  accountId: string,
  providerThreadId: string,
  done: boolean,
  now: number,
): Promise<void> {
  const threadId = await findThreadId(db, accountId, providerThreadId);
  await db.run('UPDATE mail_threads SET done = ?, updated_at = ? WHERE id = ?', [
    done ? 1 : 0,
    now,
    threadId,
  ]);
  mailChanged();
}

/** Removes a thread from the local inbox (cascades to messages and attachments). */
export async function removeInboxThread(
  db: Db,
  accountId: string,
  providerThreadId: string,
): Promise<void> {
  await db.run('DELETE FROM mail_threads WHERE account_id = ? AND provider_thread_id = ?', [
    accountId,
    providerThreadId,
  ]);
  mailChanged();
}

/** Removes only the trashed message and updates its conversation without losing local flags. */
export async function removeTrashedMessage(
  db: Db,
  accountId: string,
  providerMessageId: string,
  now: number,
): Promise<void> {
  const message = await db.get(
    'SELECT id, thread_id FROM mail_messages WHERE account_id = ? AND provider_message_id = ?',
    [accountId, providerMessageId],
  );
  if (!message) return;
  const threadId = str(message.thread_id);
  const remaining = await db.all(
    `SELECT label_ids, subject, sender, snippet, sent_at FROM mail_messages
     WHERE thread_id = ? AND id != ? ORDER BY sent_at DESC`,
    [threadId, str(message.id)],
  );
  const labels = remaining.map((item) => json<string[]>(item.label_ids, []));
  const commands: SQLCommand[] = [
    { sql: 'DELETE FROM mail_messages WHERE id = ?', params: [str(message.id)] },
  ];
  if (!labels.some((item) => item.includes('INBOX'))) {
    commands.push({ sql: 'DELETE FROM mail_threads WHERE id = ?', params: [threadId] });
  } else {
    const latest = remaining[0];
    commands.push({
      sql: `UPDATE mail_threads SET subject = ?, sender = ?, snippet = ?, last_message_at = ?,
              message_count = ?, unread = ?, updated_at = ? WHERE id = ?`,
      params: [
        str(latest.subject),
        str(latest.sender),
        str(latest.snippet),
        num(latest.sent_at),
        remaining.length,
        labels.some((item) => item.includes('UNREAD')) ? 1 : 0,
        now,
        threadId,
      ],
    });
  }
  await db.batch(commands);
  mailChanged();
}
