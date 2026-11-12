// Miwa's data: Gmail through OAuth, the offline copy in SQLite, and the
// answers app.contract asks for. The view shows each action at once through
// the overlay below; the sources make it true in Gmail and on disk.
import type { Answer, Overlay, Result, Sources, Write } from './app.contract.d.ts';
import { listAccounts, prepareSignIn } from './src/accounts';
import {
  clearData,
  composeUrl,
  connectGmail,
  decideSender,
  disconnectGmail,
  prepareAttachment,
  saveAttachments,
  setAccountNotified,
  setPreference,
  threadAction,
  trashMessage,
} from './src/actions';
import { messageFor } from './src/async';
import { withDb } from './src/db';
import { downloadAccounts, downloadStatus } from './src/download';
import { forgetSeenThreads, settleNotifications } from './src/notifications';
import { syncMail } from './src/sync';
import { loadThreads } from './src/thread-store';
import { accountRows, loadDetail, loadGatekeeper, loadMailbox, loadPrefs } from './src/view';

export const grants = [
  'sqlite.open app:/data/miwa.db',
  'fs.read app:/cache',
  'fs.write app:/cache',
  'fs.read app:/tmp',
  'fs.write app:/tmp',
  'fs.write doc:/',
  'net.fetch https://gmail.googleapis.com',
  'net.fetch https://oauth2.googleapis.com',
  'net.fetch https://accounts.google.com',
  'net.fetch https://openidconnect.googleapis.com',
  'auth.session https://accounts.google.com',
  'auth.callback com.googleusercontent.apps.611007919856-aj6ui4cnma1qojqi0iggbo1g8emg8p66:/oauth2redirect',
  'secret.keep miwa.gmail.accounts',
  'secret.keep miwa.gmail.session',
  'device.notifications purpose.notifications',
].join('\n');

const sources: Sources = {
  loadAccounts: (_, store) => accountRows(store),
  signInSession: async (_, store) => ({ error: await prepareSignIn(store) }),
  loadMailbox: ([view, tab, query, showDone], _, storage) =>
    loadMailbox(storage, view, tab, query, showDone),
  loadDetail: ([accountId, threadId, messageId, subject], store, storage) =>
    loadDetail(store, storage, accountId, threadId, messageId, subject),
  loadGatekeeper: ([tab, query, now], _, storage) => loadGatekeeper(storage, tab, query, now),
  loadPrefs: (_, store, storage) => loadPrefs(store, storage),
  downloadStatus: () => downloadStatus(),

  syncMail: async ([now, utcOffset], store, storage) => {
    const result = await syncMail(store, storage, now);
    try {
      // Banners for what arrived, and the Dock badge for what is unread.
      await withDb(storage, async (db) =>
        settleNotifications(store, db, await loadThreads(db), now, utcOffset),
      );
    } catch {
      // A notification that cannot post never fails the sync.
    }
    return result;
  },
  downloadMail: async ([accountId, now], store, storage) => {
    const ids = accountId ? [accountId] : listAccounts(store).map((account) => account.id);
    try {
      const outcome = await downloadAccounts(store, storage, ids, now);
      // A download's mail is the new baseline: none of it banners.
      forgetSeenThreads();
      return { ok: outcome.ok, title: outcome.title, error: outcome.message };
    } catch (error) {
      return { ok: false, title: 'Inbox download failed', error: messageFor(error) };
    }
  },
  threadAction: ([kind, accountId, threadId, flag, wasUnread, now], store, storage) =>
    threadAction(store, storage, kind, accountId, threadId, flag, wasUnread, now),
  decideSender: ([email, status, now], _, storage) => decideSender(storage, email, status, now),
  trashMessage: ([accountId, providerMessageId, now], store, storage) =>
    trashMessage(store, storage, accountId, providerMessageId, now),
  connectGmail: ([now], store) => connectGmail(store, now),
  disconnectGmail: ([accountId], store) => disconnectGmail(store, accountId),
  setPreference: ([key, value], _, storage) => setPreference(storage, key, value),
  setAccountNotified: ([accountId, enabled], _, storage) =>
    setAccountNotified(storage, accountId, enabled),
  clearData: ([now], _, storage) => clearData(storage, now),
  composeUrl: ([accountId, threadId, messageId, action, utcOffset], store, storage) =>
    composeUrl(store, storage, accountId, threadId, messageId, action, utcOffset),
  prepareAttachment: ([id], _, storage) => prepareAttachment(storage, id),
  saveAttachments: ([ids, folder], _, storage) => saveAttachments(storage, ids, folder),
  // The Mac's title-row double-click (modules/apple/WindowZoom.swift).
  zoomWindow: async (_args, _store, _storage, native) => {
    const done = native?.available
      ? ((await native.later({})) as { ok?: boolean }).ok === true
      : false;
    return { ok: done, title: '', error: '' };
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);

// ---- Optimistic writes ----

type ThreadWrite = Extract<Write, { source: 'threadAction' }>;
type DecideWrite = Extract<Write, { source: 'decideSender' }>;
type ThreadFlags = {
  accountId: string;
  threadId: string;
  unread: boolean;
  done: boolean;
  pinned: boolean;
};

/** A write the answer does not show yet, and has not failed. */
function showing<W extends Write>(write: W): boolean {
  if (write.answered) return false;
  const reply = write.reply as { ok?: boolean } | undefined;
  return reply?.ok !== false;
}

/** One thread with the pending actions laid over it; `null` once archived or trashed. */
function applyThreadWrites<T extends ThreadFlags>(
  thread: T,
  writes: readonly ThreadWrite[],
): T | null {
  let next = thread;
  for (const write of writes) {
    const [kind, accountId, threadId, flag, wasUnread] = write.args;
    if (accountId !== thread.accountId || threadId !== thread.threadId) continue;
    if (kind === 'archive' || kind === 'trash') return null;
    if (kind === 'read') next = { ...next, unread: flag };
    if (kind === 'pin') next = { ...next, pinned: flag };
    if (kind === 'done')
      next = { ...next, done: flag, unread: flag && wasUnread ? false : next.unread };
    write.keep();
  }
  return next;
}

export const overlay: Overlay = (source, args, answer, writes) => {
  if (source === 'loadMailbox' || source === 'loadDetail') {
    const pending = writes.filter(
      (write): write is ThreadWrite => write.source === 'threadAction' && showing(write),
    );
    if (!pending.length) return undefined;
    if (source === 'loadDetail') {
      const detail = answer as Result<'loadDetail'>;
      if (!detail.found) return undefined;
      const next = applyThreadWrites(detail, pending);
      return (next ?? detail) as typeof answer;
    }
    const mailbox = answer as Result<'loadMailbox'>;
    const [, tab, , showDone] = args as [string, string, string, boolean];
    const threads = mailbox.threads.flatMap((thread) => {
      const next = applyThreadWrites(thread, pending);
      if (!next || (!showDone && next.done) || (tab === 'pinned' && !next.pinned)) return [];
      return [next];
    });
    return { ...mailbox, threads } as typeof answer;
  }
  if (source === 'loadGatekeeper') {
    const pending = writes.filter(
      (write): write is DecideWrite => write.source === 'decideSender' && showing(write),
    );
    if (!pending.length) return undefined;
    const gatekeeper = answer as Result<'loadGatekeeper'>;
    const [tab] = args as [number, string, number];
    const decided = new Map<string, string>();
    for (const write of pending) {
      decided.set(write.args[0].trim().toLowerCase(), write.args[1]);
      write.keep();
    }
    const senders = gatekeeper.senders.filter((sender) => {
      const status = decided.get(sender.email);
      return status === undefined || status === (tab === 0 ? 'pending' : 'blocked');
    });
    return { ...gatekeeper, senders } as typeof answer;
  }
  return undefined;
};
