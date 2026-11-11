import { sqlite } from '../db/db';

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
  /** Per-account overrides; missing accounts default to notified. */
  notifiedAccountIds: Record<string, boolean>;
};

type PreferencesRow = {
  show_previews: number;
  notifications_enabled: number;
  notifications_sound: number;
  notifications_badge: number;
  notifications_show_preview: number;
  notifications_dnd_enabled: number;
  notifications_dnd_start_hour: number;
  notifications_dnd_end_hour: number;
  notifications_baselined: number;
};

const DEFAULT_PREFERENCES: MailPreferences = {
  showPreviews: true,
  notificationsEnabled: false,
  notificationsSound: true,
  notificationsBadge: true,
  notificationsShowPreview: true,
  notificationsDndEnabled: false,
  notificationsDndStartHour: 22,
  notificationsDndEndHour: 7,
  notificationsBaselined: false,
  notifiedAccountIds: {},
};

function clampHour(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23
    ? value
    : fallback;
}

export function loadMailPreferences(): MailPreferences {
  const row = sqlite.getFirstSync<PreferencesRow>(
    'SELECT show_previews, notifications_enabled, notifications_sound, notifications_badge, ' +
      'notifications_show_preview, notifications_dnd_enabled, notifications_dnd_start_hour, ' +
      'notifications_dnd_end_hour, notifications_baselined FROM app_preferences WHERE id = 1',
  );
  if (!row) return { ...DEFAULT_PREFERENCES, notifiedAccountIds: {} };
  return {
    showPreviews: Boolean(row.show_previews),
    notificationsEnabled: Boolean(row.notifications_enabled),
    notificationsSound: Boolean(row.notifications_sound),
    notificationsBadge: Boolean(row.notifications_badge),
    notificationsShowPreview: Boolean(row.notifications_show_preview),
    notificationsDndEnabled: Boolean(row.notifications_dnd_enabled),
    notificationsDndStartHour: clampHour(row.notifications_dnd_start_hour, 22),
    notificationsDndEndHour: clampHour(row.notifications_dnd_end_hour, 7),
    notificationsBaselined: Boolean(row.notifications_baselined),
    notifiedAccountIds: loadNotifiedAccountIds(),
  };
}

function loadNotifiedAccountIds(): Record<string, boolean> {
  try {
    const rows = sqlite.getAllSync<{ account_id: string; enabled: number }>(
      'SELECT account_id, enabled FROM notification_account_prefs',
    );
    return Object.fromEntries(rows.map((item) => [item.account_id, Boolean(item.enabled)]));
  } catch {
    return {};
  }
}

export function saveShowPreviews(value: boolean): void {
  sqlite.runSync('UPDATE app_preferences SET show_previews = ? WHERE id = 1', value ? 1 : 0);
}

export type NotificationPreferencePatch = Partial<
  Pick<
    MailPreferences,
    | 'notificationsEnabled'
    | 'notificationsSound'
    | 'notificationsBadge'
    | 'notificationsShowPreview'
    | 'notificationsDndEnabled'
    | 'notificationsDndStartHour'
    | 'notificationsDndEndHour'
    | 'notificationsBaselined'
  >
>;

const NOTIFICATION_COLUMNS: Record<keyof NotificationPreferencePatch, string> = {
  notificationsEnabled: 'notifications_enabled',
  notificationsSound: 'notifications_sound',
  notificationsBadge: 'notifications_badge',
  notificationsShowPreview: 'notifications_show_preview',
  notificationsDndEnabled: 'notifications_dnd_enabled',
  notificationsDndStartHour: 'notifications_dnd_start_hour',
  notificationsDndEndHour: 'notifications_dnd_end_hour',
  notificationsBaselined: 'notifications_baselined',
};

export function saveNotificationPreferences(patch: NotificationPreferencePatch): void {
  const columns = (Object.keys(patch) as Array<keyof NotificationPreferencePatch>).filter(
    (key) => patch[key] !== undefined,
  );
  if (columns.length === 0) return;
  const sets = columns.map((key) => `${NOTIFICATION_COLUMNS[key]} = ?`).join(', ');
  const values = columns.map((key) => {
    const value = patch[key];
    return typeof value === 'boolean' ? (value ? 1 : 0) : (value as number);
  });
  sqlite.runSync(`UPDATE app_preferences SET ${sets} WHERE id = 1`, ...values);
}

/** Missing accounts default to notified so new inboxes banner without a settings visit. */
export function isAccountNotified(preferences: MailPreferences, accountId: string): boolean {
  return preferences.notifiedAccountIds[accountId] ?? true;
}

export function saveAccountNotified(accountId: string, enabled: boolean): void {
  sqlite.runSync(
    'INSERT INTO notification_account_prefs (account_id, enabled) VALUES (?, ?) ' +
      'ON CONFLICT(account_id) DO UPDATE SET enabled = excluded.enabled',
    accountId,
    enabled ? 1 : 0,
  );
}

/** True while quiet hours are active. Overnight windows (e.g. 22-7) wrap midnight. */
export function isWithinQuietHours(preferences: MailPreferences, at: Date = new Date()): boolean {
  if (!preferences.notificationsDndEnabled) return false;
  const hour = at.getHours();
  const { notificationsDndStartHour: start, notificationsDndEndHour: end } = preferences;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
