export type MailProvider = 'gmail';

export type ConnectedAccount = {
  id: string;
  provider: MailProvider;
  email: string;
  displayName: string;
  avatarUrl?: string;
  order: number;
};

/** Which mailbox the inbox screen is showing. */
export type MailboxView = { kind: 'all' } | { kind: 'account'; accountId: string };

export type MailCategory = 'primary' | 'promotions' | 'updates' | 'social' | 'forums';

/** One conversation row in the inbox list. */
export type MailThreadSummary = {
  accountId: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  preview: string;
  receivedAt: number;
  unread: boolean;
  done: boolean;
  pinned: boolean;
  messageCount: number;
  hasAttachments: boolean;
  category: MailCategory;
};

export type MailAttachment = {
  id?: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type MailAddress = {
  kind: 'from' | 'sender' | 'replyTo' | 'to' | 'cc' | 'bcc';
  name?: string | null;
  address?: string | null;
  rawValue: string;
};

export type MailMessage = {
  providerMessageId: string;
  addresses: MailAddress[];
  id: string;
  sender: string;
  recipients: string;
  sentAt: number;
  subject: string;
  plainText: string;
  safeHtml?: string;
  attachments: MailAttachment[];
};

/** A fully downloaded conversation, ready to read offline. */
export type MailThreadDetail = {
  accountId: string;
  threadId: string;
  subject: string;
  messages: MailMessage[];
};
