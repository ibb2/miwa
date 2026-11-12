import { notificationStatus, setAppBadge, showNotification } from '@exact/notifications';
import type { Store } from '../app.contract.d.ts';
import { listAccounts } from './accounts';
import type { Db } from './db';
import {
  isAccountNotified,
  isWithinQuietHours,
  loadPreferences,
  savePreference,
  type MailPreferences,
} from './preferences';
import type { MailThreadSummary } from './types';

/** Only threads received recently can banner; bulk downloads of old mail stay silent. */
const NEW_MAIL_RECENCY_MS = 15 * 60 * 1_000;
/** Above this many new threads, post one summary instead of individual banners. */
const MAX_INDIVIDUAL_NOTIFICATIONS = 3;

type NotifiableThread = Pick<
  MailThreadSummary,
  'accountId' | 'threadId' | 'sender' | 'subject' | 'snippet' | 'receivedAt'
>;

const threadKey = (thread: Pick<NotifiableThread, 'accountId' | 'threadId'>) =>
  `${thread.accountId}:${thread.threadId}`;

/** The conversation route a click opens. */
const threadRoute = (thread: Pick<NotifiableThread, 'accountId' | 'threadId'>) =>
  `/mail/${thread.accountId}/${thread.threadId}`;

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

async function permitted(): Promise<boolean> {
  try {
    const status = await notificationStatus({});
    return status.available && status.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Posts banners for freshly arrived threads. Every gate lives here: master
 * toggle, OS permission, quiet hours, per-account toggles, recency, batching.
 */
async function notifyNewMailThreads(
  threads: readonly NotifiableThread[],
  preferences: MailPreferences,
  accountEmailById: ReadonlyMap<string, string>,
  now: number,
  utcOffset: number,
) {
  if (!preferences.notificationsEnabled || threads.length === 0) return;
  if (isWithinQuietHours(preferences, now, utcOffset)) return;
  if (!(await permitted())) return;

  const fresh = threads.filter(
    (thread) =>
      now - thread.receivedAt >= 0 &&
      now - thread.receivedAt <= NEW_MAIL_RECENCY_MS &&
      isAccountNotified(preferences, thread.accountId),
  );
  if (fresh.length === 0) return;
  const silent = !preferences.notificationsSound;

  try {
    if (fresh.length > MAX_INDIVIDUAL_NOTIFICATIONS) {
      const perAccount = new Map<string, number>();
      for (const thread of fresh) {
        perAccount.set(thread.accountId, (perAccount.get(thread.accountId) ?? 0) + 1);
      }
      const where = [...perAccount.entries()]
        .map(([accountId, count]) => `${count} in ${accountEmailById.get(accountId) ?? 'an inbox'}`)
        .join(', ');
      await showNotification({
        title: `${fresh.length} new emails`,
        body: where,
        tag: `summary:${now}`,
        silent,
        data: threadRoute(fresh[0]),
      });
      return;
    }
    for (const thread of fresh) {
      const show = preferences.notificationsShowPreview;
      const email = accountEmailById.get(thread.accountId);
      const subject = thread.subject || '(No subject)';
      await showNotification({
        title: show ? senderDisplayName(thread.sender) : 'New mail',
        body: show
          ? thread.snippet
            ? `${subject}\n${thread.snippet}`
            : subject
          : email
            ? `New mail in ${email}`
            : 'You have new mail.',
        tag: threadKey(thread),
        silent,
        data: threadRoute(thread),
      });
    }
  } catch {
    // Notifications must never break the mail UI.
  }
}

/** Keys of the threads last seen, so only later arrivals banner. */
let knownThreadKeys: Set<string> | null = null;

export function forgetSeenThreads() {
  knownThreadKeys = null;
}

/**
 * Reconciles a freshly loaded thread list with posted notifications:
 * brand-new arrivals banner, and the Dock badge mirrors the unread count.
 */
export async function settleNotifications(
  store: Store,
  db: Db,
  threads: readonly MailThreadSummary[],
  now: number,
  utcOffset: number,
) {
  const keys = new Set(threads.map(threadKey));
  const previous = knownThreadKeys;
  knownThreadKeys = keys;

  const preferences = await loadPreferences(db);
  if (!preferences.notificationsBaselined) {
    // First sight of the list (install, re-download, or restart) never banners.
    await savePreference(db, 'notificationsBaselined', 1);
  } else if (preferences.notificationsEnabled && previous !== null) {
    const fresh = threads.filter((thread) => !previous.has(threadKey(thread)));
    if (fresh.length > 0) {
      const accounts = new Map(listAccounts(store).map((account) => [account.id, account.email]));
      await notifyNewMailThreads(fresh, preferences, accounts, now, utcOffset);
    }
  }
  await syncBadge(threads.filter((thread) => thread.unread).length, preferences);
}

/** Syncs the Dock badge with the unread count. Clears it when disabled. */
export async function syncBadge(unreadCount: number, preferences: MailPreferences) {
  try {
    if (!preferences.notificationsEnabled || !preferences.notificationsBadge) {
      await setAppBadge({ contents: 0 });
      return;
    }
    if (!(await permitted())) return;
    await setAppBadge({ contents: unreadCount });
  } catch {
    // Badge sync must never break the mail UI.
  }
}
