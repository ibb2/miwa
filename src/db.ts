import type { Database, SQLCommand, SQLValue, Storage } from '../app.contract.d.ts';

export const DATABASE = 'app:/data/miwa.db';

export type Row = Record<string, SQLValue>;

/** The schema the React Native app reached after its last migration. */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS mail_accounts (
    id text PRIMARY KEY NOT NULL,
    provider text NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    avatar_mime_type text,
    avatar_data blob,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mail_accounts_provider_email_unique ON mail_accounts (provider, email)`,
  `CREATE TABLE IF NOT EXISTS mail_threads (
    id text PRIMARY KEY NOT NULL,
    account_id text NOT NULL REFERENCES mail_accounts(id) ON DELETE cascade,
    provider_thread_id text NOT NULL,
    subject text NOT NULL,
    sender text NOT NULL,
    snippet text DEFAULT '' NOT NULL,
    last_message_at integer NOT NULL,
    unread integer DEFAULT 0 NOT NULL,
    done integer DEFAULT 0 NOT NULL,
    pinned integer DEFAULT 0 NOT NULL,
    message_count integer DEFAULT 0 NOT NULL,
    fully_downloaded integer DEFAULT 0 NOT NULL,
    downloaded_at integer,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mail_threads_account_provider_id_unique ON mail_threads (account_id, provider_thread_id)`,
  `CREATE INDEX IF NOT EXISTS mail_threads_account_date_idx ON mail_threads (account_id, last_message_at)`,
  `CREATE INDEX IF NOT EXISTS mail_threads_date_idx ON mail_threads (last_message_at)`,
  `CREATE TABLE IF NOT EXISTS mail_messages (
    id text PRIMARY KEY NOT NULL,
    thread_id text NOT NULL REFERENCES mail_threads(id) ON DELETE cascade,
    account_id text NOT NULL REFERENCES mail_accounts(id) ON DELETE cascade,
    provider_message_id text NOT NULL,
    provider_history_id text,
    rfc822_message_id text,
    in_reply_to text,
    "references" text DEFAULT '[]' NOT NULL,
    sender text NOT NULL,
    recipients text DEFAULT '' NOT NULL,
    subject text NOT NULL,
    snippet text DEFAULT '' NOT NULL,
    sent_at integer NOT NULL,
    size_estimate integer,
    label_ids text DEFAULT '[]' NOT NULL,
    headers text DEFAULT '[]' NOT NULL,
    plain_text_body text DEFAULT '' NOT NULL,
    html_body text,
    has_attachments integer DEFAULT 0 NOT NULL,
    downloaded_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mail_messages_account_provider_id_unique ON mail_messages (account_id, provider_message_id)`,
  `CREATE INDEX IF NOT EXISTS mail_messages_thread_date_idx ON mail_messages (thread_id, sent_at)`,
  `CREATE INDEX IF NOT EXISTS mail_messages_account_date_idx ON mail_messages (account_id, sent_at)`,
  `CREATE TABLE IF NOT EXISTS mail_message_addresses (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    message_id text NOT NULL REFERENCES mail_messages(id) ON DELETE cascade,
    kind text NOT NULL,
    position integer NOT NULL,
    name text,
    address text,
    raw_value text NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mail_message_addresses_kind_position_unique ON mail_message_addresses (message_id, kind, position)`,
  `CREATE INDEX IF NOT EXISTS mail_message_addresses_message_idx ON mail_message_addresses (message_id)`,
  `CREATE TABLE IF NOT EXISTS mail_attachments (
    id text PRIMARY KEY NOT NULL,
    message_id text NOT NULL REFERENCES mail_messages(id) ON DELETE cascade,
    provider_attachment_id text,
    provider_part_id text,
    filename text DEFAULT '' NOT NULL,
    mime_type text NOT NULL,
    content_id text,
    content_disposition text,
    size integer DEFAULT 0 NOT NULL,
    inline integer DEFAULT 0 NOT NULL,
    download_state text DEFAULT 'pending' NOT NULL,
    data blob,
    downloaded_at integer
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mail_attachments_message_part_unique ON mail_attachments (message_id, provider_part_id)`,
  `CREATE INDEX IF NOT EXISTS mail_attachments_message_idx ON mail_attachments (message_id)`,
  `CREATE INDEX IF NOT EXISTS mail_attachments_content_id_idx ON mail_attachments (content_id)`,
  `CREATE TABLE IF NOT EXISTS mailbox_sync_state (
    account_id text PRIMARY KEY NOT NULL REFERENCES mail_accounts(id) ON DELETE cascade,
    mailbox text DEFAULT 'INBOX' NOT NULL,
    next_page_token text,
    history_id text,
    last_attempt_at integer,
    last_successful_sync_at integer,
    initial_sync_complete integer DEFAULT 0 NOT NULL,
    last_error text
  )`,
  `CREATE TABLE IF NOT EXISTS app_preferences (
    id integer PRIMARY KEY NOT NULL,
    show_previews integer DEFAULT 1 NOT NULL,
    notifications_enabled integer DEFAULT 0 NOT NULL,
    notifications_sound integer DEFAULT 1 NOT NULL,
    notifications_badge integer DEFAULT 1 NOT NULL,
    notifications_show_preview integer DEFAULT 1 NOT NULL,
    notifications_dnd_enabled integer DEFAULT 0 NOT NULL,
    notifications_dnd_start_hour integer DEFAULT 22 NOT NULL,
    notifications_dnd_end_hour integer DEFAULT 7 NOT NULL,
    notifications_baselined integer DEFAULT 0 NOT NULL
  )`,
  `INSERT OR IGNORE INTO app_preferences (id) VALUES (1)`,
  `CREATE TABLE IF NOT EXISTS notification_account_prefs (
    account_id text PRIMARY KEY NOT NULL,
    enabled integer DEFAULT 1 NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gatekeeper_settings (
    id integer PRIMARY KEY NOT NULL,
    activated_at integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gatekeeper_senders (
    email text PRIMARY KEY NOT NULL,
    display_name text DEFAULT '' NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    first_seen_at integer NOT NULL,
    last_seen_at integer NOT NULL,
    message_count integer DEFAULT 1 NOT NULL,
    updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS gatekeeper_senders_status_last_seen_idx ON gatekeeper_senders (status, last_seen_at)`,
];

export class Db {
  constructor(private readonly database: Database) {}

  async all(sql: string, params: SQLValue[] = []): Promise<Row[]> {
    const { columns, rows } = await this.database.query(sql, params);
    return rows.map((values) => {
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = values[index];
      });
      return row;
    });
  }

  async get(sql: string, params: SQLValue[] = []): Promise<Row | undefined> {
    return (await this.all(sql, params))[0];
  }

  run(sql: string, params: SQLValue[] = []) {
    return this.database.execute(sql, params);
  }

  batch(commands: SQLCommand[]) {
    return commands.length ? this.database.transaction(commands) : Promise.resolve([]);
  }
}

let opened: Promise<Db> | null = null;

async function open(storage: Storage): Promise<Db> {
  const database = await storage.sqlite.open(DATABASE);
  try {
    await database.transaction(SCHEMA.map((sql) => ({ sql })));
  } catch (error) {
    await database.close();
    throw error;
  }
  return new Db(database);
}

/**
 * The one shared connection. An open database locks its file, and the inbox
 * download runs beside every other read, so the app keeps a single handle and
 * the module's storage queue orders each statement.
 */
export async function withDb<T>(storage: Storage, work: (db: Db) => Promise<T>): Promise<T> {
  opened ??= open(storage).catch((error) => {
    opened = null;
    throw error;
  });
  return work(await opened);
}

export const num = (value: SQLValue | undefined): number =>
  typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : 0;
export const str = (value: SQLValue | undefined): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);
export const optStr = (value: SQLValue | undefined): string | null =>
  value == null ? null : str(value);
export const bool = (value: SQLValue | undefined): boolean => num(value) !== 0;
export const json = <T>(value: SQLValue | undefined, fallback: T): T => {
  try {
    return typeof value === 'string' ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};
export const bytes = (value: SQLValue | undefined): Uint8Array | null =>
  value instanceof Uint8Array ? value : null;

/**
 * Clears every user-created row while preserving the schema. Gmail sessions
 * live in the secret store rather than SQLite, so connected accounts remain
 * available for a fresh download after this reset.
 */
export function clearLocalDatabase(db: Db, now: number) {
  return db.batch(
    [
      'DELETE FROM mail_attachments',
      'DELETE FROM mail_message_addresses',
      'DELETE FROM mail_messages',
      'DELETE FROM mail_threads',
      'DELETE FROM mailbox_sync_state',
      'DELETE FROM mail_accounts',
      'DELETE FROM gatekeeper_senders',
      'DELETE FROM gatekeeper_settings',
      'DELETE FROM notification_account_prefs',
      'DELETE FROM app_preferences',
      'INSERT INTO app_preferences (id) VALUES (1)',
    ]
      .map((sql): SQLCommand => ({ sql }))
      .concat([
        { sql: 'INSERT INTO gatekeeper_settings (id, activated_at) VALUES (1, ?)', params: [now] },
      ]),
  );
}
