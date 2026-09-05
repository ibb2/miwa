import { eq } from 'drizzle-orm';
import { db } from '../db/db';
import { mailAccounts, mailboxSyncState } from '../db/schema';
import { gmailAccountAuth } from './accounts';
import { throwIfAborted } from './async';
import { gmailGet } from './gmail';
import { latestHistoryId } from './history';
import { downloadThread, persistThread } from './download-thread';

export const DEFAULT_INBOX_DOWNLOAD_LIMIT = 1_000;

const GMAIL_MAX_PAGE_SIZE = 500;
const THREAD_CONCURRENCY = 4;

type GmailMessageReference = { id: string; threadId: string };

type GmailMessageList = {
  messages?: GmailMessageReference[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type InboxDownloadProgress = {
  accountId: string;
  phase: 'listing' | 'downloading' | 'complete';
  fraction: number;
  inboxEmailsSelected: number;
  targetInboxEmails: number;
  threadsDownloaded: number;
  totalThreads: number;
  messagesStored: number;
  attachmentsStored: number;
};

export type InboxDownloadResult = {
  inboxEmailsSelected: number;
  threadsDownloaded: number;
  messagesStored: number;
  attachmentsStored: number;
};

export type InboxDownloadOptions = {
  /** Maximum number of INBOX-labeled messages to select (whole threads are stored). */
  maxEmails?: number;
  signal?: AbortSignal;
  onProgress?: (progress: InboxDownloadProgress) => void;
};

/** Lists INBOX message references, paging until `limit` or the end of the inbox. */
export async function listInboxMessageRefs(
  accountId: string,
  limit: number,
  signal?: AbortSignal,
  onPage?: (collected: number, estimatedTotal: number | undefined) => void,
): Promise<{ refs: GmailMessageReference[]; nextPageToken?: string; resultSizeEstimate?: number }> {
  const refs: GmailMessageReference[] = [];
  let pageToken: string | undefined;
  let nextPageToken: string | undefined;
  let resultSizeEstimate: number | undefined;

  do {
    throwIfAborted(signal);
    const query = new URLSearchParams({
      labelIds: 'INBOX',
      maxResults: String(Math.min(GMAIL_MAX_PAGE_SIZE, limit - refs.length)),
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await gmailGet<GmailMessageList>(accountId, `/messages?${query}`, signal);
    const received = page.messages ?? [];
    refs.push(...received.slice(0, limit - refs.length));
    nextPageToken = page.nextPageToken;
    resultSizeEstimate = page.resultSizeEstimate;
    onPage?.(refs.length, resultSizeEstimate);
    if (!received.length) break;
    pageToken = nextPageToken;
  } while (pageToken && refs.length < limit);

  return { refs, nextPageToken, resultSizeEstimate };
}

/**
 * Downloads a read-only snapshot of one Gmail account's INBOX into SQLite.
 * Only Gmail GET endpoints are called; labels and server-side mail never change.
 */
export async function downloadInbox(
  accountId: string,
  options: InboxDownloadOptions = {},
): Promise<InboxDownloadResult> {
  const maxEmails = options.maxEmails ?? DEFAULT_INBOX_DOWNLOAD_LIMIT;
  if (!Number.isSafeInteger(maxEmails) || maxEmails < 0) {
    throw new RangeError('maxEmails must be a non-negative safe integer.');
  }
  throwIfAborted(options.signal);

  const account = (await gmailAccountAuth.listAccounts()).find((item) => item.id === accountId);
  if (!account) {
    throw new Error(`Gmail account "${accountId}" is not connected.`);
  }

  const startedAt = Date.now();
  await db
    .insert(mailAccounts)
    .values({
      id: account.id,
      provider: account.provider,
      email: account.email,
      displayName: account.displayName,
      sortOrder: account.order,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: mailAccounts.id,
      set: {
        provider: account.provider,
        email: account.email,
        displayName: account.displayName,
        sortOrder: account.order,
        updatedAt: startedAt,
      },
    });

  await db
    .insert(mailboxSyncState)
    .values({
      accountId,
      mailbox: 'INBOX',
      lastAttemptAt: startedAt,
      initialSyncComplete: false,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: mailboxSyncState.accountId,
      set: { lastAttemptAt: startedAt, lastError: null },
    });

  const progress = (patch: Partial<InboxDownloadProgress>) =>
    options.onProgress?.({
      accountId,
      phase: 'listing',
      fraction: 0,
      inboxEmailsSelected: 0,
      targetInboxEmails: maxEmails,
      threadsDownloaded: 0,
      totalThreads: 0,
      messagesStored: 0,
      attachmentsStored: 0,
      ...patch,
    });

  try {
    progress({ phase: 'listing' });
    const { refs, resultSizeEstimate } = await listInboxMessageRefs(
      accountId,
      maxEmails,
      options.signal,
      (collected, estimate) =>
        progress({
          phase: 'listing',
          fraction: Math.min(
            0.1,
            (collected / Math.min(maxEmails, estimate ?? maxEmails)) * 0.1 || 0,
          ),
          inboxEmailsSelected: collected,
          targetInboxEmails: Math.min(maxEmails, estimate ?? maxEmails),
        }),
    );
    const inboxEmailsSelected = refs.length;
    const targetInboxEmails = Math.min(maxEmails, resultSizeEstimate ?? maxEmails);

    const threadIds = [...new Set(refs.map((message) => message.threadId))];
    const totalThreads = threadIds.length;
    let threadsDownloaded = 0;
    let messagesStored = 0;
    let attachmentsStored = 0;
    let downloadedHistoryId: string | undefined;

    for (let offset = 0; offset < threadIds.length; offset += THREAD_CONCURRENCY) {
      const batch = await Promise.all(
        threadIds
          .slice(offset, offset + THREAD_CONCURRENCY)
          .map((threadId) => downloadThread(accountId, threadId, options.signal)),
      );
      for (const thread of batch) {
        await persistThread(accountId, thread);
        downloadedHistoryId = latestHistoryId([
          downloadedHistoryId,
          ...thread.messages.map((message) => message.row.providerHistoryId),
        ]);
        threadsDownloaded += 1;
        messagesStored += thread.messages.length;
        attachmentsStored += thread.messages.reduce(
          (total, message) => total + message.attachments.length,
          0,
        );
        progress({
          phase: 'downloading',
          fraction: totalThreads > 0 ? 0.1 + (threadsDownloaded / totalThreads) * 0.9 : 1,
          inboxEmailsSelected,
          targetInboxEmails,
          threadsDownloaded,
          totalThreads,
          messagesStored,
          attachmentsStored,
        });
      }
    }

    const existingSyncState = await db
      .select({ historyId: mailboxSyncState.historyId })
      .from(mailboxSyncState)
      .where(eq(mailboxSyncState.accountId, accountId))
      .get();
    await db
      .update(mailboxSyncState)
      .set({
        nextPageToken: null,
        historyId: latestHistoryId([existingSyncState?.historyId, downloadedHistoryId]),
        lastSuccessfulSyncAt: Date.now(),
        initialSyncComplete: true,
        lastError: null,
      })
      .where(eq(mailboxSyncState.accountId, accountId));

    progress({
      phase: 'complete',
      fraction: 1,
      inboxEmailsSelected,
      targetInboxEmails,
      threadsDownloaded,
      totalThreads,
      messagesStored,
      attachmentsStored,
    });

    return { inboxEmailsSelected, threadsDownloaded, messagesStored, attachmentsStored };
  } catch (error) {
    await db
      .update(mailboxSyncState)
      .set({
        lastError: error instanceof Error ? error.message : 'INBOX download failed.',
      })
      .where(eq(mailboxSyncState.accountId, accountId))
      .catch(() => undefined);
    throw error;
  }
}
