export type GmailHistoryMessageReference = {
  id: string;
  threadId: string;
};

type GmailHistoryMessageChange = {
  message: GmailHistoryMessageReference;
};

type GmailHistoryLabelChange = GmailHistoryMessageChange & {
  labelIds?: string[];
};

export type GmailHistoryRecord = {
  id: string;
  messages?: GmailHistoryMessageReference[];
  messagesAdded?: GmailHistoryMessageChange[];
  messagesDeleted?: GmailHistoryMessageChange[];
  labelsAdded?: GmailHistoryLabelChange[];
  labelsRemoved?: GmailHistoryLabelChange[];
};

export type GmailHistoryPage = {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
};

function normalizedHistoryId(value: string): string {
  const normalized = value.replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid Gmail history ID "${value}".`);
  }
  return normalized;
}

export function latestHistoryId(
  values: Iterable<string | null | undefined>,
): string | undefined {
  let latest: string | undefined;

  for (const value of values) {
    if (!value) continue;
    const candidate = normalizedHistoryId(value);
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

/**
 * Returns every thread whose final Gmail state must be fetched.
 *
 * The generic `messages` collection is intentionally included as a defensive
 * fallback. Gmail recommends the specific collections, but older or unusual
 * history records may only identify a changed message there.
 */
export function collectChangedThreadIds(
  records: readonly GmailHistoryRecord[],
): string[] {
  const threadIds = new Set<string>();

  for (const record of records) {
    for (const message of record.messages ?? []) {
      if (message.threadId) threadIds.add(message.threadId);
    }
    for (const change of record.messagesAdded ?? []) {
      if (change.message.threadId) threadIds.add(change.message.threadId);
    }
    for (const change of record.messagesDeleted ?? []) {
      if (change.message.threadId) threadIds.add(change.message.threadId);
    }
    for (const change of record.labelsAdded ?? []) {
      if (change.message.threadId) threadIds.add(change.message.threadId);
    }
    for (const change of record.labelsRemoved ?? []) {
      if (change.message.threadId) threadIds.add(change.message.threadId);
    }
  }

  return [...threadIds];
}
