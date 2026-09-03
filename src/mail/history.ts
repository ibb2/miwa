export type GmailHistoryRecord = {
  id: string;
  messages?: Array<{ id: string; threadId: string }>;
  messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
  messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
  labelsAdded?: Array<{ message: { id: string; threadId: string }; labelIds?: string[] }>;
  labelsRemoved?: Array<{ message: { id: string; threadId: string }; labelIds?: string[] }>;
};

export type GmailHistoryPage = {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
};

/**
 * Returns the largest history ID. Gmail history IDs are uint64 strings that
 * exceed Number.MAX_SAFE_INTEGER, so compare them as zero-stripped strings.
 */
export function latestHistoryId(values: Iterable<string | null | undefined>): string | undefined {
  let latest: string | undefined;

  for (const value of values) {
    if (!value) continue;
    const candidate = value.replace(/^0+(?=\d)/, '');
    if (!/^\d+$/.test(candidate)) {
      throw new Error(`Invalid Gmail history ID "${value}".`);
    }
    if (
      latest === undefined ||
      candidate.length > latest.length ||
      (candidate.length === latest.length && candidate > latest)
    ) {
      latest = candidate;
    }
  }

  return latest;
}

/** Returns every thread whose final Gmail state must be re-fetched. */
export function collectChangedThreadIds(records: readonly GmailHistoryRecord[]): string[] {
  const threadIds = new Set<string>();

  for (const record of records) {
    const changes = [
      ...(record.messages ?? []),
      ...(record.messagesAdded ?? []).map((change) => change.message),
      ...(record.messagesDeleted ?? []).map((change) => change.message),
      ...(record.labelsAdded ?? []).map((change) => change.message),
      ...(record.labelsRemoved ?? []).map((change) => change.message),
    ];
    for (const message of changes) {
      if (message.threadId) threadIds.add(message.threadId);
    }
  }

  return [...threadIds];
}
