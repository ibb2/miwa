import { bool, num, str, type Db } from './db';

export type MailPreferences = {
  showPreviews: boolean;
  notificationsEnabled: boolean;
  notificationsSound: boolean;
  notificationsBadge: boolean;
  notificationsShowPreview: boolean;
  notificationsDndEnabled: boolean;
  /** Inclusive start hour (0-23) for quiet hours. */
  notificationsDndStartHour: number;
  /** Exclusive end hour (0-23) for quiet hours. */
  notificationsDndEndHour: number;
  /** True once the first thread list has been seen, so history never banners at once. */
  notificationsBaselined: boolean;
  /** Accounts whose notifications are turned off; missing accounts default to notified. */
  mutedAccountIds: string[];
};

function clampHour(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
}

export async function loadPreferences(db: Db): Promise<MailPreferences> {
  const row = await db.get('SELECT * FROM app_preferences WHERE id = 1');
  const muted = await db.all('SELECT account_id FROM notification_account_prefs WHERE enabled = 0');
  return {
    showPreviews: row ? bool(row.show_previews) : true,
    notificationsEnabled: row ? bool(row.notifications_enabled) : false,
    notificationsSound: row ? bool(row.notifications_sound) : true,
    notificationsBadge: row ? bool(row.notifications_badge) : true,
    notificationsShowPreview: row ? bool(row.notifications_show_preview) : true,
    notificationsDndEnabled: row ? bool(row.notifications_dnd_enabled) : false,
    notificationsDndStartHour: clampHour(num(row?.notifications_dnd_start_hour ?? 22), 22),
    notificationsDndEndHour: clampHour(num(row?.notifications_dnd_end_hour ?? 7), 7),
    notificationsBaselined: row ? bool(row.notifications_baselined) : false,
    mutedAccountIds: muted.map((item) => str(item.account_id)),
  };
}

const COLUMNS = {
  showPreviews: 'show_previews',
  notificationsEnabled: 'notifications_enabled',
  notificationsSound: 'notifications_sound',
  notificationsBadge: 'notifications_badge',
  notificationsShowPreview: 'notifications_show_preview',
  notificationsDndEnabled: 'notifications_dnd_enabled',
  notificationsDndStartHour: 'notifications_dnd_start_hour',
  notificationsDndEndHour: 'notifications_dnd_end_hour',
  notificationsBaselined: 'notifications_baselined',
} as const;

export type PreferenceKey = keyof typeof COLUMNS;

export function isPreferenceKey(key: string): key is PreferenceKey {
  return key in COLUMNS;
}

export async function savePreference(db: Db, key: PreferenceKey, value: number) {
  const stored = key.endsWith('Hour') ? clampHour(Math.round(value), 0) : value ? 1 : 0;
  await db.run(`UPDATE app_preferences SET ${COLUMNS[key]} = ? WHERE id = 1`, [stored]);
}

export function isAccountNotified(preferences: MailPreferences, accountId: string): boolean {
  return !preferences.mutedAccountIds.includes(accountId);
}

export async function saveAccountNotified(db: Db, accountId: string, enabled: boolean) {
  await db.run(
    `INSERT INTO notification_account_prefs (account_id, enabled) VALUES (?, ?)
     ON CONFLICT(account_id) DO UPDATE SET enabled = excluded.enabled`,
    [accountId, enabled ? 1 : 0],
  );
}

/**
 * True while quiet hours are active. Overnight windows (e.g. 22-7) wrap
 * midnight. `utcOffset` is the zone's offset in minutes east of UTC.
 */
export function isWithinQuietHours(preferences: MailPreferences, now: number, utcOffset: number) {
  if (!preferences.notificationsDndEnabled) return false;
  const hour = new Date(now + utcOffset * 60_000).getUTCHours();
  const { notificationsDndStartHour: start, notificationsDndEndHour: end } = preferences;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
