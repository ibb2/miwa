import { sqlite } from '../db/db';

export type MailPreferences = { showPreviews: boolean };

export function loadMailPreferences(): MailPreferences {
  const row = sqlite.getFirstSync<{ show_previews: number }>(
    'SELECT show_previews FROM app_preferences WHERE id = 1',
  );
  return { showPreviews: row ? Boolean(row.show_previews) : true };
}

export function saveShowPreviews(value: boolean): void {
  sqlite.runSync('UPDATE app_preferences SET show_previews = ? WHERE id = 1', value ? 1 : 0);
}
