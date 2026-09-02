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

export function inboxLayoutMode(value: unknown): InboxLayoutMode {
  return value === 'single' ? 'single' : 'categorized';
}

export function buildInboxSections(
  threads: MailThreadSummary[],
  layoutMode: InboxLayoutMode,
  focusedSection?: InboxSectionFocus,
): InboxSection[] {
  if (focusedSection === 'pinned') {
    const pinned = threads.filter((thread) => thread.pinned && thread.unread);
    return pinned.length ? [{
      id: 'pinned',
      title: 'Pinned',
      systemImage: 'pin.fill',
      threads: pinned,
      totalCount: pinned.length,
      expandable: false,
      presentation: 'card',
    }] : [];
  }

  if (layoutMode === 'single') {
    return [{
      id: 'inbox',
      title: 'Inbox',
      systemImage: 'tray.full.fill',
      threads,
      totalCount: threads.length,
      expandable: false,
      presentation: 'card',
    }];
  }

  if (focusedSection) {
    const definition = categorySections.find((section) => section.id === focusedSection)!;
    const categoryThreads = threads.filter(
      (thread) => thread.unread && thread.category === focusedSection,
    );
    return categoryThreads.length ? [{
      ...definition,
      threads: categoryThreads,
      totalCount: categoryThreads.length,
      expandable: false,
      presentation: 'card',
    }] : [];
  }

  const sections: InboxSection[] = [];
  const pinned = threads.filter((thread) => thread.pinned && thread.unread);
  if (pinned.length) {
    sections.push({
      id: 'pinned',
      title: 'Pinned',
      systemImage: 'pin.fill',
      threads: pinned.slice(0, 5),
      totalCount: pinned.length,
      expandable: true,
      presentation: 'card',
    });
  }

  for (const section of categorySections) {
    const categoryThreads = threads.filter(
      (thread) => thread.unread && !thread.pinned && thread.category === section.id,
    );
    if (categoryThreads.length) {
      sections.push({
        ...section,
        threads: categoryThreads.slice(0, 5),
        totalCount: categoryThreads.length,
        expandable: true,
        presentation: 'card',
      });
    }
  }

  const seen = threads.filter((thread) => !thread.unread);
  if (seen.length) {
    sections.push({
      id: 'seen',
      title: 'Seen',
      systemImage: 'envelope.open.fill',
      threads: seen,
      totalCount: seen.length,
      expandable: false,
      presentation: 'plain',
    });
  }

  return sections;
}
