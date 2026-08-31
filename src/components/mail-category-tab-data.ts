import type { MailViewFilter } from '../mail/types';

export type MailCategoryTab = {
  id: MailViewFilter;
  label: string;
  fallbackIcon: string;
  systemImage: string;
};

export const mailCategoryTabs: readonly MailCategoryTab[] = [
  { id: 'inbox', label: 'Inbox', fallbackIcon: 'I', systemImage: 'tray.full' },
  { id: 'pinned', label: 'Pinned', fallbackIcon: 'P', systemImage: 'pin' },
] as const;
