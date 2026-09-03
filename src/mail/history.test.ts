import { describe, expect, test } from 'bun:test';

import {
  collectChangedThreadIds,
  latestHistoryId,
  type GmailHistoryRecord,
} from './history';

describe('Gmail history helpers', () => {
  test('deduplicates thread IDs across every history change type', () => {
    const records: GmailHistoryRecord[] = [
      {
        id: '10',
        messages: [{ id: 'm1', threadId: 't1' }],
        messagesAdded: [{ message: { id: 'm2', threadId: 't2' } }],
        messagesDeleted: [{ message: { id: 'm3', threadId: 't3' } }],
        labelsAdded: [{ message: { id: 'm4', threadId: 't1' }, labelIds: ['UNREAD'] }],
        labelsRemoved: [{ message: { id: 'm5', threadId: 't4' }, labelIds: ['INBOX'] }],
      },
    ];

    expect(collectChangedThreadIds(records)).toEqual(['t1', 't2', 't3', 't4']);
  });

  test('compares uint64 history IDs without numeric precision loss', () => {
    expect(
      latestHistoryId(['999999999999999999', null, '1000000000000000000', '00042']),
    ).toBe('1000000000000000000');
  });
});
