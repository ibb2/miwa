import type { MailCategory } from './types';

const categoryLabels: ReadonlyArray<readonly [string, MailCategory]> = [
  ['CATEGORY_PRIMARY', 'primary'],
  ['CATEGORY_PROMOTIONS', 'promotions'],
  ['CATEGORY_UPDATES', 'updates'],
  ['CATEGORY_SOCIAL', 'social'],
  ['CATEGORY_FORUMS', 'forums'],
];

export function mailCategoryForLabels(labels: readonly string[]): MailCategory {
  for (const [label, category] of categoryLabels) {
    if (labels.includes(label)) return category;
  }
  return 'primary';
}
