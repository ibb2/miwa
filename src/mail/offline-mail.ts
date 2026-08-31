import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import db from '../db/db';
import {
  gatekeeperSenders,
  mailAttachments,
  mailMessageAddresses,
  mailMessages,
  mailThreads,
} from '../db/schema';
import type {
  MailThreadDetail,
  MailThreadSummary,
} from './types';
import { mailCategoryForLabels } from './mail-category';

export async function loadDownloadedThreads(): Promise<MailThreadSummary[]> {
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
      })
      .from(mailMessages)
      .orderBy(desc(mailMessages.sentAt)),
    db
      .select({
        threadId: mailMessages.threadId,
        labelIds: mailMessages.labelIds,
      })
      .from(mailMessages)
      .innerJoin(
        mailMessageAddresses,
        eq(mailMessageAddresses.messageId, mailMessages.id),
      )
      .innerJoin(
        gatekeeperSenders,
        sql`lower(trim(${mailMessageAddresses.address})) = ${gatekeeperSenders.email}`,
      )
      .where(and(
        eq(mailMessageAddresses.kind, 'from'),
        eq(gatekeeperSenders.status, 'blocked'),
      )),
  ]);
  const blockedThreadIds = new Set(
    blockedMessageRows
      .filter((message) => message.labelIds.includes('INBOX'))
      .map((message) => message.threadId),
  );
  const categoryByThreadId = new Map<string, MailThreadSummary['category']>();
  for (const message of messageLabelRows) {
    if (!categoryByThreadId.has(message.threadId)) {
      categoryByThreadId.set(message.threadId, mailCategoryForLabels(message.labelIds));
    }
  }

  return rows
    .filter((row) => !blockedThreadIds.has(row.id))
    .map((row) => ({
      provider: 'gmail',
      accountId: row.accountId,
      threadId: row.providerThreadId,
      sender: row.sender,
      subject: row.subject,
      snippet: row.snippet,
      receivedAt: row.lastMessageAt,
      unread: row.unread,
      messageCount: row.messageCount,
      category: categoryByThreadId.get(row.id) ?? 'primary',
    }));
}

export async function loadDownloadedThreadDetail(
  accountId: string,
  providerThreadId: string,
): Promise<MailThreadDetail> {
  const thread = await db
    .select({
      id: mailThreads.id,
      subject: mailThreads.subject,
    })
    .from(mailThreads)
    .where(and(
      eq(mailThreads.accountId, accountId),
      eq(mailThreads.providerThreadId, providerThreadId),
    ))
    .get();

  if (!thread) {
    throw new Error('This downloaded conversation is no longer available.');
  }

  const messages = await db
    .select({
      id: mailMessages.id,
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
        .where(and(
          inArray(mailAttachments.messageId, messageIds),
          eq(mailAttachments.downloadState, 'complete'),
        ))
    : [];

  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const existing = attachmentsByMessage.get(attachment.messageId) ?? [];
    existing.push(attachment);
    attachmentsByMessage.set(attachment.messageId, existing);
  }

  return {
    provider: 'gmail',
    accountId,
    threadId: providerThreadId,
    subject: thread.subject,
    messages: messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      recipients: message.recipients,
      sentAt: message.sentAt,
      subject: message.subject,
      plainText: message.plainTextBody,
      safeHtml: message.htmlBody ?? undefined,
      attachments: (attachmentsByMessage.get(message.id) ?? []).map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })),
    })),
  };
}

export async function setDownloadedThreadReadState(
  accountId: string,
  providerThreadId: string,
  unread: boolean,
): Promise<void> {
  const thread = await db
    .select({ id: mailThreads.id })
    .from(mailThreads)
    .where(and(
      eq(mailThreads.accountId, accountId),
      eq(mailThreads.providerThreadId, providerThreadId),
    ))
    .get();
  if (!thread) throw new Error('This downloaded conversation is no longer available.');

  const messages = await db
    .select({ id: mailMessages.id, labelIds: mailMessages.labelIds })
    .from(mailMessages)
    .where(eq(mailMessages.threadId, thread.id));
  const updatedAt = Date.now();
  db.transaction((transaction) => {
    transaction
      .update(mailThreads)
      .set({ unread, updatedAt })
      .where(eq(mailThreads.id, thread.id))
      .run();
    for (const message of messages) {
      const labels = unread
        ? Array.from(new Set([...message.labelIds, 'UNREAD']))
        : message.labelIds.filter((label) => label !== 'UNREAD');
      transaction
        .update(mailMessages)
        .set({ labelIds: labels, updatedAt })
        .where(eq(mailMessages.id, message.id))
        .run();
    }
  });
}

export async function removeDownloadedInboxThread(
  accountId: string,
  providerThreadId: string,
): Promise<void> {
  await db
    .delete(mailThreads)
    .where(and(
      eq(mailThreads.accountId, accountId),
      eq(mailThreads.providerThreadId, providerThreadId),
    ));
}
