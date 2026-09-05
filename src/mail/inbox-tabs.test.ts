import { describe, expect, test } from 'bun:test';

import { buildInboxTabs, mailCategoryForLabels, threadsForInboxTab } from './inbox-tabs';
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
    done: false,
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
  test('builds every tab in a stable order with matching counts', () => {
    const threads = [
      thread('person', 'primary'),
      thread('pinned update', 'updates', true),
      thread('newsletter', 'promotions'),
      thread('seen update', 'updates', false, false),
    ];
    expect(buildInboxTabs(threads).map(({ id, count }) => [id, count])).toEqual([
      ['inbox', 4],
      ['pinned', 1],
      ['primary', 1],
      ['promotions', 1],
      ['updates', 2],
      ['social', 0],
      ['forums', 0],
      ['seen', 1],
    ]);
  });

  test('returns one complete flat dataset for each selected tab', () => {
    const threads = [
      thread('person', 'primary'),
      thread('pinned update', 'updates', true),
      thread('seen pinned', 'social', true, false),
      thread('newsletter', 'promotions'),
    ];
    expect(threadsForInboxTab(threads, 'inbox')).toBe(threads);
    expect(threadsForInboxTab(threads, 'pinned').map((item) => item.threadId)).toEqual([
      'pinned update',
      'seen pinned',
    ]);
    expect(threadsForInboxTab(threads, 'updates').map((item) => item.threadId)).toEqual([
      'pinned update',
    ]);
    expect(threadsForInboxTab(threads, 'seen').map((item) => item.threadId)).toEqual([
      'seen pinned',
    ]);
  });
});
