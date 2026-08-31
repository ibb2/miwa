export type MailProvider = 'gmail';

export type ConnectedAccount = {
  id: string;
  provider: MailProvider;
  email: string;
  displayName: string;
  avatarUrl?: string;
  order: number;
};

export type MailboxView =
  | { kind: 'all' }
  | { kind: 'account'; accountId: string };

export type MailCategory = 'primary' | 'promotions' | 'updates' | 'social' | 'forums';
export type MailCategoryFilter = 'inbox' | MailCategory;

export type MailThreadSummary = {
  provider: MailProvider;
  accountId: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  unread: boolean;
  messageCount: number;
  category: MailCategory;
};

export type MailAttachment = {
  id?: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type MailMessage = {
  id: string;
  sender: string;
  recipients: string;
  sentAt: number;
  subject: string;
  plainText: string;
  safeHtml?: string;
  attachments: MailAttachment[];
};

export type MailThreadDetail = {
  provider: MailProvider;
  accountId: string;
  threadId: string;
  subject: string;
  messages: MailMessage[];
};

export type AccountInboxPage = {
  accountId: string;
  threads: MailThreadSummary[];
  nextPageToken?: string;
};

export type AccountLoadError = {
  accountId: string;
  message: string;
  requiresReauthentication: boolean;
};
