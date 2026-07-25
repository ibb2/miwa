import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import db from '../db/db';
import {
  mailAttachments,
  mailMessages,
  mailThreads,
} from '../db/schema';
import type {
  MailThreadDetail,
  MailThreadSummary,
} from './types';

export async function loadDownloadedThreads(): Promise<MailThreadSummary[]> {
  const rows = await db
    .select({
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
    .orderBy(desc(mailThreads.lastMessageAt), desc(mailThreads.id));

  return rows.map((row) => ({
    provider: 'gmail',
    accountId: row.accountId,
    threadId: row.providerThreadId,
    sender: row.sender,
    subject: row.subject,
    snippet: row.snippet,
    receivedAt: row.lastMessageAt,
    unread: row.unread,
    messageCount: row.messageCount,
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
