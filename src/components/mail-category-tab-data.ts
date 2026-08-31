import type { MailCategoryFilter } from '../mail/types';

export type MailCategoryTab = {
  id: MailCategoryFilter;
  label: string;
  fallbackIcon: string;
  systemImage: string;
};

export const mailCategoryTabs: readonly MailCategoryTab[] = [
  { id: 'inbox', label: 'Inbox', fallbackIcon: 'I', systemImage: 'tray.full' },
  { id: 'primary', label: 'Primary', fallbackIcon: 'P', systemImage: 'person.crop.circle' },
  { id: 'promotions', label: 'Promotions', fallbackIcon: '%', systemImage: 'tag' },
  { id: 'updates', label: 'Updates', fallbackIcon: 'U', systemImage: 'bell' },
  { id: 'social', label: 'Social', fallbackIcon: 'S', systemImage: 'person.2' },
  { id: 'forums', label: 'Forums', fallbackIcon: 'F', systemImage: 'text.bubble' },
] as const;
