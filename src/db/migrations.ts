import type { SQLiteDatabase } from 'expo-sqlite';

type DatabaseVersionRow = {
  user_version: number;
};

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS "mail_accounts" (
        "id" text PRIMARY KEY NOT NULL,
        "provider" text NOT NULL,
        "email" text NOT NULL,
        "display_name" text NOT NULL,
        "avatar_mime_type" text,
        "avatar_data" blob,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "created_at" integer DEFAULT (unixepoch() * 1000) NOT NULL,
        "updated_at" integer DEFAULT (unixepoch() * 1000) NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "mail_accounts_provider_email_unique"
        ON "mail_accounts" ("provider", "email");

      CREATE TABLE IF NOT EXISTS "mail_threads" (
        "id" text PRIMARY KEY NOT NULL,
        "account_id" text NOT NULL,
        "provider_thread_id" text NOT NULL,
        "subject" text NOT NULL,
        "sender" text NOT NULL,
        "snippet" text DEFAULT '' NOT NULL,
        "last_message_at" integer NOT NULL,
        "unread" integer DEFAULT 0 NOT NULL,
        "message_count" integer DEFAULT 0 NOT NULL,
        "fully_downloaded" integer DEFAULT 0 NOT NULL,
        "downloaded_at" integer,
        "updated_at" integer DEFAULT (unixepoch() * 1000) NOT NULL,
        FOREIGN KEY ("account_id") REFERENCES "mail_accounts" ("id") ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "mail_threads_account_provider_id_unique"
        ON "mail_threads" ("account_id", "provider_thread_id");
      CREATE INDEX IF NOT EXISTS "mail_threads_account_date_idx"
        ON "mail_threads" ("account_id", "last_message_at");
      CREATE INDEX IF NOT EXISTS "mail_threads_date_idx"
        ON "mail_threads" ("last_message_at");

      CREATE TABLE IF NOT EXISTS "mail_messages" (
        "id" text PRIMARY KEY NOT NULL,
        "thread_id" text NOT NULL,
        "account_id" text NOT NULL,
        "provider_message_id" text NOT NULL,
        "provider_history_id" text,
        "rfc822_message_id" text,
        "in_reply_to" text,
        "references" text DEFAULT '[]' NOT NULL,
        "sender" text NOT NULL,
        "recipients" text DEFAULT '' NOT NULL,
        "subject" text NOT NULL,
        "snippet" text DEFAULT '' NOT NULL,
        "sent_at" integer NOT NULL,
        "size_estimate" integer,
        "label_ids" text DEFAULT '[]' NOT NULL,
        "headers" text DEFAULT '[]' NOT NULL,
        "plain_text_body" text DEFAULT '' NOT NULL,
        "html_body" text,
        "has_attachments" integer DEFAULT 0 NOT NULL,
        "downloaded_at" integer DEFAULT (unixepoch() * 1000) NOT NULL,
        "updated_at" integer DEFAULT (unixepoch() * 1000) NOT NULL,
        FOREIGN KEY ("thread_id") REFERENCES "mail_threads" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("account_id") REFERENCES "mail_accounts" ("id") ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "mail_messages_account_provider_id_unique"
        ON "mail_messages" ("account_id", "provider_message_id");
      CREATE INDEX IF NOT EXISTS "mail_messages_thread_date_idx"
        ON "mail_messages" ("thread_id", "sent_at");
      CREATE INDEX IF NOT EXISTS "mail_messages_account_date_idx"
        ON "mail_messages" ("account_id", "sent_at");

      CREATE TABLE IF NOT EXISTS "mail_message_addresses" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "message_id" text NOT NULL,
        "kind" text NOT NULL,
        "position" integer NOT NULL,
        "name" text,
        "address" text,
        "raw_value" text NOT NULL,
        FOREIGN KEY ("message_id") REFERENCES "mail_messages" ("id") ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "mail_message_addresses_kind_position_unique"
        ON "mail_message_addresses" ("message_id", "kind", "position");
      CREATE INDEX IF NOT EXISTS "mail_message_addresses_message_idx"
        ON "mail_message_addresses" ("message_id");

      CREATE TABLE IF NOT EXISTS "mail_attachments" (
        "id" text PRIMARY KEY NOT NULL,
        "message_id" text NOT NULL,
        "provider_attachment_id" text,
        "provider_part_id" text,
        "filename" text DEFAULT '' NOT NULL,
        "mime_type" text NOT NULL,
        "content_id" text,
        "content_disposition" text,
        "size" integer DEFAULT 0 NOT NULL,
        "inline" integer DEFAULT 0 NOT NULL,
        "download_state" text DEFAULT 'pending' NOT NULL,
        "data" blob,
        "downloaded_at" integer,
        FOREIGN KEY ("message_id") REFERENCES "mail_messages" ("id") ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "mail_attachments_message_part_unique"
        ON "mail_attachments" ("message_id", "provider_part_id");
      CREATE INDEX IF NOT EXISTS "mail_attachments_message_idx"
        ON "mail_attachments" ("message_id");
      CREATE INDEX IF NOT EXISTS "mail_attachments_content_id_idx"
        ON "mail_attachments" ("content_id");

      CREATE TABLE IF NOT EXISTS "mailbox_sync_state" (
        "account_id" text PRIMARY KEY NOT NULL,
        "mailbox" text DEFAULT 'INBOX' NOT NULL,
        "next_page_token" text,
        "history_id" text,
        "last_attempt_at" integer,
        "last_successful_sync_at" integer,
        "initial_sync_complete" integer DEFAULT 0 NOT NULL,
        "last_error" text,
        FOREIGN KEY ("account_id") REFERENCES "mail_accounts" ("id") ON DELETE CASCADE
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS "app_preferences" (
        "id" integer PRIMARY KEY NOT NULL CHECK ("id" = 1),
        "show_previews" integer DEFAULT 1 NOT NULL,
        "comfortable_rows" integer DEFAULT 0 NOT NULL,
        "show_account_labels" integer DEFAULT 1 NOT NULL
      );

      INSERT OR IGNORE INTO "app_preferences" (
        "id",
        "show_previews",
        "comfortable_rows",
        "show_account_labels"
      ) VALUES (1, 1, 0, 1);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS "gatekeeper_settings" (
        "id" integer PRIMARY KEY NOT NULL CHECK ("id" = 1),
        "activated_at" integer NOT NULL
      );

      INSERT OR IGNORE INTO "gatekeeper_settings" (
        "id",
        "activated_at"
      ) VALUES (1, unixepoch() * 1000);

      CREATE TABLE IF NOT EXISTS "gatekeeper_senders" (
        "email" text PRIMARY KEY NOT NULL,
        "display_name" text DEFAULT '' NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "first_seen_at" integer NOT NULL,
        "last_seen_at" integer NOT NULL,
        "message_count" integer DEFAULT 1 NOT NULL,
        "updated_at" integer DEFAULT (unixepoch() * 1000) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "gatekeeper_senders_status_last_seen_idx"
        ON "gatekeeper_senders" ("status", "last_seen_at");
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE "mail_threads"
        ADD COLUMN "pinned" integer DEFAULT 0 NOT NULL;
    `,
  },
] as const;

export function migrateDatabase(database: SQLiteDatabase): void {
  database.execSync('PRAGMA foreign_keys = ON;');
  database.execSync('PRAGMA journal_mode = WAL;');

  const currentVersion =
    database.getFirstSync<DatabaseVersionRow>('PRAGMA user_version')?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    try {
      database.execSync(`
        BEGIN IMMEDIATE;
        ${migration.sql}
        PRAGMA user_version = ${migration.version};
        COMMIT;
      `);
    } catch (error) {
      try {
        database.execSync('ROLLBACK;');
      } catch {
        // The migration error remains the useful failure when no transaction began.
      }
      throw error;
    }
  }
}
