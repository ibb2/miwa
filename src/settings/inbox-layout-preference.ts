import { sqlite } from '../db/db';
import { inboxLayoutMode, type InboxLayoutMode } from '../mail/inbox-layout';

export function loadInboxLayoutMode(): InboxLayoutMode {
  const row = sqlite.getFirstSync<{ inbox_layout: string }>(`
    SELECT inbox_layout
    FROM app_preferences
    WHERE id = 1
  `);
  return inboxLayoutMode(row?.inbox_layout);
}

export function saveInboxLayoutMode(mode: InboxLayoutMode): void {
  sqlite.runSync(
    'UPDATE app_preferences SET inbox_layout = ? WHERE id = 1',
    mode,
  );
}
