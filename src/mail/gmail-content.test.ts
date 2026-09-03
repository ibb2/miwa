import { describe, expect, test } from 'bun:test';

import {
  decodeBase64UrlBytes,
  header,
  parseAddresses,
  parseReferences,
  sanitizeEmailHtml,
  stripHtml,
} from './gmail-content';

describe('gmail-content', () => {
  test('decodes UTF-8 base64url bodies', () => {
    const text = new TextDecoder().decode(decodeBase64UrlBytes('SGVsbG8sIE1pd2Eh'));
    expect(text).toBe('Hello, Miwa!');
  });

  test('decodes binary base64url without converting it to text', () => {
    expect(Array.from(decodeBase64UrlBytes('_wAB-g'))).toEqual([255, 0, 1, 250]);
  });

  test('finds headers case-insensitively', () => {
    const headers = [{ name: 'From', value: 'a@example.com' }];
    expect(header(headers, 'from')).toBe('a@example.com');
    expect(header(headers, 'Subject')).toBe('');
  });

  test('strips HTML into readable plain text', () => {
    expect(stripHtml('<p>Hello<br><b>world</b></p>')).toBe('Hello\nworld');
  });

  test('removes active and remotely loaded HTML content', () => {
    const safe = sanitizeEmailHtml(
      '<style>@import "https://tracker.test/style.css"</style><script>alert(1)</script><img src="https://tracker.test/pixel" srcset="https://tracker.test/large 2x"><a onclick="steal()" href="javascript:bad()">Open</a><b>Safe</b>',
    );
    expect(safe).not.toContain('<style');
    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('https://tracker.test');
    expect(safe).not.toContain('srcset');
    expect(safe).not.toContain('onclick');
    expect(safe).not.toContain('javascript:');
    expect(safe).toContain('<b>Safe</b>');
  });

  test('parses named and bare address headers', () => {
    const rows = parseAddresses('m1', [
      { name: 'From', value: '"Ada, A." <ada@example.com>' },
      { name: 'To', value: 'bob@example.com, carol@example.com' },
    ]);
    expect(rows).toEqual([
      {
        messageId: 'm1',
        kind: 'from',
        position: 0,
        name: 'Ada, A.',
        address: 'ada@example.com',
        rawValue: '"Ada, A." <ada@example.com>',
      },
      {
        messageId: 'm1',
        kind: 'to',
        position: 0,
        name: null,
        address: 'bob@example.com',
        rawValue: 'bob@example.com',
      },
      {
        messageId: 'm1',
        kind: 'to',
        position: 1,
        name: null,
        address: 'carol@example.com',
        rawValue: 'carol@example.com',
      },
    ]);
  });

  test('extracts message IDs from a References header', () => {
    expect(parseReferences('<a@x> <b@y>')).toEqual([{ messageId: 'a@x' }, { messageId: 'b@y' }]);
  });
});
