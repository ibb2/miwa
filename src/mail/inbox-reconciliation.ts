import { eq, inArray } from "drizzle-orm";

import db from "../db/db";
import {
  mailMessages,
  mailboxSyncState,
  mailThreads,
} from "../db/schema";
import { gmailAccountAuth } from "./account-auth";
import { GmailApiError, gmailGet } from "./gmail";
import {
  collectChangedThreadIds,
  latestHistoryId,
  type GmailHistoryPage,
  type GmailHistoryRecord,
} from "./gmail-history";
import {
  reconcileInboxThread,
  type InboxThreadReconciliationResult,
} from "./inbox-download";

export const DEFAULT_INBOX_RECONCILIATION_INTERVAL_MS = 60_000;
const GMAIL_MAX_HISTORY_PAGE_SIZE = 500;
const GMAIL_MAX_MESSAGE_PAGE_SIZE = 500;
const DEFAULT_THREAD_CONCURRENCY = 4;

type GmailMessageReference = {
  id: string;
  threadId: string;
};

type GmailMessageList = {
  messages?: GmailMessageReference[];
  nextPageToken?: string;
};

type GmailProfile = {
  historyId: string;
};

type SyncState = {
  historyId: string | null;
  lastSuccessfulSyncAt: number | null;
};

export type InboxReconciliationResult = {
  accountId: string;
  mode: "history" | "full" | "skipped";
  historyRecords: number;
  threadsChecked: number;
  threadsUpserted: number;
  threadsRemoved: number;
  messagesStored: number;
  attachmentsStored: number;
  historyId?: string;
};

export type InboxReconciliationCycleResult = {
  startedAt: number;
  completedAt: number;
  accounts: InboxReconciliationResult[];
  failures: Array<{
    accountId: string;
    error: unknown;
  }>;
};

export type InboxReconciliationSchedulerOptions = {
  intervalMs?: number;
  runImmediately?: boolean;
  onCycleStart?: () => void;
  onCycleComplete?: (result: InboxReconciliationCycleResult) => void;
  onCycleEnd?: () => void;
  onError?: (error: unknown) => void;
};

export type InboxReconciliationController = {
  runNow: () => void;
  stop: () => void;
};

function assertInterval(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1_000) {
    throw new RangeError("intervalMs must be an integer of at least 1,000.");
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("INBOX reconciliation aborted.");
  error.name = "AbortError";
  throw error;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      async () => {
        while (cursor < values.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await transform(values[index]);
        }
      },
    ),
  );

  return results;
}

function summarizeThreadResults(
  accountId: string,
  mode: InboxReconciliationResult["mode"],
  historyRecords: number,
  results: readonly InboxThreadReconciliationResult[],
  historyId?: string,
): InboxReconciliationResult {
  return {
    accountId,
    mode,
    historyRecords,
    threadsChecked: results.length,
    threadsUpserted: results.filter(
      (result) => result.action === "upserted",
    ).length,
    threadsRemoved: results.filter(
      (result) => result.action === "removed",
    ).length,
    messagesStored: results.reduce(
      (total, result) => total + result.messagesStored,
      0,
    ),
    attachmentsStored: results.reduce(
      (total, result) => total + result.attachmentsStored,
      0,
    ),
    historyId,
  };
}

async function updateSuccessfulSync(
  accountId: string,
  historyId: string,
): Promise<void> {
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

async function markSyncAttempt(
  accountId: string,
): Promise<void> {
  await db
    .update(mailboxSyncState)
    .set({ lastAttemptAt: Date.now(), lastError: null })
    .where(eq(mailboxSyncState.accountId, accountId));
}

async function markSyncFailure(
  accountId: string,
  error: unknown,
): Promise<void> {
  await db
    .update(mailboxSyncState)
    .set({
      lastError:
        error instanceof Error
          ? error.message
          : "INBOX reconciliation failed.",
    })
    .where(eq(mailboxSyncState.accountId, accountId))
    .catch(() => undefined);
}

async function findStartingHistoryId(
  accountId: string,
  syncState: SyncState,
): Promise<string | undefined> {
  if (syncState.historyId) return syncState.historyId;

  const rows = await db
    .select({ historyId: mailMessages.providerHistoryId })
    .from(mailMessages)
    .where(eq(mailMessages.accountId, accountId));
  return latestHistoryId(rows.map((row) => row.historyId));
}

async function listHistorySince(
  accountId: string,
  startHistoryId: string,
  signal?: AbortSignal,
): Promise<{
  records: GmailHistoryRecord[];
  historyId: string;
}> {
  const records: GmailHistoryRecord[] = [];
  let pageToken: string | undefined;
  let currentHistoryId = startHistoryId;

  do {
    throwIfAborted(signal);
    const query = new URLSearchParams({
      startHistoryId,
      maxResults: String(GMAIL_MAX_HISTORY_PAGE_SIZE),
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await gmailGet<GmailHistoryPage>(
      accountId,
      `/history?${query}`,
      signal,
    );
    records.push(...(page.history ?? []));
    currentHistoryId = page.historyId;
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { records, historyId: currentHistoryId };
}

async function listAllInboxMessages(
  accountId: string,
  signal?: AbortSignal,
): Promise<GmailMessageReference[]> {
  const references: GmailMessageReference[] = [];
  let pageToken: string | undefined;

  do {
    throwIfAborted(signal);
    const query = new URLSearchParams({
      labelIds: "INBOX",
      maxResults: String(GMAIL_MAX_MESSAGE_PAGE_SIZE),
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await gmailGet<GmailMessageList>(
      accountId,
      `/messages?${query}`,
      signal,
    );
    references.push(...(page.messages ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return references;
}

async function removeThreadsMissingFromInbox(
  accountId: string,
  remoteThreadIds: ReadonlySet<string>,
): Promise<number> {
  const localThreads = await db
    .select({
      id: mailThreads.id,
      providerThreadId: mailThreads.providerThreadId,
    })
    .from(mailThreads)
    .where(eq(mailThreads.accountId, accountId));
  const missingIds = localThreads
    .filter((thread) => !remoteThreadIds.has(thread.providerThreadId))
    .map((thread) => thread.id);

  if (!missingIds.length) return 0;
  await db.delete(mailThreads).where(inArray(mailThreads.id, missingIds));
  return missingIds.length;
}

async function fullReconcileInbox(
  accountId: string,
  signal?: AbortSignal,
): Promise<InboxReconciliationResult> {
  // Capture the cursor first. The next history pass will replay any changes
  // that happen while the full snapshot is being downloaded.
  const profile = await gmailGet<GmailProfile>(
    accountId,
    "/profile",
    signal,
  );
  const references = await listAllInboxMessages(accountId, signal);
  const remoteThreadIds = new Set(
    references.map((message) => message.threadId),
  );
  const results = await mapWithConcurrency(
    [...remoteThreadIds],
    DEFAULT_THREAD_CONCURRENCY,
    (threadId) =>
      reconcileInboxThread(accountId, threadId, { signal }),
  );
  const missingCount = await removeThreadsMissingFromInbox(
    accountId,
    remoteThreadIds,
  );
  await updateSuccessfulSync(accountId, profile.historyId);

  const summary = summarizeThreadResults(
    accountId,
    "full",
    0,
    results,
    profile.historyId,
  );
  summary.threadsRemoved += missingCount;
  return summary;
}

/**
 * Reconciles one downloaded Gmail INBOX without mutating Gmail.
 *
 * History pages are only committed by advancing `historyId` after every
 * affected thread has been persisted successfully. A failed pass therefore
 * retries safely from the previous cursor.
 */
export async function reconcileInboxAccount(
  accountId: string,
  signal?: AbortSignal,
): Promise<InboxReconciliationResult> {
  const syncState = await db
    .select({
      historyId: mailboxSyncState.historyId,
      lastSuccessfulSyncAt: mailboxSyncState.lastSuccessfulSyncAt,
    })
    .from(mailboxSyncState)
    .where(eq(mailboxSyncState.accountId, accountId))
    .get();

  if (!syncState?.lastSuccessfulSyncAt) {
    return {
      accountId,
      mode: "skipped",
      historyRecords: 0,
      threadsChecked: 0,
      threadsUpserted: 0,
      threadsRemoved: 0,
      messagesStored: 0,
      attachmentsStored: 0,
    };
  }

  await markSyncAttempt(accountId);

  try {
    const startHistoryId = await findStartingHistoryId(
      accountId,
      syncState,
    );
    if (!startHistoryId) {
      return await fullReconcileInbox(accountId, signal);
    }

    let history;
    try {
      history = await listHistorySince(
        accountId,
        startHistoryId,
        signal,
      );
    } catch (error) {
      if (!(error instanceof GmailApiError) || error.status !== 404) {
        throw error;
      }
      return await fullReconcileInbox(accountId, signal);
    }

    const threadIds = collectChangedThreadIds(history.records);
    const results = await mapWithConcurrency(
      threadIds,
      DEFAULT_THREAD_CONCURRENCY,
      (threadId) =>
        reconcileInboxThread(accountId, threadId, { signal }),
    );
    await updateSuccessfulSync(accountId, history.historyId);
    return summarizeThreadResults(
      accountId,
      "history",
      history.records.length,
      results,
      history.historyId,
    );
  } catch (error) {
    await markSyncFailure(accountId, error);
    throw error;
  }
}

export async function reconcileAllDownloadedInboxes(
  signal?: AbortSignal,
): Promise<InboxReconciliationCycleResult> {
  const startedAt = Date.now();
  const accounts = await gmailAccountAuth.listAccounts();
  const results: InboxReconciliationResult[] = [];
  const failures: InboxReconciliationCycleResult["failures"] = [];

  for (const account of accounts) {
    throwIfAborted(signal);
    try {
      results.push(await reconcileInboxAccount(account.id, signal));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      failures.push({ accountId: account.id, error });
    }
  }

  return {
    startedAt,
    completedAt: Date.now(),
    accounts: results,
    failures,
  };
}

/**
 * Starts a non-overlapping foreground reconciliation loop.
 *
 * React Native timers run while the app process is active. This is deliberately
 * not registered as an OS background task because mobile platforms do not
 * guarantee one-minute background execution.
 */
export function startInboxReconciliation(
  options: InboxReconciliationSchedulerOptions = {},
): InboxReconciliationController {
  const intervalMs =
    options.intervalMs ?? DEFAULT_INBOX_RECONCILIATION_INTERVAL_MS;
  assertInterval(intervalMs);

  let stopped = false;
  let running = false;
  let controller: AbortController | undefined;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    controller = new AbortController();
    options.onCycleStart?.();
    try {
      const result = await reconcileAllDownloadedInboxes(
        controller.signal,
      );
      if (!stopped) {
        for (const failure of result.failures) {
          options.onError?.(failure.error);
        }
        options.onCycleComplete?.(result);
      }
    } catch (error) {
      if (
        !stopped &&
        !(error instanceof Error && error.name === "AbortError")
      ) {
        options.onError?.(error);
      }
    } finally {
      running = false;
      controller = undefined;
      if (!stopped) options.onCycleEnd?.();
    }
  };

  const timer = setInterval(() => {
    void run();
  }, intervalMs);
  if (options.runImmediately ?? true) void run();

  return {
    runNow: () => {
      void run();
    },
    stop: () => {
      stopped = true;
      clearInterval(timer);
      controller?.abort();
    },
  };
}
