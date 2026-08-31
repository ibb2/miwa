import { describe, expect, test } from 'bun:test';

import { mailCategoryForLabels } from './mail-category';

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
