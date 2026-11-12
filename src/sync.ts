import type { Storage, Store } from '../app.contract.d.ts';
import { listAccounts } from './accounts';
import { mapWithConcurrency, messageFor } from './async';
import { optStr, str, withDb } from './db';
import {
  downloadStatus,
  listInboxMessageRefs,
  reconcileThread,
  type ThreadReconcileResult,
} from './download';
import { GmailApiError, gmailGet } from './gmail';
import {
  collectChangedThreadIds,
  latestHistoryId,
  type GmailHistoryPage,
  type GmailHistoryRecord,
} from './history';
import { mailChanged } from './thread-store';

const GMAIL_MAX_HISTORY_PAGE_SIZE = 500;
const THREAD_CONCURRENCY = 4;

type AccountSyncResult = { mode: 'history' | 'full' | 'skipped'; changed: number };

const changedCount = (results: readonly ThreadReconcileResult[]) => results.length;

async function markSyncSuccess(
  storage: Storage,
  accountId: string,
  historyId: string,
  now: number,
) {
  await withDb(storage, (db) =>
    db.run(
      `UPDATE mailbox_sync_state SET history_id = ?, last_attempt_at = ?, last_successful_sync_at = ?,
         initial_sync_complete = 1, last_error = NULL WHERE account_id = ?`,
      [historyId, now, now, accountId],
    ),
  );
}

/** Pages through every history record since `startHistoryId`. */
async function listHistorySince(store: Store, accountId: string, startHistoryId: string) {
  const records: GmailHistoryRecord[] = [];
  let pageToken: string | undefined;
  let historyId = startHistoryId;
  do {
    const query = new URLSearchParams({
      startHistoryId,
      maxResults: String(GMAIL_MAX_HISTORY_PAGE_SIZE),
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await gmailGet<GmailHistoryPage>(store, accountId, `/history?${query}`);
    records.push(...(page.history ?? []));
    historyId = page.historyId;
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { records, historyId };
}

/**
 * Full INBOX resync: re-fetch every remote thread and drop local extras.
 * The history cursor is captured first so the next history pass replays any
 * changes that arrive while the snapshot downloads.
 */
async function fullSync(store: Store, storage: Storage, accountId: string, now: number) {
  const profile = await gmailGet<{ historyId: string }>(store, accountId, '/profile');
  const { refs } = await listInboxMessageRefs(store, accountId, Number.POSITIVE_INFINITY);
  const remoteThreadIds = new Set(refs.map((message) => message.threadId));
  const results = await mapWithConcurrency([...remoteThreadIds], THREAD_CONCURRENCY, (threadId) =>
    reconcileThread(store, storage, accountId, threadId, now),
  );
  const missing = await withDb(storage, async (db) => {
    const local = await db.all(
      'SELECT id, provider_thread_id FROM mail_threads WHERE account_id = ?',
      [accountId],
    );
    const ids = local
      .filter((thread) => !remoteThreadIds.has(str(thread.provider_thread_id)))
      .map((thread) => str(thread.id));
    await db.batch(
      ids.map((id) => ({ sql: 'DELETE FROM mail_threads WHERE id = ?', params: [id] })),
    );
    return ids.length;
  });
  if (missing) mailChanged();
  await markSyncSuccess(storage, accountId, profile.historyId, now);
  return { mode: 'full', changed: changedCount(results) + missing } satisfies AccountSyncResult;
}

/**
 * Incremental sync via Gmail history. The cursor advances only after every
 * affected thread has been persisted, so a failed pass safely retries.
 */
async function syncAccount(
  store: Store,
  storage: Storage,
  accountId: string,
  now: number,
): Promise<AccountSyncResult> {
  const state = await withDb(storage, (db) =>
    db.get(
      'SELECT history_id, last_successful_sync_at FROM mailbox_sync_state WHERE account_id = ?',
      [accountId],
    ),
  );
  if (!state || state.last_successful_sync_at == null) return { mode: 'skipped', changed: 0 };

  try {
    const startHistoryId =
      optStr(state.history_id) ??
      latestHistoryId(
        (
          await withDb(storage, (db) =>
            db.all('SELECT provider_history_id FROM mail_messages WHERE account_id = ?', [
              accountId,
            ]),
          )
        ).map((row) => optStr(row.provider_history_id)),
      );
    if (!startHistoryId) return await fullSync(store, storage, accountId, now);

    let history: { records: GmailHistoryRecord[]; historyId: string };
    try {
      history = await listHistorySince(store, accountId, startHistoryId);
    } catch (error) {
      // 404 means the cursor expired; fall back to a full resync.
      if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
      return await fullSync(store, storage, accountId, now);
    }

    const results = await mapWithConcurrency(
      collectChangedThreadIds(history.records),
      THREAD_CONCURRENCY,
      (threadId) => reconcileThread(store, storage, accountId, threadId, now),
    );
    await markSyncSuccess(storage, accountId, history.historyId, now);
    return { mode: 'history', changed: changedCount(results) };
  } catch (error) {
    await withDb(storage, (db) =>
      db.run('UPDATE mailbox_sync_state SET last_error = ? WHERE account_id = ?', [
        messageFor(error),
        accountId,
      ]),
    ).catch(() => undefined);
    throw error;
  }
}

let running = false;

export type SyncResult = { label: string; changed: boolean };

/** One sync pass across every connected inbox; the view's task runs it every minute. */
export async function syncMail(store: Store, storage: Storage, now: number): Promise<SyncResult> {
  if (running || downloadStatus().active)
    return { label: 'Checking Gmail for new mail…', changed: false };
  running = true;
  let failures = 0;
  let changed = false;
  try {
    for (const account of listAccounts(store)) {
      try {
        const result = await syncAccount(store, storage, account.id, now);
        changed ||= result.changed > 0;
      } catch {
        failures += 1;
      }
    }
  } finally {
    running = false;
  }
  return {
    changed,
    label:
      failures > 0
        ? 'Mail sync finished with errors'
        : changed
          ? 'Mail updated'
          : 'Mail is up to date',
  };
}
