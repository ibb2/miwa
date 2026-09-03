import { sqlite } from '../db/db';
import { inboxLayoutMode, type InboxLayoutMode } from '../mail/inbox-layout';

/** User preferences, persisted in the single-row `app_preferences` table. */
export type MailPreferences = {
  showPreviews: boolean;
  comfortableRows: boolean;
  inboxLayout: InboxLayoutMode;
};

const defaults: MailPreferences = {
  showPreviews: true,
  comfortableRows: false,
  inboxLayout: 'categorized',
};

const columns: Record<keyof MailPreferences, string> = {
  showPreviews: 'show_previews',
  comfortableRows: 'comfortable_rows',
  inboxLayout: 'inbox_layout',
};

export function loadMailPreferences(): MailPreferences {
  const row = sqlite.getFirstSync<{
    show_previews: number;
    comfortable_rows: number;
    inbox_layout: string;
  }>('SELECT show_previews, comfortable_rows, inbox_layout FROM app_preferences WHERE id = 1');

  if (!row) return defaults;
  return {
    showPreviews: Boolean(row.show_previews),
    comfortableRows: Boolean(row.comfortable_rows),
    inboxLayout: inboxLayoutMode(row.inbox_layout),
  };
}

export function saveMailPreference<K extends keyof MailPreferences>(
  key: K,
  value: MailPreferences[K],
): void {
  sqlite.runSync(
    `UPDATE app_preferences SET ${columns[key]} = ? WHERE id = 1`,
    typeof value === 'boolean' ? (value ? 1 : 0) : value,
  );
}
