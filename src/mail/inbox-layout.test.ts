import { describe, expect, test } from 'bun:test';

import {
  buildInboxSections,
  inboxLayoutMode,
  mailCategoryForLabels,
} from './inbox-layout';
import type { MailCategory, MailThreadSummary } from './types';

function thread(
  id: string,
  category: MailCategory,
  pinned = false,
  unread = true,
): MailThreadSummary {
  return {
    accountId: 'account',
    threadId: id,
    sender: id,
    subject: id,
    snippet: '',
    receivedAt: 1,
    unread,
    pinned,
    messageCount: 1,
    category,
  };
}

describe('mailCategoryForLabels', () => {
  test('maps Gmail category labels', () => {
    expect(mailCategoryForLabels(['INBOX', 'CATEGORY_PROMOTIONS'])).toBe('promotions');
    expect(mailCategoryForLabels(['CATEGORY_UPDATES', 'UNREAD'])).toBe('updates');
    expect(mailCategoryForLabels(['CATEGORY_SOCIAL'])).toBe('social');
    expect(mailCategoryForLabels(['CATEGORY_FORUMS'])).toBe('forums');
  });

  test('treats uncategorized inbox mail as primary', () => {
    expect(mailCategoryForLabels(['INBOX', 'IMPORTANT'])).toBe('primary');
    expect(mailCategoryForLabels([])).toBe('primary');
  });
});

describe('inbox layout', () => {
  test('uses categorized as the persisted-value fallback', () => {
    expect(inboxLayoutMode('single')).toBe('single');
    expect(inboxLayoutMode('categorized')).toBe('categorized');
    expect(inboxLayoutMode(undefined)).toBe('categorized');
    expect(inboxLayoutMode('invalid')).toBe('categorized');
  });

  test('orders populated cards and removes pinned mail from its category', () => {
    const sections = buildInboxSections(
      [
        thread('forum', 'forums'),
        thread('person', 'primary'),
        thread('pinned update', 'updates', true),
        thread('newsletter', 'promotions'),
        thread('read', 'updates', false, false),
      ],
      'categorized',
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Pinned',
      'People',
      'Newsletters',
      'Forums',
      'Seen',
    ]);
    expect(sections.flatMap((section) => section.threads.map((item) => item.threadId)))
      .toEqual(['pinned update', 'person', 'newsletter', 'forum', 'read']);
  });

  test('places every inbox message in one card in single mode', () => {
    const threads = [thread('one', 'primary', true), thread('two', 'updates')];
    expect(buildInboxSections(threads, 'single')).toEqual([
      {
        id: 'inbox',
        title: 'Inbox',
        systemImage: 'tray.full.fill',
        threads,
        totalCount: 2,
        expandable: false,
        presentation: 'card',
      },
    ]);
  });

  test('limits unread category previews to five and expands to all unread category mail', () => {
    const threads = [
      ...Array.from({ length: 7 }, (_, index) => thread(`unread ${index}`, 'updates')),
      thread('read update', 'updates', false, false),
    ];
    const preview = buildInboxSections(threads, 'categorized');
    const notifications = preview.find((section) => section.id === 'updates')!;
    expect(notifications.threads.length).toBe(5);
    expect(notifications.totalCount).toBe(7);

    const expanded = buildInboxSections(threads, 'categorized', 'updates');
    expect(expanded[0].threads.length).toBe(7);
    expect(expanded[0].threads.every((item) => item.unread)).toBe(true);
  });

  test('shows only pinned messages in the pinned drill-down', () => {
    const sections = buildInboxSections(
      [
        thread('pinned', 'social', true),
        thread('seen pinned', 'updates', true, false),
        thread('regular', 'primary'),
      ],
      'categorized',
      'pinned',
    );
    expect(sections.length).toBe(1);
    expect(sections[0].threads.map((item) => item.threadId)).toEqual(['pinned']);
  });

  test('omits an empty pinned card', () => {
    const sections = buildInboxSections([thread('person', 'primary')], 'categorized');
    expect(sections.map((section) => section.id)).toEqual(['primary']);
    expect(buildInboxSections([thread('person', 'primary')], 'categorized', 'pinned')).toEqual([]);
  });
});
