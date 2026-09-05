import { sql } from 'drizzle-orm';
import { blob, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export type StoredMailHeader = { name: string; value: string };
export type StoredMailReference = { messageId: string };

const now = sql`(unixepoch() * 1000)`;

/**
 * The non-secret portion of a connected account. OAuth credentials remain in
 * the platform Keychain.
 */
export const mailAccounts = sqliteTable(
  'mail_accounts',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: ['gmail'] }).notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    avatarMimeType: text('avatar_mime_type'),
    avatarData: blob('avatar_data', { mode: 'buffer' }).$type<Uint8Array>(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'number' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(now),
  },
  (table) => [uniqueIndex('mail_accounts_provider_email_unique').on(table.provider, table.email)],
);

/**
 * One row per provider thread. `id` is an app-local, account-scoped key
 * (`${accountId}:${providerThreadId}`) since Gmail thread IDs are only unique
 * inside an account.
 */
export const mailThreads = sqliteTable(
  'mail_threads',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    providerThreadId: text('provider_thread_id').notNull(),
    subject: text('subject').notNull(),
    sender: text('sender').notNull(),
    snippet: text('snippet').notNull().default(''),
    lastMessageAt: integer('last_message_at', { mode: 'number' }).notNull(),
    unread: integer('unread', { mode: 'boolean' }).notNull().default(false),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    messageCount: integer('message_count').notNull().default(0),
    /** True once every message body and inline resource has been persisted. */
    fullyDownloaded: integer('fully_downloaded', { mode: 'boolean' }).notNull().default(false),
    downloadedAt: integer('downloaded_at', { mode: 'number' }),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(now),
  },
  (table) => [
    uniqueIndex('mail_threads_account_provider_id_unique').on(
      table.accountId,
      table.providerThreadId,
    ),
    index('mail_threads_account_date_idx').on(table.accountId, table.lastMessageAt),
    index('mail_threads_date_idx').on(table.lastMessageAt),
  ],
);

/**
 * A complete offline-renderable message. The JSON headers retain information
 * the UI does not currently surface (Reply-To, List-Unsubscribe, and so on).
 */
export const mailMessages = sqliteTable(
  'mail_messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => mailThreads.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    providerMessageId: text('provider_message_id').notNull(),
    providerHistoryId: text('provider_history_id'),
    rfc822MessageId: text('rfc822_message_id'),
    inReplyTo: text('in_reply_to'),
    references: text('references', { mode: 'json' })
      .$type<StoredMailReference[]>()
      .notNull()
      .default([]),
    sender: text('sender').notNull(),
    recipients: text('recipients').notNull().default(''),
    subject: text('subject').notNull(),
    snippet: text('snippet').notNull().default(''),
    sentAt: integer('sent_at', { mode: 'number' }).notNull(),
    sizeEstimate: integer('size_estimate'),
    labelIds: text('label_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    headers: text('headers', { mode: 'json' }).$type<StoredMailHeader[]>().notNull().default([]),
    plainTextBody: text('plain_text_body').notNull().default(''),
    /** Sanitized HTML; remote images are stripped before persistence. */
    htmlBody: text('html_body'),
    hasAttachments: integer('has_attachments', { mode: 'boolean' }).notNull().default(false),
    downloadedAt: integer('downloaded_at', { mode: 'number' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(now),
  },
  (table) => [
    uniqueIndex('mail_messages_account_provider_id_unique').on(
      table.accountId,
      table.providerMessageId,
    ),
    index('mail_messages_thread_date_idx').on(table.threadId, table.sentAt),
    index('mail_messages_account_date_idx').on(table.accountId, table.sentAt),
  ],
);

/** Parsed address headers make offline recipient display and reply possible. */
export const mailMessageAddresses = sqliteTable(
  'mail_message_addresses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id')
      .notNull()
      .references(() => mailMessages.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['from', 'sender', 'replyTo', 'to', 'cc', 'bcc'] }).notNull(),
    position: integer('position').notNull(),
    name: text('name'),
    address: text('address'),
    rawValue: text('raw_value').notNull(),
  },
  (table) => [
    uniqueIndex('mail_message_addresses_kind_position_unique').on(
      table.messageId,
      table.kind,
      table.position,
    ),
    index('mail_message_addresses_message_idx').on(table.messageId),
  ],
);

/**
 * Regular attachments and inline MIME resources. `data` holds the actual
 * content (not a Gmail URL) so it remains available offline.
 */
export const mailAttachments = sqliteTable(
  'mail_attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => mailMessages.id, { onDelete: 'cascade' }),
    providerAttachmentId: text('provider_attachment_id'),
    providerPartId: text('provider_part_id'),
    filename: text('filename').notNull().default(''),
    mimeType: text('mime_type').notNull(),
    contentId: text('content_id'),
    contentDisposition: text('content_disposition'),
    size: integer('size').notNull().default(0),
    inline: integer('inline', { mode: 'boolean' }).notNull().default(false),
    downloadState: text('download_state', { enum: ['pending', 'complete', 'failed'] })
      .notNull()
      .default('pending'),
    data: blob('data', { mode: 'buffer' }).$type<Uint8Array>(),
    downloadedAt: integer('downloaded_at', { mode: 'number' }),
  },
  (table) => [
    uniqueIndex('mail_attachments_message_part_unique').on(table.messageId, table.providerPartId),
    index('mail_attachments_message_idx').on(table.messageId),
    index('mail_attachments_content_id_idx').on(table.contentId),
  ],
);

/** Gmail history cursor per account; lets sync resume incrementally. */
export const mailboxSyncState = sqliteTable('mailbox_sync_state', {
  accountId: text('account_id')
    .primaryKey()
    .references(() => mailAccounts.id, { onDelete: 'cascade' }),
  mailbox: text('mailbox', { enum: ['INBOX'] })
    .notNull()
    .default('INBOX'),
  nextPageToken: text('next_page_token'),
  historyId: text('history_id'),
  lastAttemptAt: integer('last_attempt_at', { mode: 'number' }),
  lastSuccessfulSyncAt: integer('last_successful_sync_at', { mode: 'number' }),
  initialSyncComplete: integer('initial_sync_complete', { mode: 'boolean' })
    .notNull()
    .default(false),
  lastError: text('last_error'),
});

/**
 * Gatekeeper only considers messages received after the feature first ran, so
 * an app restart never treats the existing mailbox as new.
 */
export const gatekeeperSettings = sqliteTable('gatekeeper_settings', {
  id: integer('id').primaryKey(),
  activatedAt: integer('activated_at', { mode: 'number' }).notNull(),
});

/** Sender decisions are local to Miwa and never mutate Gmail. */
export const gatekeeperSenders = sqliteTable(
  'gatekeeper_senders',
  {
    email: text('email').primaryKey(),
    displayName: text('display_name').notNull().default(''),
    status: text('status', { enum: ['pending', 'approved', 'blocked'] })
      .notNull()
      .default('pending'),
    firstSeenAt: integer('first_seen_at', { mode: 'number' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'number' }).notNull(),
    messageCount: integer('message_count').notNull().default(1),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(now),
  },
  (table) => [index('gatekeeper_senders_status_last_seen_idx').on(table.status, table.lastSeenAt)],
);

export type NewMailMessageRow = typeof mailMessages.$inferInsert;
export type NewMailMessageAddressRow = typeof mailMessageAddresses.$inferInsert;
export type NewMailAttachmentRow = typeof mailAttachments.$inferInsert;
