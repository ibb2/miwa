import type { MailCategory, MailThreadSummary } from './types';

export type InboxTabId = 'inbox' | 'pinned' | MailCategory | 'seen';

export type InboxTab = {
  id: InboxTabId;
  title: string;
  count: number;
};

const categoryLabels: ReadonlyArray<readonly [string, MailCategory]> = [
  ['CATEGORY_PRIMARY', 'primary'],
  ['CATEGORY_PROMOTIONS', 'promotions'],
  ['CATEGORY_UPDATES', 'updates'],
  ['CATEGORY_SOCIAL', 'social'],
  ['CATEGORY_FORUMS', 'forums'],
];

/** Maps Gmail's CATEGORY_* labels onto Miwa's inbox sections. */
export function mailCategoryForLabels(labels: readonly string[]): MailCategory {
  for (const [label, category] of categoryLabels) {
    if (labels.includes(label)) return category;
  }
  return 'primary';
}

const tabDefinitions: ReadonlyArray<{
  id: InboxTabId;
  title: string;
}> = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'pinned', title: 'Pinned' },
  { id: 'primary', title: 'People' },
  { id: 'promotions', title: 'Newsletters' },
  { id: 'updates', title: 'Notifications' },
  { id: 'social', title: 'Social' },
  { id: 'forums', title: 'Forums' },
  { id: 'seen', title: 'Seen' },
];

/** Returns the complete flat dataset represented by an inbox tab. */
export function threadsForInboxTab(
  threads: MailThreadSummary[],
  tab: InboxTabId,
): MailThreadSummary[] {
  if (tab === 'inbox') return threads;
  if (tab === 'pinned') return threads.filter((thread) => thread.pinned);
  if (tab === 'seen') return threads.filter((thread) => !thread.unread);
  return threads.filter((thread) => thread.category === tab);
}

/** Builds the stable tab order and derives its counts from the current mailbox. */
export function buildInboxTabs(threads: MailThreadSummary[]): InboxTab[] {
  return tabDefinitions.map((definition) => ({
    ...definition,
    count: threadsForInboxTab(threads, definition.id).length,
  }));
}
