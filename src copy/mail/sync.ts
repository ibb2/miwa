import { eq, inArray } from 'drizzle-orm';

import { db } from '../db/db';
import { mailMessages, mailboxSyncState, mailThreads } from '../db/schema';
import { gmailAccountAuth } from './accounts';
import { mapWithConcurrency, throwIfAborted } from './async';
import { listInboxMessageRefs } from './download-inbox';
import { reconcileThread, type ThreadReconcileResult } from './download-thread';
import { GmailApiError, gmailGet } from './gmail';
import {
  collectChangedThreadIds,
  latestHistoryId,
  type GmailHistoryPage,
  type GmailHistoryRecord,
} from './history';

const SYNC_INTERVAL_MS = 60_000;
const GMAIL_MAX_HISTORY_PAGE_SIZE = 500;
const THREAD_CONCURRENCY = 4;

type GmailProfile = { historyId: string };

export type AccountSyncResult = {
  accountId: string;
  mode: 'history' | 'full' | 'skipped';
  historyRecords: number;
  threadsChecked: number;
  threadsUpserted: number;
  threadsRemoved: number;
};

export type SyncCycleResult = {
  accounts: AccountSyncResult[];
  failures: Array<{ accountId: string; error: unknown }>;
};

export type SyncController = {
  runNow: () => void;
  stop: () => void;
};

export type SyncSchedulerOptions = {
  intervalMs?: number;
  onCycleStart?: () => void;
  onCycleComplete?: (result: SyncCycleResult) => void;
  onCycleEnd?: () => void;
  onError?: (error: unknown) => void;
};

function summarize(
  accountId: string,
  mode: AccountSyncResult['mode'],
  historyRecords: number,
  results: readonly ThreadReconcileResult[],
): AccountSyncResult {
  return {
    accountId,
    mode,
    historyRecords,
    threadsChecked: results.length,
    threadsUpserted: results.filter((result) => result.action === 'upserted').length,
    threadsRemoved: results.filter((result) => result.action === 'removed').length,
  };
}

async function markSyncSuccess(accountId: string, historyId: string): Promise<void> {
  await db
    .update(mailboxSyncState)
    .set({
      historyId,
      lastAttemptAt: Date.now(),
      lastSuccessfulSyncAt: Date.now(),
      initialSyncComplete: true,
      lastError: null,
    })
    .where(eq(mailboxSyncState.accountId, accountId));
}

async function markSyncFailure(accountId: string, error: unknown): Promise<void> {
  await db
    .update(mailboxSyncState)
    .set({ lastError: error instanceof Error ? error.message : 'INBOX sync failed.' })
    .where(eq(mailboxSyncState.accountId, accountId))
    .catch(() => undefined);
}

/** Pages through every history record since `startHistoryId`. */
async function listHistorySince(
  accountId: string,
  startHistoryId: string,
  signal?: AbortSignal,
): Promise<{ records: GmailHistoryRecord[]; historyId: string }> {
  const records: GmailHistoryRecord[] = [];
  let pageToken: string | undefined;
  let historyId = startHistoryId;

  do {
    throwIfAborted(signal);
    const query = new URLSearchParams({
      startHistoryId,
      maxResults: String(GMAIL_MAX_HISTORY_PAGE_SIZE),
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await gmailGet<GmailHistoryPage>(accountId, `/history?${query}`, signal);
    records.push(...(page.history ?? []));
    historyId = page.historyId;
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { records, historyId };
}

/** Deletes local threads that no longer exist in the remote INBOX. */
async function removeMissingThreads(
  accountId: string,
  remoteThreadIds: ReadonlySet<string>,
): Promise<number> {
  const localThreads = await db
    .select({ id: mailThreads.id, providerThreadId: mailThreads.providerThreadId })
    .from(mailThreads)
    .where(eq(mailThreads.accountId, accountId));
  const missingIds = localThreads
    .filter((thread) => !remoteThreadIds.has(thread.providerThreadId))
    .map((thread) => thread.id);

  if (!missingIds.length) return 0;
  await db.delete(mailThreads).where(inArray(mailThreads.id, missingIds));
  return missingIds.length;
}

/**
 * Full INBOX resync: re-fetch every remote thread and drop local extras.
 * The history cursor is captured first so the next history pass replays any
 * changes that arrive while the snapshot downloads.
 */
async function fullSync(accountId: string, signal?: AbortSignal): Promise<AccountSyncResult> {
  const profile = await gmailGet<GmailProfile>(accountId, '/profile', signal);
  const { refs } = await listInboxMessageRefs(accountId, Number.POSITIVE_INFINITY, signal);
  const remoteThreadIds = new Set(refs.map((message) => message.threadId));
  const results = await mapWithConcurrency([...remoteThreadIds], THREAD_CONCURRENCY, (threadId) =>
    reconcileThread(accountId, threadId, signal),
  );
  const missingCount = await removeMissingThreads(accountId, remoteThreadIds);
  await markSyncSuccess(accountId, profile.historyId);

  const summary = summarize(accountId, 'full', 0, results);
  summary.threadsRemoved += missingCount;
  return summary;
}

/**
 * Incremental sync via Gmail history. The cursor advances only after every
 * affected thread has been persisted, so a failed pass safely retries.
 */
async function syncAccount(accountId: string, signal?: AbortSignal): Promise<AccountSyncResult> {
  const syncState = await db
    .select({
      historyId: mailboxSyncState.historyId,
      lastSuccessfulSyncAt: mailboxSyncState.lastSuccessfulSyncAt,
    })
    .from(mailboxSyncState)
    .where(eq(mailboxSyncState.accountId, accountId))
    .get();

  if (!syncState?.lastSuccessfulSyncAt) {
    return summarize(accountId, 'skipped', 0, []);
  }

  try {
    const startHistoryId =
      syncState.historyId ??
      latestHistoryId(
        (
          await db
            .select({ historyId: mailMessages.providerHistoryId })
            .from(mailMessages)
            .where(eq(mailMessages.accountId, accountId))
        ).map((row) => row.historyId),
      );
    if (!startHistoryId) return fullSync(accountId, signal);

    let history: { records: GmailHistoryRecord[]; historyId: string };
    try {
      history = await listHistorySince(accountId, startHistoryId, signal);
    } catch (error) {
      // 404 means the cursor expired; fall back to a full resync.
      if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
      return fullSync(accountId, signal);
    }

    const threadIds = collectChangedThreadIds(history.records);
    const results = await mapWithConcurrency(threadIds, THREAD_CONCURRENCY, (threadId) =>
      reconcileThread(accountId, threadId, signal),
    );
    await markSyncSuccess(accountId, history.historyId);
    return summarize(accountId, 'history', history.records.length, results);
  } catch (error) {
    await markSyncFailure(accountId, error);
    throw error;
  }
}

/**
 * Starts a non-overlapping foreground sync loop across all connected inboxes.
 * React Native timers only run while the app is active, so this is a polling
 * loop rather than an OS background task.
 */
export function startInboxSync(options: SyncSchedulerOptions = {}): SyncController {
  const intervalMs = options.intervalMs ?? SYNC_INTERVAL_MS;

  let stopped = false;
  let running = false;
  let controller: AbortController | undefined;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    controller = new AbortController();
    options.onCycleStart?.();
    const failures: SyncCycleResult['failures'] = [];
    const accounts: AccountSyncResult[] = [];
    try {
      for (const account of await gmailAccountAuth.listAccounts()) {
        throwIfAborted(controller.signal);
        try {
          accounts.push(await syncAccount(account.id, controller.signal));
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error;
          failures.push({ accountId: account.id, error });
        }
      }
      if (!stopped) {
        for (const failure of failures) options.onError?.(failure.error);
        options.onCycleComplete?.({ accounts, failures });
      }
    } catch (error) {
      if (!stopped && !(error instanceof Error && error.name === 'AbortError')) {
        options.onError?.(error);
      }
    } finally {
      running = false;
      controller = undefined;
      if (!stopped) options.onCycleEnd?.();
    }
  };

  const timer = setInterval(() => void run(), intervalMs);
  void run();

  return {
    runNow: () => void run(),
    stop: () => {
      stopped = true;
      clearInterval(timer);
      controller?.abort();
    },
  };
}
