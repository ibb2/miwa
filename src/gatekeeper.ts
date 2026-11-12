import type { SQLCommand } from '../app.contract.d.ts';
import { json, num, optStr, str, type Db } from './db';
import { mailChanged } from './thread-store';

export type GatekeeperStatus = 'pending' | 'approved' | 'blocked';

export type GatekeeperMessage = {
  id: string;
  accountId: string;
  accountEmail: string;
  providerMessageId: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  sentAt: number;
};

export type GatekeeperSender = {
  email: string;
  displayName: string;
  status: GatekeeperStatus;
  firstSeenAt: number;
  lastSeenAt: number;
  messageCount: number;
  messages: GatekeeperMessage[];
};

export type GatekeeperOverview = {
  activatedAt: number;
  pending: GatekeeperSender[];
  blocked: GatekeeperSender[];
};

type DiscoveredSender = {
  email: string;
  displayName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  needsReview: boolean;
  messagesById: Map<string, GatekeeperMessage>;
};

const normalizeSenderAddress = (value: string) => value.trim().toLowerCase();

/**
 * The activation timestamp: Gatekeeper only reviews senders that arrived after
 * it first ran, so an existing mailbox is not flagged as new on every launch.
 */
async function loadActivationTime(db: Db, now: number): Promise<number> {
  const setting = await db.get('SELECT activated_at FROM gatekeeper_settings WHERE id = 1');
  if (setting) return num(setting.activated_at);
  await db.run('INSERT INTO gatekeeper_settings (id, activated_at) VALUES (1, ?)', [now]);
  return now;
}

/** Discovers new inbox senders, including all their available local emails for review. */
async function discoverSenders(db: Db, activatedAt: number) {
  const addressRows = await db.all(
    `SELECT a.address, a.name, m.id AS message_id, m.provider_message_id, t.provider_thread_id,
       m.account_id, m.sender, m.subject, m.snippet, m.sent_at, m.label_ids
     FROM mail_message_addresses a
     JOIN mail_messages m ON a.message_id = m.id
     JOIN mail_threads t ON t.id = m.thread_id
     WHERE a.kind = 'from' ORDER BY m.sent_at ASC`,
  );
  const accountRows = await db.all('SELECT id, email FROM mail_accounts');
  const accountEmails = new Map(accountRows.map((row) => [str(row.id), str(row.email)]));
  const ownAddresses = new Set(accountRows.map((row) => normalizeSenderAddress(str(row.email))));
  const senders = new Map<string, DiscoveredSender>();

  for (const [index, row] of addressRows.entries()) {
    if (index > 0 && index % 1000 === 0) await scheduler.yield();
    const address = optStr(row.address);
    const labelIds = json<string[]>(row.label_ids, []);
    if (!address || labelIds.includes('TRASH') || labelIds.includes('SPAM')) continue;
    const email = normalizeSenderAddress(address);
    if (!email || ownAddresses.has(email)) continue;

    const messageId = str(row.message_id);
    const sentAt = num(row.sent_at);
    const accountId = str(row.account_id);
    const message: GatekeeperMessage = {
      id: messageId,
      accountId,
      accountEmail: accountEmails.get(accountId) ?? '',
      providerMessageId: str(row.provider_message_id),
      threadId: str(row.provider_thread_id),
      sender: str(row.sender),
      subject: str(row.subject),
      snippet: str(row.snippet),
      sentAt,
    };
    const displayName = optStr(row.name)?.trim() ?? '';
    const needsReview = sentAt >= activatedAt && labelIds.includes('INBOX');
    const existing = senders.get(email);
    if (existing) {
      existing.needsReview ||= needsReview;
      existing.displayName = displayName || existing.displayName;
      existing.firstSeenAt = Math.min(existing.firstSeenAt, sentAt);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, sentAt);
      existing.messagesById.set(messageId, message);
    } else {
      senders.set(email, {
        email,
        displayName,
        firstSeenAt: sentAt,
        lastSeenAt: sentAt,
        needsReview,
        messagesById: new Map([[messageId, message]]),
      });
    }
  }
  return senders;
}

/** Upserts discovered senders without touching decided statuses. */
async function persistDiscoveredSenders(
  db: Db,
  senders: ReadonlyMap<string, DiscoveredSender>,
  now: number,
) {
  const commands: SQLCommand[] = [];
  for (const sender of senders.values()) {
    if (!sender.needsReview) continue;
    commands.push({
      sql: `INSERT INTO gatekeeper_senders (email, display_name, status, first_seen_at, last_seen_at,
              message_count, updated_at)
            VALUES (?, ?, 'pending', ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name,
              first_seen_at = excluded.first_seen_at, last_seen_at = excluded.last_seen_at,
              message_count = excluded.message_count, updated_at = excluded.updated_at`,
      params: [
        sender.email,
        sender.displayName,
        sender.firstSeenAt,
        sender.lastSeenAt,
        sender.messagesById.size,
        now,
      ],
    });
  }
  await db.batch(commands);
}

export async function loadGatekeeperOverview(db: Db, now: number): Promise<GatekeeperOverview> {
  const activatedAt = await loadActivationTime(db, now);
  const discovered = await discoverSenders(db, activatedAt);
  await persistDiscoveredSenders(db, discovered, now);

  const rows = await db.all('SELECT * FROM gatekeeper_senders ORDER BY last_seen_at DESC');
  const pending: GatekeeperSender[] = [];
  const blocked: GatekeeperSender[] = [];
  for (const row of rows) {
    const email = str(row.email);
    const messages = [...(discovered.get(email)?.messagesById.values() ?? [])].sort(
      (left, right) => right.sentAt - left.sentAt,
    );
    const status = str(row.status) as GatekeeperStatus;
    const sender: GatekeeperSender = {
      email,
      displayName: str(row.display_name),
      status,
      firstSeenAt: num(row.first_seen_at),
      lastSeenAt: num(row.last_seen_at),
      messageCount: messages.length,
      messages,
    };
    if (status === 'pending' && messages.length) pending.push(sender);
    if (status === 'blocked') blocked.push(sender);
  }
  return { activatedAt, pending, blocked };
}

export async function setGatekeeperSenderStatus(
  db: Db,
  email: string,
  status: GatekeeperStatus,
  now: number,
) {
  await db.run('UPDATE gatekeeper_senders SET status = ?, updated_at = ? WHERE email = ?', [
    status,
    now,
    normalizeSenderAddress(email),
  ]);
  mailChanged();
}
