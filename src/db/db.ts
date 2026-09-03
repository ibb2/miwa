import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { migrateDatabase } from './migrations';

export const sqlite = openDatabaseSync('db.db');
migrateDatabase(sqlite);

export const db = drizzle(sqlite);

/**
 * Clears every user-created row while preserving the migrated schema. Gmail
 * credentials live in the Keychain rather than SQLite, so connected accounts
 * remain available for a fresh download after this reset.
 */
export function clearLocalDatabase(): void {
  try {
    sqlite.execSync(`
      BEGIN IMMEDIATE;
      DELETE FROM mail_attachments;
      DELETE FROM mail_message_addresses;
      DELETE FROM mail_messages;
      DELETE FROM mail_threads;
      DELETE FROM mailbox_sync_state;
      DELETE FROM mail_accounts;
      DELETE FROM gatekeeper_senders;
      DELETE FROM gatekeeper_settings;
      DELETE FROM app_preferences;
      INSERT INTO gatekeeper_settings (
        id,
        activated_at
      ) VALUES (1, unixepoch() * 1000);
      INSERT INTO app_preferences (
        id,
        show_previews,
        comfortable_rows,
        show_account_labels,
        inbox_layout
      ) VALUES (1, 1, 0, 1, 'categorized');
      COMMIT;
    `);
  } catch (error) {
    try {
      sqlite.execSync('ROLLBACK;');
    } catch {
      // Preserve the original database error when no transaction is active.
    }
    throw error;
  }
}
