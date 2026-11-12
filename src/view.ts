import type { Storage, Store } from '../app.contract.d.ts';
import { accountInitials, listAccounts } from './accounts';
import { messageFor } from './async';
import { withDb } from './db';
import {
  loadGatekeeperOverview,
  type GatekeeperMessage,
  type GatekeeperSender,
} from './gatekeeper';
import { buildInboxTabs, threadsForInboxTab, type InboxTabId } from './inbox-tabs';
import { reloadMessageImages } from './message-images';
import { senderDisplayName } from './notifications';
import { loadPreferences } from './preferences';
import { createMailSearch } from './search';
import { loadThreadDetail, loadThreads } from './thread-store';
import type { MailAddress, MailAttachment, MailThreadDetail, MailThreadSummary } from './types';

export const accountRows = (store: Store) =>
  listAccounts(store).map((account) => ({
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    initials: accountInitials(account),
  }));

/** A list row: the thread with its sender already reduced to a display name. */
export type ThreadRow = {
  key: string;
  accountId: string;
  threadId: string;
  sender: string;
  subject: string;
  preview: string;
  receivedAt: number;
  unread: boolean;
  done: boolean;
  pinned: boolean;
  messageCount: number;
  hasAttachments: boolean;
};

export type Mailbox = {
  threads: ThreadRow[];
  inboxCount: number;
  pinnedCount: number;
  totalCount: number;
  error: string;
};

const toRow = (thread: MailThreadSummary): ThreadRow => ({
  key: `${thread.accountId}:${thread.threadId}`,
  accountId: thread.accountId,
  threadId: thread.threadId,
  sender: senderDisplayName(thread.sender),
  subject: thread.subject || '(No subject)',
  preview: thread.preview,
  receivedAt: thread.receivedAt,
  unread: thread.unread,
  done: thread.done,
  pinned: thread.pinned,
  messageCount: thread.messageCount,
  hasAttachments: thread.hasAttachments,
});

let searchCache: {
  threads: MailThreadSummary[];
  search: ReturnType<typeof createMailSearch>;
} | null = null;

function searchFor(threads: MailThreadSummary[]) {
  if (searchCache?.threads !== threads)
    searchCache = { threads, search: createMailSearch(threads) };
  return searchCache.search;
}

/** The inbox list for the toolbar's mailbox, tab, search and Show Done. */
export async function loadMailbox(
  storage: Storage,
  view: string,
  tab: string,
  query: string,
  showDone: boolean,
): Promise<Mailbox> {
  try {
    const all = await withDb(storage, loadThreads);
    const shown = showDone ? all : all.filter((thread) => !thread.done);
    const candidates = view === 'all' ? shown : shown.filter((thread) => thread.accountId === view);
    const visible = query.trim() ? searchFor(all)(query, candidates) : candidates;
    const tabs = buildInboxTabs(visible);
    return {
      threads: threadsForInboxTab(visible, tab as InboxTabId).map(toRow),
      inboxCount: tabs.find((item) => item.id === 'inbox')?.count ?? 0,
      pinnedCount: tabs.find((item) => item.id === 'pinned')?.count ?? 0,
      totalCount: all.length,
      error: '',
    };
  } catch (error) {
    return { threads: [], inboxCount: 0, pinnedCount: 0, totalCount: 0, error: messageFor(error) };
  }
}

const fileTypeIcons: Record<string, [string, string]> = {
  pdf: ['doc.richtext', '#E5484D'],
  doc: ['doc.text', '#2B579A'],
  docx: ['doc.text', '#2B579A'],
  pages: ['doc.text', '#D24726'],
  xls: ['tablecells', '#217346'],
  xlsx: ['tablecells', '#217346'],
  csv: ['tablecells', '#217346'],
  numbers: ['tablecells', '#217346'],
  ppt: ['rectangle.on.rectangle', '#D24726'],
  pptx: ['rectangle.on.rectangle', '#D24726'],
  key: ['rectangle.on.rectangle', '#D24726'],
  zip: ['doc.zipper', '#B07D36'],
  rar: ['doc.zipper', '#B07D36'],
  '7z': ['doc.zipper', '#B07D36'],
  gz: ['doc.zipper', '#B07D36'],
  tar: ['doc.zipper', '#B07D36'],
  png: ['photo', '#8E5BD9'],
  jpg: ['photo', '#8E5BD9'],
  jpeg: ['photo', '#8E5BD9'],
  gif: ['photo', '#8E5BD9'],
  heic: ['photo', '#8E5BD9'],
  webp: ['photo', '#8E5BD9'],
  tiff: ['photo', '#8E5BD9'],
  svg: ['photo', '#8E5BD9'],
  mp3: ['music.note', '#D64BA3'],
  wav: ['music.note', '#D64BA3'],
  m4a: ['music.note', '#D64BA3'],
  aac: ['music.note', '#D64BA3'],
  flac: ['music.note', '#D64BA3'],
  mp4: ['film', '#7A5AF8'],
  mov: ['film', '#7A5AF8'],
  avi: ['film', '#7A5AF8'],
  mkv: ['film', '#7A5AF8'],
  txt: ['doc.plaintext', '#6B7280'],
  md: ['doc.plaintext', '#6B7280'],
  rtf: ['doc.plaintext', '#6B7280'],
  html: ['globe', '#0891B2'],
  htm: ['globe', '#0891B2'],
  eml: ['envelope', '#2563EB'],
  msg: ['envelope', '#2563EB'],
  ics: ['calendar', '#DC2626'],
};

function iconFor(attachment: MailAttachment): [string, string] {
  const extension = attachment.filename.split('.').pop()?.toLowerCase();
  const byExtension = extension ? fileTypeIcons[extension] : undefined;
  if (byExtension) return byExtension;
  const [type, subtype = ''] = attachment.mimeType.toLowerCase().split('/');
  if (type === 'image') return fileTypeIcons.png;
  if (type === 'audio') return fileTypeIcons.mp3;
  if (type === 'video') return fileTypeIcons.mp4;
  if (subtype === 'pdf') return fileTypeIcons.pdf;
  if (subtype === 'csv') return fileTypeIcons.csv;
  if (type === 'application' && (subtype.includes('zip') || subtype.includes('compressed'))) {
    return fileTypeIcons.zip;
  }
  return ['doc', '#6B7280'];
}

const KIND_LABELS: Record<MailAddress['kind'], string> = {
  from: 'from',
  sender: 'sender',
  replyTo: 'reply-to',
  to: 'to',
  cc: 'cc',
  bcc: 'bcc',
};

const addressLabel = (address: MailAddress) => address.name || address.address || address.rawValue;

const toAddress = (address: MailAddress, avatar: string) => ({
  kind: address.kind,
  kindLabel: KIND_LABELS[address.kind],
  label: addressLabel(address),
  full:
    address.name && address.address && address.name !== address.address
      ? `${address.name} <${address.address}>`
      : address.address || address.rawValue,
  email: address.address ?? '',
  rawValue: address.rawValue,
  avatar,
  canBlock: address.kind === 'from' || address.kind === 'sender' || address.kind === 'replyTo',
});

/** A sender logo the email itself carries: an image whose alt text names the sender. */
function logoFor(html: string, name: string): string {
  const logo = Array.from(html.matchAll(/<img\b[^>]*>/gi))
    .find(([tag]) => {
      const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1];
      return alt && name.toLowerCase().includes(alt.trim().toLowerCase()) && alt.trim().length > 2;
    })?.[0]
    .match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1]
    ?.replace(/&amp;/g, '&');
  // Exact's image takes a data: URL of at most 1 MiB.
  if (logo && /^https?:/i.test(logo)) return logo;
  if (logo?.startsWith('data:image/') && logo.length < 1_000_000) return logo;
  return '';
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BODY_SCRIPT = `
const content = document.getElementById('miwa-content');
let lastHeight = 0;
function reportHeight() {
  const height = Math.ceil(Math.max(content.scrollHeight, content.getBoundingClientRect().height)) + 4;
  if (height !== lastHeight) { lastHeight = height; parent.postMessage(String(height), '*'); }
}
new ResizeObserver(reportHeight).observe(content);
addEventListener('load', reportHeight);
reportHeight();`;

/** The reader's page: the sanitized body, its images allowed, nothing else loaded or run. */
function bodyDocument(html: string | undefined, plainText: string, nonce: string): string {
  const body = html
    ? html
    : `<pre>${escapeHtml(plainText || 'This message has no readable body.')}</pre>`;
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid: https: http:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src 'none'; media-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<base target="_blank">
<style>
:root { color-scheme: light; overflow-y: hidden; }
#miwa-content { display: flow-root; }
body { margin: 0; padding: 2px; font: 14px -apple-system, BlinkMacSystemFont, sans-serif; color: #202124; background: #ffffff; line-height: 1.5; overflow-wrap: anywhere; }
pre { white-space: pre-wrap; margin: 0; font: inherit; }
img { max-width: 100%; height: auto; }
blockquote { margin-left: 12px; padding-left: 10px; border-left: 2px solid #d1d1d6; color: #6e6e73; }
a { color: #0068da; }
</style>
</head><body><div id="miwa-content">${body}</div><script nonce="${nonce}">${BODY_SCRIPT}</script></body></html>`;
}

const BODY_FOLDER = 'app:/cache/bodies';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Writes a message's page to the cache, named by its content so an unchanged
 * body keeps its file (and the reader its scroll). The script's nonce is the
 * body's own digest, which the body cannot contain.
 */
async function writeBody(storage: Storage, html: string | undefined, plainText: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html ?? plainText)),
  );
  const name = hex(digest.slice(0, 16));
  const path = `${BODY_FOLDER}/${name}.html`;
  try {
    await storage.fs.stat(path);
  } catch {
    await storage.fs.mkdir(BODY_FOLDER).catch(() => undefined);
    await storage.fs.writeFile(
      path,
      new TextEncoder().encode(bodyDocument(html, plainText, hex(digest.slice(16)))),
    );
  }
  return path;
}

/** Messages whose cached HTML predates image support, already asked about this run. */
const imagesTried = new Map<string, boolean>();

async function restoreImages(store: Store, storage: Storage, detail: MailThreadDetail) {
  let changed = false;
  for (const message of detail.messages) {
    if (!message.safeHtml || message.safeHtml.startsWith('<!--miwa-images-v1-->')) continue;
    if (imagesTried.get(message.id) === true) continue;
    try {
      await withDb(storage, (db) => reloadMessageImages(store, db, detail.accountId, message.id));
      imagesTried.set(message.id, true);
      changed = true;
    } catch {
      imagesTried.set(message.id, false);
    }
  }
  return changed;
}

/** Forgets failed image restores so Retry images asks Gmail again. */
export function retryImages() {
  for (const [id, ok] of imagesTried) if (!ok) imagesTried.delete(id);
}

const emptyDetail = (error: string) => ({
  found: false,
  error,
  accountId: '',
  threadId: '',
  subject: '',
  done: false,
  unread: false,
  pinned: false,
  attachments: [],
  messages: [],
});

/** One conversation, or with `messageId` one email of it (a Gatekeeper review). */
export async function loadDetail(
  store: Store,
  storage: Storage,
  accountId: string,
  threadId: string,
  messageId: string,
  subject: string,
) {
  if (!accountId || !threadId) return emptyDetail('');
  try {
    let detail = await withDb(storage, (db) => loadThreadDetail(db, accountId, threadId));
    if (await restoreImages(store, storage, detail)) {
      detail = await withDb(storage, (db) => loadThreadDetail(db, accountId, threadId));
    }
    const summary = (await withDb(storage, loadThreads)).find(
      (thread) => thread.accountId === accountId && thread.threadId === threadId,
    );
    let messages = detail.messages;
    if (messageId) {
      messages = messages.filter((item) => item.id === messageId);
      if (!messages.length) throw new Error('This email is no longer available locally.');
    }
    const rows = [];
    for (const message of messages) {
      const sender = message.addresses.find((item) => item.kind === 'from');
      const name = sender ? addressLabel(sender) : message.sender;
      const avatar = logoFor(message.safeHtml ?? '', name);
      rows.push({
        id: message.id,
        name,
        initials: name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0] ?? '')
          .join('')
          .toUpperCase(),
        avatar,
        from: sender ? [toAddress(sender, avatar)] : [],
        to: message.addresses
          .filter((item) => item.kind === 'to')
          .map((item) => toAddress(item, '')),
        recipients: message.recipients || 'undisclosed recipients',
        addresses: message.addresses.map((item) =>
          toAddress(item, item.address && item.address === sender?.address ? avatar : ''),
        ),
        sentAt: message.sentAt,
        body: await writeBody(storage, message.safeHtml, message.plainText),
        imageError: imagesTried.get(message.id) === false,
      });
    }
    return {
      found: true,
      error: '',
      accountId,
      threadId,
      subject: (messageId ? subject : detail.subject) || '(No subject)',
      done: summary?.done ?? false,
      unread: summary?.unread ?? false,
      pinned: summary?.pinned ?? false,
      attachments: messages
        .flatMap((message) => message.attachments)
        .map((attachment) => {
          const [symbol, color] = iconFor(attachment);
          return {
            id: attachment.id ?? '',
            filename: attachment.filename || 'Attachment',
            symbol,
            color,
          };
        }),
      messages: rows,
    };
  } catch (error) {
    return emptyDetail(messageFor(error));
  }
}

const avatarColors = ['#5B7CFA', '#8B5CF6', '#D05B9C', '#E66A4E', '#C58A20', '#3A9B72', '#338BA8'];

function senderIdentity(name: string, email: string) {
  const parts = (name || email.split('@')[0]).split(/[\s._-]+/).filter(Boolean);
  const initials =
    `${parts[0]?.[0] ?? '?'}${parts.length > 1 ? parts.at(-1)![0] : ''}`.toUpperCase();
  let hash = 0;
  for (const character of email) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return { initials, color: avatarColors[Math.abs(hash) % avatarColors.length] };
}

const emailCount = (count: number) => `${count} ${count === 1 ? 'email' : 'emails'}`;

const toSender = (sender: GatekeeperSender) => {
  const identity = senderIdentity(sender.displayName, sender.email);
  return {
    email: sender.email,
    title: sender.displayName || sender.email,
    subtitle: sender.displayName ? sender.email : '',
    initials: identity.initials,
    color: identity.color,
    blocked: sender.status === 'blocked',
    countLabel: emailCount(sender.messages.length),
    messages: sender.messages.map((message: GatekeeperMessage) => ({
      id: message.id,
      accountId: message.accountId,
      accountEmail: message.accountEmail,
      threadId: message.threadId,
      providerMessageId: message.providerMessageId,
      subject: message.subject || '(No subject)',
      snippet: message.snippet,
      sentAt: message.sentAt,
    })),
  };
};

/** Gatekeeper's senders for one tab (0 new, 1 blocked) and search. */
export async function loadGatekeeper(storage: Storage, tab: number, query: string, now: number) {
  try {
    const overview = await withDb(storage, (db) => loadGatekeeperOverview(db, now));
    const search = query.trim().toLowerCase();
    const senders = (tab === 0 ? overview.pending : overview.blocked).filter(
      (sender) =>
        !search ||
        `${sender.displayName} ${sender.email}`.toLowerCase().includes(search) ||
        sender.messages.some((message) =>
          `${message.subject} ${message.snippet}`.toLowerCase().includes(search),
        ),
    );
    return {
      loaded: true,
      error: '',
      pendingCount: overview.pending.length,
      blockedCount: overview.blocked.length,
      senders: senders.map(toSender),
    };
  } catch (error) {
    return {
      loaded: false,
      error: messageFor(error),
      pendingCount: 0,
      blockedCount: 0,
      senders: [],
    };
  }
}

export async function loadPrefs(store: Store, storage: Storage) {
  const preferences = await withDb(storage, loadPreferences);
  return {
    showPreviews: preferences.showPreviews,
    notificationsEnabled: preferences.notificationsEnabled,
    notificationsSound: preferences.notificationsSound,
    notificationsBadge: preferences.notificationsBadge,
    notificationsShowPreview: preferences.notificationsShowPreview,
    notificationsDndEnabled: preferences.notificationsDndEnabled,
    notificationsDndStartHour: preferences.notificationsDndStartHour,
    notificationsDndEndHour: preferences.notificationsDndEndHour,
    accounts: listAccounts(store).map((account) => ({
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      notified: !preferences.mutedAccountIds.includes(account.id),
    })),
  };
}
