import type { Storage, Store } from '../app.contract.d.ts';
import { connectAccount, disconnectAccount, listAccounts } from './accounts';
import { messageFor } from './async';
import { bytes, clearLocalDatabase, str, withDb } from './db';
import { setGatekeeperSenderStatus, type GatekeeperStatus } from './gatekeeper';
import {
  archiveGmailThread,
  setGmailThreadReadState,
  trashGmailMessage,
  trashGmailThread,
  withGmailReauth,
} from './gmail';
import { forgetSeenThreads } from './notifications';
import { isPreferenceKey, saveAccountNotified, savePreference } from './preferences';
import {
  loadThreadDetail,
  mailChanged,
  removeInboxThread,
  removeTrashedMessage,
  setThreadDoneState,
  setThreadPinnedState,
  setThreadReadState,
} from './thread-store';

export type Reply = { ok: boolean; title: string; error: string };

const ok: Reply = { ok: true, title: '', error: '' };
const failed = (title: string, error: unknown): Reply => ({
  ok: false,
  title,
  error: messageFor(error),
});

export type ThreadActionKind = 'read' | 'done' | 'pin' | 'archive' | 'trash';

/**
 * One conversation action from a row or the toolbar. The view shows the
 * change at once through the overlay; this makes it true in Gmail and SQLite.
 */
export async function threadAction(
  store: Store,
  storage: Storage,
  kind: string,
  accountId: string,
  threadId: string,
  flag: boolean,
  wasUnread: boolean,
  now: number,
): Promise<Reply> {
  if (kind === 'pin') {
    try {
      await withDb(storage, (db) => setThreadPinnedState(db, accountId, threadId, flag, now));
      return ok;
    } catch (error) {
      return failed('Could not update pin', error);
    }
  }

  if (kind === 'done') {
    // Finishing a conversation reads it too. Without the Gmail update the
    // next sync would download the thread and restore its unread state.
    const markRead = flag && wasUnread;
    try {
      await withDb(storage, (db) => setThreadDoneState(db, accountId, threadId, flag, now));
    } catch (error) {
      return failed('Could not update done status', error);
    }
    if (!markRead) return ok;
    try {
      await withGmailReauth(store, accountId, () =>
        setGmailThreadReadState(store, accountId, threadId, false),
      );
      await withDb(storage, (db) => setThreadReadState(db, accountId, threadId, false, now));
      return ok;
    } catch (error) {
      return failed('Could not mark conversation as read', error);
    }
  }

  const steps = {
    read: {
      gmail: () => setGmailThreadReadState(store, accountId, threadId, flag),
      local: () => withDb(storage, (db) => setThreadReadState(db, accountId, threadId, flag, now)),
      failedTitle: 'Could not update Gmail',
      refreshTitle: 'Gmail updated, but Miwa could not refresh',
    },
    archive: {
      gmail: () => archiveGmailThread(store, accountId, threadId),
      local: () => withDb(storage, (db) => removeInboxThread(db, accountId, threadId)),
      failedTitle: 'Could not archive conversation',
      refreshTitle: 'Gmail archived the conversation, but Miwa could not refresh',
    },
    trash: {
      gmail: () => trashGmailThread(store, accountId, threadId),
      local: () => withDb(storage, (db) => removeInboxThread(db, accountId, threadId)),
      failedTitle: 'Could not move conversation to Trash',
      refreshTitle: 'Gmail trashed the conversation, but Miwa could not refresh',
    },
  }[kind as 'read' | 'archive' | 'trash'];
  if (!steps) return failed('Could not update Gmail', new Error(`Unknown action "${kind}".`));

  try {
    await withGmailReauth(store, accountId, steps.gmail);
  } catch (error) {
    return failed(steps.failedTitle, error);
  }
  try {
    await steps.local();
    return ok;
  } catch (error) {
    return failed(steps.refreshTitle, error);
  }
}

export async function decideSender(
  storage: Storage,
  email: string,
  status: string,
  now: number,
): Promise<Reply> {
  try {
    await withDb(storage, (db) =>
      setGatekeeperSenderStatus(db, email, status as GatekeeperStatus, now),
    );
    return ok;
  } catch (error) {
    return failed('Could not update Gatekeeper', error);
  }
}

/** Moves one reviewed email to Gmail Trash and updates its local conversation. */
export async function trashMessage(
  store: Store,
  storage: Storage,
  accountId: string,
  providerMessageId: string,
  now: number,
): Promise<Reply> {
  try {
    await withGmailReauth(store, accountId, () =>
      trashGmailMessage(store, accountId, providerMessageId),
    );
  } catch (error) {
    return failed('Could not move email to Trash', error);
  }
  try {
    await withDb(storage, (db) => removeTrashedMessage(db, accountId, providerMessageId, now));
    return ok;
  } catch {
    return failed(
      'Could not move email to Trash',
      new Error('The email moved to Gmail Trash, but its local copy could not update.'),
    );
  }
}

export type ConnectReply = Reply & { accountId: string };

export async function connectGmail(store: Store, now: number): Promise<ConnectReply> {
  try {
    const account = await connectAccount(store, now);
    return { ...ok, accountId: account.id };
  } catch (error) {
    return { ...failed('Could not connect Gmail', error), accountId: '' };
  }
}

export async function disconnectGmail(store: Store, accountId: string): Promise<Reply> {
  try {
    await disconnectAccount(store, accountId);
    return ok;
  } catch (error) {
    return failed('Could not disconnect Gmail', error);
  }
}

export async function setPreference(storage: Storage, key: string, value: number): Promise<Reply> {
  if (!isPreferenceKey(key))
    return failed('Could not save setting', new Error(`Unknown setting "${key}".`));
  try {
    await withDb(storage, (db) => savePreference(db, key, value));
    return ok;
  } catch (error) {
    return failed('Could not save setting', error);
  }
}

export async function setAccountNotified(
  storage: Storage,
  accountId: string,
  enabled: boolean,
): Promise<Reply> {
  try {
    await withDb(storage, (db) => saveAccountNotified(db, accountId, enabled));
    return ok;
  } catch (error) {
    return failed('Could not save setting', error);
  }
}

export async function clearData(storage: Storage, now: number): Promise<Reply> {
  try {
    await withDb(storage, (db) => clearLocalDatabase(db, now));
    mailChanged();
    forgetSeenThreads();
    return { ok: true, title: 'Local data cleared', error: 'Miwa is ready for a fresh download.' };
  } catch (error) {
    return failed('Could not clear local data', error);
  }
}

export type UrlReply = Reply & { url: string };

/** A reply, reply-all or forward draft for the default mail app, as a mailto: URL. */
export async function composeUrl(
  store: Store,
  storage: Storage,
  accountId: string,
  threadId: string,
  messageId: string,
  action: string,
  utcOffset: number,
): Promise<UrlReply> {
  try {
    const detail = await withDb(storage, (db) => loadThreadDetail(db, accountId, threadId));
    const message = messageId
      ? detail.messages.find((item) => item.id === messageId)
      : detail.messages.at(-1);
    if (!message) throw new Error('This message is no longer available.');
    const ownEmail = listAccounts(store).find((item) => item.id === accountId)?.email;
    const replyTo = message.addresses.filter((item) => item.kind === 'replyTo');
    const sender = replyTo.length
      ? replyTo
      : message.addresses.filter((item) => item.kind === 'from');
    const addresses =
      action === 'forward'
        ? []
        : action === 'reply-all'
          ? [
              ...sender,
              ...message.addresses.filter((item) => item.kind === 'to' || item.kind === 'cc'),
            ]
          : sender;
    const to = [
      ...new Set(
        addresses.flatMap((item) =>
          item.address && item.address.toLowerCase() !== ownEmail?.toLowerCase()
            ? [item.address]
            : [],
        ),
      ),
    ];
    const prefix = action === 'forward' ? 'Fwd' : 'Re';
    const subject = new RegExp(`^${prefix}:`, 'i').test(message.subject)
      ? message.subject
      : `${prefix}: ${message.subject}`;
    // Local time from the zone's offset; the data module reads no clock or zone itself.
    const sent = new Date(message.sentAt + utcOffset * 60_000).toLocaleString('en-US', {
      timeZone: 'UTC',
    });
    const body = `\n\nOn ${sent}, ${message.sender} wrote:\n${message.plainText
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}`;
    return {
      ...ok,
      url: `mailto:${to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    };
  } catch (error) {
    return { ...failed('Could not open draft', error), url: '' };
  }
}

const ATTACHMENT_FOLDER = 'app:/tmp/attachments';

async function attachmentFiles(storage: Storage, ids: string[]) {
  const rows = await withDb(storage, (db) =>
    db.all(
      `SELECT id, filename, data FROM mail_attachments
       WHERE id IN (${ids.map(() => '?').join(', ')}) AND download_state = 'complete' AND inline = 0`,
      ids,
    ),
  );
  const byId = new Map(rows.map((row) => [str(row.id), row]));
  return ids.map((id) => {
    const row = byId.get(id);
    const data = bytes(row?.data);
    const filename = str(row?.filename) || 'Attachment';
    if (!data) throw new Error(`${filename} is not available offline.`);
    // A name is a path component: keep it from naming a folder.
    return { filename: filename.replace(/[/:]/g, '-'), data };
  });
}

export type FileReply = Reply & { path: string; filename: string };

/** Writes one attachment where the save panel can copy it from. */
export async function prepareAttachment(storage: Storage, id: string): Promise<FileReply> {
  try {
    const [file] = await attachmentFiles(storage, [id]);
    const folder = `${ATTACHMENT_FOLDER}/${encodeURIComponent(id)}`;
    await storage.fs.mkdir(folder);
    const path = `${folder}/${file.filename}`;
    await storage.fs.writeFile(path, file.data);
    return { ...ok, path, filename: file.filename };
  } catch (error) {
    return { ...failed('Could not save attachments', error), path: '', filename: '' };
  }
}

/** Saves every attachment into the folder the person chose, numbering repeated names. */
export async function saveAttachments(
  storage: Storage,
  ids: string[],
  folder: string,
): Promise<Reply> {
  try {
    const files = await attachmentFiles(storage, ids);
    const used = new Set<string>();
    for (const file of files) {
      let name = file.filename;
      const dot = name.lastIndexOf('.');
      const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
      for (let copy = 2; used.has(name.toLowerCase()); copy += 1)
        name = `${stem} ${copy}${extension}`;
      used.add(name.toLowerCase());
      await storage.fs.writeFile(`${folder}/${name}`, file.data);
    }
    return ok;
  } catch (error) {
    return failed('Could not save attachments', error);
  }
}
