import { and, asc, eq, gte } from 'drizzle-orm';

import db from '../db/db';
import {
  gatekeeperSenders,
  gatekeeperSettings,
  mailAccounts,
  mailMessageAddresses,
  mailMessages,
} from '../db/schema';

export type GatekeeperStatus = 'pending' | 'approved' | 'blocked';

export type GatekeeperMessageSummary = {
  id: string;
  accountId: string;
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
  messages: GatekeeperMessageSummary[];
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
  messagesById: Map<string, GatekeeperMessageSummary>;
};

export function normalizeSenderAddress(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function preferredDisplayName(
  current: string,
  incoming: string | null,
): string {
  const candidate = incoming?.trim() ?? '';
  return candidate || current;
}

async function loadActivationTime(): Promise<number> {
  const setting = await db
    .select({ activatedAt: gatekeeperSettings.activatedAt })
    .from(gatekeeperSettings)
    .where(eq(gatekeeperSettings.id, 1))
    .get();

  if (setting) return setting.activatedAt;

  const activatedAt = Date.now();
  await db.insert(gatekeeperSettings).values({ id: 1, activatedAt });
  return activatedAt;
}

async function discoverSenders(
  activatedAt: number,
): Promise<Map<string, DiscoveredSender>> {
  const [addressRows, accountRows] = await Promise.all([
    db
      .select({
        address: mailMessageAddresses.address,
        displayName: mailMessageAddresses.name,
        messageId: mailMessages.id,
        accountId: mailMessages.accountId,
        sender: mailMessages.sender,
        subject: mailMessages.subject,
        snippet: mailMessages.snippet,
        sentAt: mailMessages.sentAt,
        labelIds: mailMessages.labelIds,
      })
      .from(mailMessageAddresses)
      .innerJoin(
        mailMessages,
        eq(mailMessageAddresses.messageId, mailMessages.id),
      )
      .where(and(
        eq(mailMessageAddresses.kind, 'from'),
        gte(mailMessages.sentAt, activatedAt),
      ))
      .orderBy(asc(mailMessages.sentAt)),
    db.select({ email: mailAccounts.email }).from(mailAccounts),
  ]);

  const ownAddresses = new Set(
    accountRows.map((account) => normalizeSenderAddress(account.email)),
  );
  const senders = new Map<string, DiscoveredSender>();

  for (const row of addressRows) {
    if (!row.address || !row.labelIds.includes('INBOX')) continue;
    const email = normalizeSenderAddress(row.address);
    if (!email || ownAddresses.has(email)) continue;

    const message: GatekeeperMessageSummary = {
      id: row.messageId,
      accountId: row.accountId,
      sender: row.sender,
      subject: row.subject,
      snippet: row.snippet,
      sentAt: row.sentAt,
    };
    const existing = senders.get(email);
    if (existing) {
      existing.displayName = preferredDisplayName(
        existing.displayName,
        row.displayName,
      );
      existing.firstSeenAt = Math.min(existing.firstSeenAt, row.sentAt);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, row.sentAt);
      existing.messagesById.set(row.messageId, message);
      continue;
    }

    senders.set(email, {
      email,
      displayName: preferredDisplayName('', row.displayName),
      firstSeenAt: row.sentAt,
      lastSeenAt: row.sentAt,
      messagesById: new Map([[row.messageId, message]]),
    });
  }

  return senders;
}

async function persistDiscoveredSenders(
  senders: ReadonlyMap<string, DiscoveredSender>,
): Promise<void> {
  const updatedAt = Date.now();

  await Promise.all(
    Array.from(senders.values(), (sender) =>
      db
        .insert(gatekeeperSenders)
        .values({
          email: sender.email,
          displayName: sender.displayName,
          status: 'pending',
          firstSeenAt: sender.firstSeenAt,
          lastSeenAt: sender.lastSeenAt,
          messageCount: sender.messagesById.size,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: gatekeeperSenders.email,
          set: {
            displayName: sender.displayName,
            firstSeenAt: sender.firstSeenAt,
            lastSeenAt: sender.lastSeenAt,
            messageCount: sender.messagesById.size,
            updatedAt,
          },
        }),
    ),
  );
}

function toGatekeeperSender(
  row: typeof gatekeeperSenders.$inferSelect,
  discovered?: DiscoveredSender,
): GatekeeperSender {
  return {
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    messageCount: row.messageCount,
    messages: discovered
      ? Array.from(discovered.messagesById.values()).sort(
          (left, right) => right.sentAt - left.sentAt,
        )
      : [],
  };
}

export async function loadGatekeeperOverview(): Promise<GatekeeperOverview> {
  const activatedAt = await loadActivationTime();
  const discovered = await discoverSenders(activatedAt);
  await persistDiscoveredSenders(discovered);

  const rows = await db
    .select()
    .from(gatekeeperSenders)
    .orderBy(asc(gatekeeperSenders.lastSeenAt));
  const pending: GatekeeperSender[] = [];
  const blocked: GatekeeperSender[] = [];

  for (const row of rows.reverse()) {
    const sender = toGatekeeperSender(row, discovered.get(row.email));
    if (row.status === 'pending') pending.push(sender);
    if (row.status === 'blocked') blocked.push(sender);
  }

  return { activatedAt, pending, blocked };
}

export async function setGatekeeperSenderStatus(
  email: string,
  status: GatekeeperStatus,
): Promise<void> {
  await db
    .update(gatekeeperSenders)
    .set({ status, updatedAt: Date.now() })
    .where(eq(gatekeeperSenders.email, normalizeSenderAddress(email)));
}
