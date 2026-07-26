import { sqlite } from './db';

/**
 * Clears every user-created row while preserving the migrated schema.
 *
 * Gmail credentials are stored in Keychain rather than SQLite, so connected
 * accounts remain available for a fresh download after this reset.
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
      DELETE FROM app_preferences;
      INSERT INTO app_preferences (
        id,
        show_previews,
        comfortable_rows,
        show_account_labels
      ) VALUES (1, 1, 0, 1);
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
