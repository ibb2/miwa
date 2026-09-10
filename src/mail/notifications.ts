import {
  addNotificationResponseListener,
  clearDeliveredNotifications,
  getNotificationPermission,
  postNewMailNotification,
  setAppBadgeCount,
  supportsLocalNotifications,
  type NotificationResponse,
} from '../../modules/native-local-notifications/src';
import type { MailPreferences } from '../settings/preferences';
import { isAccountNotified, isWithinQuietHours } from '../settings/preferences';
import type { MailThreadSummary } from './types';

/** Only threads received recently can banner; bulk downloads of old mail stay silent. */
const NEW_MAIL_RECENCY_MS = 15 * 60 * 1_000;
/** Above this many new threads, post one summary instead of individual banners. */
const MAX_INDIVIDUAL_NOTIFICATIONS = 3;

export type NotifiableThread = Pick<
  MailThreadSummary,
  'accountId' | 'threadId' | 'sender' | 'subject' | 'snippet' | 'receivedAt'
>;

export function threadNotificationId(
  thread: Pick<NotifiableThread, 'accountId' | 'threadId'>,
): string {
  return `${thread.accountId}:${thread.threadId}`;
}

/** Display name only: drops the `<address>` part macOS would wrap onto its own line. */
export function senderDisplayName(sender: string): string {
  const bracket = sender.lastIndexOf('<');
  if (bracket >= 0) {
    const name = sender
      .slice(0, bracket)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (name) return name;
    const bracketed = sender
      .slice(bracket + 1)
      .replace(/>.*$/, '')
      .trim();
    if (bracketed) return bracketed;
  } else if (sender.trim()) {
    return sender.trim();
  }
  // Nameless senders fall back to the bare address, never the brackets.
  return sender.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*/)?.[0] ?? 'Unknown sender';
}

function threadTitle(thread: NotifiableThread, showPreview: boolean): string {
  return showPreview ? senderDisplayName(thread.sender) : 'New mail';
}

function threadBody(
  thread: NotifiableThread,
  accountEmail: string | undefined,
  showPreview: boolean,
): string {
  if (!showPreview) return accountEmail ? `New mail in ${accountEmail}` : 'You have new mail.';
  const subject = thread.subject || '(No subject)';
  return thread.snippet ? `${subject}\n${thread.snippet}` : subject;
}

/**
 * Posts banners for freshly arrived threads. Returns the posted count.
 * Every gate lives here so both windows share one policy: master toggle,
 * OS permission, quiet hours, per-account toggles, recency, and batching.
 */
export async function notifyNewMailThreads(
  threads: readonly NotifiableThread[],
  preferences: MailPreferences,
  accountEmailById: ReadonlyMap<string, string>,
  now: number = Date.now(),
): Promise<number> {
  if (!preferences.notificationsEnabled || threads.length === 0) return 0;
  if (!supportsLocalNotifications()) return 0;
  if (isWithinQuietHours(preferences, new Date(now))) return 0;
  if ((await getNotificationPermission()) !== 'authorized') return 0;

  const fresh = threads.filter(
    (thread) =>
      now - thread.receivedAt >= 0 &&
      now - thread.receivedAt <= NEW_MAIL_RECENCY_MS &&
      isAccountNotified(preferences, thread.accountId),
  );
  if (fresh.length === 0) return 0;

  try {
    if (fresh.length > MAX_INDIVIDUAL_NOTIFICATIONS) {
      const perAccount = new Map<string, number>();
      for (const thread of fresh) {
        perAccount.set(thread.accountId, (perAccount.get(thread.accountId) ?? 0) + 1);
      }
      const where = [...perAccount.entries()]
        .map(([accountId, count]) => `${count} in ${accountEmailById.get(accountId) ?? 'an inbox'}`)
        .join(', ');
      await postNewMailNotification({
        identifier: `summary:${now}`,
        title: `${fresh.length} new emails`,
        body: where,
        sound: preferences.notificationsSound,
        accountId: fresh[0].accountId,
        threadId: fresh[0].threadId,
      });
      return fresh.length;
    }
    for (const thread of fresh) {
      await postNewMailNotification({
        identifier: threadNotificationId(thread),
        title: threadTitle(thread, preferences.notificationsShowPreview),
        body: threadBody(
          thread,
          accountEmailById.get(thread.accountId),
          preferences.notificationsShowPreview,
        ),
        sound: preferences.notificationsSound,
        accountId: thread.accountId,
        threadId: thread.threadId,
      });
    }
    return fresh.length;
  } catch {
    return 0;
  }
}

/** Syncs the Dock badge with the unread count. Clears it when disabled. */
export async function syncNotificationBadge(
  unreadCount: number,
  preferences: MailPreferences,
): Promise<void> {
  if (!supportsLocalNotifications()) return;
  try {
    if (!preferences.notificationsEnabled || !preferences.notificationsBadge) {
      await setAppBadgeCount(0);
      return;
    }
    if ((await getNotificationPermission()) !== 'authorized') return;
    await setAppBadgeCount(unreadCount);
  } catch {
    // Badge sync must never break the mail UI.
  }
}

export async function dismissDeliveredNotifications(): Promise<void> {
  if (!supportsLocalNotifications()) return;
  try {
    await clearDeliveredNotifications();
  } catch {
    // Best effort only.
  }
}

export function subscribeNotificationResponses(
  listener: (response: NotificationResponse) => void,
): { remove: () => void } {
  return addNotificationResponseListener(listener);
}
