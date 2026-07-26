import { sqlite } from '../db/db';

export type MailPreferences = {
  showPreviews: boolean;
  comfortableRows: boolean;
  showAccountLabels: boolean;
};

export const defaultMailPreferences: MailPreferences = {
  showPreviews: true,
  comfortableRows: false,
  showAccountLabels: true,
};

type MailPreferencesRow = {
  show_previews: number;
  comfortable_rows: number;
  show_account_labels: number;
};

const preferenceColumns: Record<keyof MailPreferences, string> = {
  showPreviews: 'show_previews',
  comfortableRows: 'comfortable_rows',
  showAccountLabels: 'show_account_labels',
};

export function loadMailPreferences(): MailPreferences {
  const row = sqlite.getFirstSync<MailPreferencesRow>(`
    SELECT show_previews, comfortable_rows, show_account_labels
    FROM app_preferences
    WHERE id = 1
  `);

  if (!row) return defaultMailPreferences;

  return {
    showPreviews: Boolean(row.show_previews),
    comfortableRows: Boolean(row.comfortable_rows),
    showAccountLabels: Boolean(row.show_account_labels),
  };
}

export function saveMailPreference(
  key: keyof MailPreferences,
  value: boolean,
): void {
  sqlite.runSync(
    `UPDATE app_preferences SET ${preferenceColumns[key]} = ? WHERE id = 1`,
    value ? 1 : 0,
  );
}
