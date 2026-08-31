import { describe, expect, test } from 'bun:test';

import {
  decodeBase64Url,
  decodeBase64UrlBytes,
  extractMailBody,
  gmailThreadArchiveModification,
  gmailThreadReadStateModification,
  mergeAccountThreads,
  mergeThreadSummaries,
  sanitizeEmailHtml,
} from './gmail-utils';
import type { AccountInboxPage, MailThreadSummary } from './types';

function summary(accountId: string, threadId: string, receivedAt: number): MailThreadSummary {
  return {
    provider: 'gmail',
    accountId,
    threadId,
    sender: 'Sender',
    subject: threadId,
    snippet: '',
    receivedAt,
    unread: false,
    messageCount: 1,
    category: 'primary',
  };
}

describe('Gmail mail utilities', () => {
  test('maps archive to removal of the Gmail INBOX label', () => {
    expect(gmailThreadArchiveModification()).toEqual({ removeLabelIds: ['INBOX'] });
  });

  test('maps read state to Gmail UNREAD label mutations', () => {
    expect(gmailThreadReadStateModification(true)).toEqual({ addLabelIds: ['UNREAD'] });
    expect(gmailThreadReadStateModification(false)).toEqual({ removeLabelIds: ['UNREAD'] });
  });

  test('decodes UTF-8 base64url bodies', () => {
    expect(decodeBase64Url('SGVsbG8sIE1pd2Eh')).toBe('Hello, Miwa!');
  });

  test('decodes binary base64url without converting it to text', () => {
    expect(Array.from(decodeBase64UrlBytes('_wAB-g'))).toEqual([255, 0, 1, 250]);
  });

  test('traverses nested MIME parts and separates attachments', () => {
    const body = extractMailBody({
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: 'UGxhaW4gdGV4dA' } },
            { mimeType: 'text/html', body: { data: 'PGI-SGVsbG88L2I-' } },
          ],
        },
        {
          mimeType: 'application/pdf',
          filename: 'report.pdf',
          body: { attachmentId: 'attachment-1', size: 42 },
        },
      ],
    });

    expect(body.plain).toEqual(['Plain text']);
    expect(body.html).toEqual(['<b>Hello</b>']);
    expect(body.attachments).toEqual([
      { id: 'attachment-1', filename: 'report.pdf', mimeType: 'application/pdf', size: 42 },
    ]);
  });

  test('removes active and remotely loaded HTML content', () => {
    const safe = sanitizeEmailHtml(
      '<style>@import "https://tracker.test/style.css"</style><script>alert(1)</script><img src="https://tracker.test/pixel" srcset="https://tracker.test/large 2x"><a onclick="steal()" href="javascript:bad()">Open</a><b>Safe</b>'
    );
    expect(safe).not.toContain('<style');
    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('https://tracker.test');
    expect(safe).not.toContain('srcset');
    expect(safe).not.toContain('onclick');
    expect(safe).not.toContain('javascript:');
    expect(safe).toContain('<b>Safe</b>');
  });

  test('merges account pages by date without cross-account deduplication', () => {
    const pages: AccountInboxPage[] = [
      { accountId: 'one', threads: [summary('one', 'shared', 10), summary('one', 'old', 1)] },
      { accountId: 'two', threads: [summary('two', 'shared', 20)] },
    ];
    expect(mergeAccountThreads(pages).map((thread) => `${thread.accountId}:${thread.threadId}`)).toEqual([
      'two:shared',
      'one:shared',
      'one:old',
    ]);
  });

  test('merges refreshed and paginated threads by account and thread ID', () => {
    const existing = [summary('one', 'older', 1), summary('one', 'updated', 2)];
    const incoming = [summary('one', 'newer', 3), summary('one', 'updated', 4)];

    expect(mergeThreadSummaries(existing, incoming).map((thread) => `${thread.threadId}:${thread.receivedAt}`)).toEqual([
      'updated:4',
      'newer:3',
      'older:1',
    ]);
  });
});
