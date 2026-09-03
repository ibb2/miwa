import type { SFSymbol } from 'sf-symbols-typescript';

import type { MailCategory, MailThreadSummary } from './types';

export type InboxLayoutMode = 'categorized' | 'single';
export type InboxSectionFocus = 'pinned' | MailCategory;
export type InboxSectionId = 'inbox' | 'pinned' | 'seen' | MailCategory;

export type InboxSection = {
  id: InboxSectionId;
  title: string;
  systemImage: SFSymbol;
  threads: MailThreadSummary[];
  totalCount: number;
  expandable: boolean;
  presentation: 'card' | 'plain';
};

/** Persisted layout preference; anything unknown falls back to categorized. */
export function inboxLayoutMode(value: unknown): InboxLayoutMode {
  return value === 'single' ? 'single' : 'categorized';
}

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

const categorySections: ReadonlyArray<{
  id: MailCategory;
  title: string;
  systemImage: SFSymbol;
}> = [
  { id: 'primary', title: 'People', systemImage: 'person.2.fill' },
  { id: 'updates', title: 'Notifications', systemImage: 'bell.fill' },
  { id: 'promotions', title: 'Newsletters', systemImage: 'newspaper.fill' },
  { id: 'social', title: 'Social', systemImage: 'bubble.left.and.bubble.right.fill' },
  { id: 'forums', title: 'Forums', systemImage: 'text.bubble.fill' },
];

const MAX_PREVIEW_THREADS = 3;

function section(
  definition: { id: InboxSectionId; title: string; systemImage: SFSymbol },
  threads: MailThreadSummary[],
  expandable: boolean,
  presentation: 'card' | 'plain',
): InboxSection {
  return {
    ...definition,
    threads: expandable ? threads.slice(0, MAX_PREVIEW_THREADS) : threads,
    totalCount: threads.length,
    expandable,
    presentation,
  };
}

/**
 * Groups inbox threads into display sections.
 *
 * Categorized mode shows unread mail grouped under Pinned + category cards
 * (five previews each) with read mail in a plain "Seen" list. A focused
 * section drills into that section's unread mail. Single mode is one card.
 */
export function buildInboxSections(
  threads: MailThreadSummary[],
  layoutMode: InboxLayoutMode,
  focusedSection?: InboxSectionFocus,
): InboxSection[] {
  if (focusedSection === 'pinned') {
    const pinned = threads.filter((thread) => thread.pinned && thread.unread);
    return pinned.length
      ? [section({ id: 'pinned', title: 'Pinned', systemImage: 'pin.fill' }, pinned, false, 'card')]
      : [];
  }

  if (layoutMode === 'single') {
    return [
      section({ id: 'inbox', title: 'Inbox', systemImage: 'tray.full.fill' }, threads, false, 'card'),
    ];
  }

  if (focusedSection) {
    const definition = categorySections.find((item) => item.id === focusedSection)!;
    const categoryThreads = threads.filter(
      (thread) => thread.unread && thread.category === focusedSection,
    );
    return categoryThreads.length
      ? [section(definition, categoryThreads, false, 'card')]
      : [];
  }

  const sections: InboxSection[] = [];
  const pinned = threads.filter((thread) => thread.pinned && thread.unread);
  if (pinned.length) {
    sections.push(
      section({ id: 'pinned', title: 'Pinned', systemImage: 'pin.fill' }, pinned, true, 'card'),
    );
  }

  for (const definition of categorySections) {
    const categoryThreads = threads.filter(
      (thread) => thread.unread && !thread.pinned && thread.category === definition.id,
    );
    if (categoryThreads.length) {
      sections.push(section(definition, categoryThreads, true, 'card'));
    }
  }

  const seen = threads.filter((thread) => !thread.unread);
  if (seen.length) {
    sections.push(
      section({ id: 'seen', title: 'Seen', systemImage: 'envelope.open.fill' }, seen, false, 'plain'),
    );
  }

  return sections;
}
