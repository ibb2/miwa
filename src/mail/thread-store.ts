import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db/db';
import {
  gatekeeperSenders,
  mailAttachments,
  mailMessageAddresses,
  mailMessages,
  mailThreads,
} from '../db/schema';
import { inlineImageHtml } from './message-images';
import { parseAddresses } from './gmail-content';
import { mailCategoryForLabels } from './inbox-tabs';
import type { MailThreadDetail, MailThreadSummary } from './types';

/** Loads every downloaded thread, newest first, hiding Gatekeeper-blocked senders. */
export async function loadThreads(): Promise<MailThreadSummary[]> {
  const [rows, messageLabelRows, blockedMessageRows] = await Promise.all([
    db
      .select({
        id: mailThreads.id,
        accountId: mailThreads.accountId,
        providerThreadId: mailThreads.providerThreadId,
        sender: mailThreads.sender,
        subject: mailThreads.subject,
        snippet: mailThreads.snippet,
        lastMessageAt: mailThreads.lastMessageAt,
        unread: mailThreads.unread,
        done: mailThreads.done,
        pinned: mailThreads.pinned,
        messageCount: mailThreads.messageCount,
      })
      .from(mailThreads)
      .where(eq(mailThreads.fullyDownloaded, true))
      .orderBy(desc(mailThreads.lastMessageAt), desc(mailThreads.id)),
    db
      .select({
        threadId: mailMessages.threadId,
        labelIds: mailMessages.labelIds,
        sentAt: mailMessages.sentAt,
        hasAttachments: mailMessages.hasAttachments,
      })
      .from(mailMessages)
      .orderBy(desc(mailMessages.sentAt)),
    db
      .select({ threadId: mailMessages.threadId, labelIds: mailMessages.labelIds })
      .from(mailMessages)
      .innerJoin(mailMessageAddresses, eq(mailMessageAddresses.messageId, mailMessages.id))
      .innerJoin(
        gatekeeperSenders,
        sql`lower(trim(${mailMessageAddresses.address})) = ${gatekeeperSenders.email}`,
      )
      .where(and(eq(mailMessageAddresses.kind, 'from'), eq(gatekeeperSenders.status, 'blocked'))),
  ]);

  const blockedThreadIds = new Set(
    blockedMessageRows
      .filter((message) => message.labelIds.includes('INBOX'))
      .map((message) => message.threadId),
  );
  // Rows arrive newest first, so the first label set seen per thread is latest.
  const categoryByThreadId = new Map<string, MailThreadSummary['category']>();
  const attachmentThreadIds = new Set<string>();
  for (const message of messageLabelRows) {
    if (!categoryByThreadId.has(message.threadId)) {
      categoryByThreadId.set(message.threadId, mailCategoryForLabels(message.labelIds));
    }
    if (message.hasAttachments) attachmentThreadIds.add(message.threadId);
  }

  return rows
    .filter((row) => !blockedThreadIds.has(row.id))
    .map((row) => ({
      accountId: row.accountId,
      threadId: row.providerThreadId,
      sender: row.sender,
      subject: row.subject,
      snippet: row.snippet,
      receivedAt: row.lastMessageAt,
      unread: row.unread,
      done: row.done,
      pinned: row.pinned,
      messageCount: row.messageCount,
      hasAttachments: attachmentThreadIds.has(row.id),
      category: categoryByThreadId.get(row.id) ?? 'primary',
    }));
}

/** Loads one downloaded conversation with its messages and attachments. */
export async function loadThreadDetail(
  accountId: string,
  providerThreadId: string,
): Promise<MailThreadDetail> {
  const thread = await db
    .select({ id: mailThreads.id, subject: mailThreads.subject })
    .from(mailThreads)
    .where(
      and(eq(mailThreads.accountId, accountId), eq(mailThreads.providerThreadId, providerThreadId)),
    )
    .get();

  if (!thread) {
    throw new Error('This downloaded conversation is no longer available.');
  }

  const messages = await db
    .select({
      id: mailMessages.id,
      providerMessageId: mailMessages.providerMessageId,
      headers: mailMessages.headers,
      sender: mailMessages.sender,
      recipients: mailMessages.recipients,
      sentAt: mailMessages.sentAt,
      subject: mailMessages.subject,
      plainTextBody: mailMessages.plainTextBody,
      htmlBody: mailMessages.htmlBody,
    })
    .from(mailMessages)
    .where(eq(mailMessages.threadId, thread.id))
    .orderBy(asc(mailMessages.sentAt));

  const messageIds = messages.map((message) => message.id);
  const attachments = messageIds.length
    ? await db
        .select({
          id: mailAttachments.id,
          messageId: mailAttachments.messageId,
          filename: mailAttachments.filename,
          mimeType: mailAttachments.mimeType,
          size: mailAttachments.size,
        })
        .from(mailAttachments)
        .where(
          and(
            inArray(mailAttachments.messageId, messageIds),
            eq(mailAttachments.downloadState, 'complete'),
            eq(mailAttachments.inline, false),
          ),
        )
    : [];

  const inlineImages = messageIds.length
    ? await db
        .select({
          messageId: mailAttachments.messageId,
          contentId: mailAttachments.contentId,
          mimeType: mailAttachments.mimeType,
          data: mailAttachments.data,
        })
        .from(mailAttachments)
        .where(
          and(
            inArray(mailAttachments.messageId, messageIds),
            eq(mailAttachments.inline, true),
            eq(mailAttachments.downloadState, 'complete'),
          ),
        )
    : [];

  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const list = attachmentsByMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.messageId, list);
  }

  const parsedAddresses = new Map(
    messages.map((message) => [message.id, parseAddresses(message.id, message.headers)]),
  );
  const emails = [
    ...new Set(
      [...parsedAddresses.values()].flatMap((addresses) =>
        addresses.flatMap((address) => (address.address ? [address.address.toLowerCase()] : [])),
      ),
    ),
  ];
  const knownNames = emails.length
    ? await db
        .select({ address: mailMessageAddresses.address, name: mailMessageAddresses.name })
        .from(mailMessageAddresses)
        .where(inArray(sql`lower(${mailMessageAddresses.address})`, emails))
        .orderBy(desc(mailMessageAddresses.id))
    : [];
  const namesByEmail = new Map<string, string>();
  for (const item of knownNames) {
    if (
      item.address &&
      item.name?.trim() &&
      !item.name.includes('@') &&
      !namesByEmail.has(item.address.toLowerCase())
    )
      namesByEmail.set(item.address.toLowerCase(), item.name);
  }

  return {
    accountId,
    threadId: providerThreadId,
    subject: thread.subject,
    messages: messages.map((message) => ({
      id: message.id,
      providerMessageId: message.providerMessageId,
      addresses: (parsedAddresses.get(message.id) ?? []).map((address) => ({
        ...address,
        name:
          address.name && !address.name.includes('@')
            ? address.name
            : (namesByEmail.get(address.address?.toLowerCase() ?? '') ?? address.name),
      })),
      sender: message.sender,
      recipients: message.recipients,
      sentAt: message.sentAt,
      subject: message.subject,
      plainText: message.plainTextBody,
      safeHtml: inlineImageHtml(
        message.htmlBody ?? undefined,
        inlineImages.filter((image) => image.messageId === message.id),
      ),
      attachments: (attachmentsByMessage.get(message.id) ?? []).map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })),
    })),
  };
}

async function findThreadId(accountId: string, providerThreadId: string): Promise<string> {
  const thread = await db
    .select({ id: mailThreads.id })
    .from(mailThreads)
    .where(
      and(eq(mailThreads.accountId, accountId), eq(mailThreads.providerThreadId, providerThreadId)),
    )
    .get();
  if (!thread) throw new Error('This downloaded conversation is no longer available.');
  return thread.id;
}

/** Mirrors a Gmail read/unread change in the local database. */
export async function setThreadReadState(
  accountId: string,
  providerThreadId: string,
  unread: boolean,
): Promise<void> {
  const threadId = await findThreadId(accountId, providerThreadId);
  const messages = await db
    .select({ id: mailMessages.id, labelIds: mailMessages.labelIds })
    .from(mailMessages)
    .where(eq(mailMessages.threadId, threadId));

  const updatedAt = Date.now();
  db.transaction((transaction) => {
    transaction
      .update(mailThreads)
      .set({ unread, updatedAt })
      .where(eq(mailThreads.id, threadId))
      .run();
    for (const message of messages) {
      const labelIds = unread
        ? [...new Set([...message.labelIds, 'UNREAD'])]
        : message.labelIds.filter((label) => label !== 'UNREAD');
      transaction
        .update(mailMessages)
        .set({ labelIds, updatedAt })
        .where(eq(mailMessages.id, message.id))
        .run();
    }
  });
}

/** Pins are local-only; Gmail has no equivalent label to keep in sync. */
export async function setThreadPinnedState(
  accountId: string,
  providerThreadId: string,
  pinned: boolean,
): Promise<void> {
  const threadId = await findThreadId(accountId, providerThreadId);
  await db
    .update(mailThreads)
    .set({ pinned, updatedAt: Date.now() })
    .where(eq(mailThreads.id, threadId));
}

/** Removes a thread from the local inbox (cascades to messages and attachments). */
export async function removeInboxThread(
  accountId: string,
  providerThreadId: string,
): Promise<void> {
  await db
    .delete(mailThreads)
    .where(
      and(eq(mailThreads.accountId, accountId), eq(mailThreads.providerThreadId, providerThreadId)),
    );
}

export async function setThreadDoneState(
  accountId: string,
  providerThreadId: string,
  done: boolean,
): Promise<void> {
  const threadId = await findThreadId(accountId, providerThreadId);
  await db
    .update(mailThreads)
    .set({ done, updatedAt: Date.now() })
    .where(eq(mailThreads.id, threadId));
}

/** Removes only the trashed message and updates its conversation without losing local flags. */
export async function removeTrashedMessage(
  accountId: string,
  providerMessageId: string,
): Promise<void> {
  db.transaction((transaction) => {
    const message = transaction
      .select()
      .from(mailMessages)
      .where(
        and(
          eq(mailMessages.accountId, accountId),
          eq(mailMessages.providerMessageId, providerMessageId),
        ),
      )
      .get();
    if (!message) return;
    transaction.delete(mailMessages).where(eq(mailMessages.id, message.id)).run();
    const remaining = transaction
      .select()
      .from(mailMessages)
      .where(eq(mailMessages.threadId, message.threadId))
      .orderBy(desc(mailMessages.sentAt))
      .all();
    if (!remaining.some((item) => item.labelIds.includes('INBOX'))) {
      transaction.delete(mailThreads).where(eq(mailThreads.id, message.threadId)).run();
      return;
    }
    const latest = remaining[0];
    transaction
      .update(mailThreads)
      .set({
        subject: latest.subject,
        sender: latest.sender,
        snippet: latest.snippet,
        lastMessageAt: latest.sentAt,
        messageCount: remaining.length,
        unread: remaining.some((item) => item.labelIds.includes('UNREAD')),
        updatedAt: Date.now(),
      })
      .where(eq(mailThreads.id, message.threadId))
      .run();
  });
}
