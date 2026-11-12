import { oauth, type OAuthResult, type OAuthStore } from '@exact/oauth';
import type { Store } from '../app.contract.d.ts';
import type { ConnectedAccount } from './types';

const CLIENT_ID = '611007919856-aj6ui4cnma1qojqi0iggbo1g8emg8p66.apps.googleusercontent.com';
const REVERSED_CLIENT_ID =
  'com.googleusercontent.apps.611007919856-aj6ui4cnma1qojqi0iggbo1g8emg8p66';
export const OAUTH_CALLBACK = `${REVERSED_CLIENT_ID}:/oauth2redirect`;
const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

/** The secret holding every account's metadata and OAuth session. */
export const ACCOUNTS_SECRET = 'miwa.gmail.accounts';
/** The name the OAuth package keeps a session under; each account's is mapped into ACCOUNTS_SECRET. */
const SESSION_KEY = 'miwa.gmail.session';

export const gmailProvider = oauth({
  issuer: 'https://accounts.google.com',
  issuerAliases: ['accounts.google.com'],
  clientId: CLIENT_ID,
  callback: OAUTH_CALLBACK,
  scopes: ['openid', 'email', 'profile', GMAIL_MODIFY_SCOPE],
  key: SESSION_KEY,
  apis: ['https://gmail.googleapis.com'],
  authorizationParams: { access_type: 'offline', prompt: 'consent select_account' },
});

type Saved = { accounts: ConnectedAccount[]; sessions: Record<string, string> };

function load(store: Store): Saved {
  try {
    const value = store.get(ACCOUNTS_SECRET);
    if (value) {
      const saved = JSON.parse(value) as Partial<Saved>;
      return { accounts: saved.accounts ?? [], sessions: saved.sessions ?? {} };
    }
  } catch {
    // An unreadable record is treated as no accounts; Settings connects them again.
  }
  return { accounts: [], sessions: {} };
}

function save(store: Store, saved: Saved) {
  store.set(ACCOUNTS_SECRET, JSON.stringify(saved));
}

/** One account's view of the store: the OAuth package's session name maps to that account's entry. */
function accountStore(store: Store, accountId: string): OAuthStore {
  return {
    get: (name) =>
      name === SESSION_KEY ? (load(store).sessions[accountId] ?? null) : store.get(name),
    set: (name, value) => {
      if (name !== SESSION_KEY) return store.set(name, value);
      const saved = load(store);
      saved.sessions[accountId] = value;
      save(store, saved);
    },
    forget: (name) => {
      if (name !== SESSION_KEY) return store.forget(name);
      const saved = load(store);
      delete saved.sessions[accountId];
      save(store, saved);
    },
  };
}

/** A session not yet tied to an account, used while a new sign-in is in progress. */
let pending: string | null = null;
const pendingStore = (store: Store): OAuthStore => ({
  get: (name) => (name === SESSION_KEY ? pending : store.get(name)),
  set: (name, value) => (name === SESSION_KEY ? void (pending = value) : store.set(name, value)),
  forget: (name) => (name === SESSION_KEY ? void (pending = null) : store.forget(name)),
});

export function listAccounts(store: Store): ConnectedAccount[] {
  const saved = load(store);
  return saved.accounts
    .filter((account) => saved.sessions[account.id] !== undefined)
    .sort((a, b) => a.order - b.order);
}

/** Readies the browser sign-in so a press opens it at once. */
export async function prepareSignIn(store: Store): Promise<string> {
  const session = await gmailProvider.session(pendingStore(store));
  return session.error;
}

function failure(result: OAuthResult): Error {
  return new Error(result.error || 'Could not connect Gmail.');
}

function accountFromClaims(store: OAuthStore, order: number): ConnectedAccount {
  const claims = gmailProvider.claims(store) ?? {};
  const id = typeof claims.sub === 'string' ? claims.sub : '';
  const email = typeof claims.email === 'string' ? claims.email : '';
  if (!id || !email) throw new Error('Google did not return the account email.');
  return {
    id,
    provider: 'gmail',
    email,
    displayName: typeof claims.name === 'string' ? claims.name : '',
    avatarUrl: typeof claims.picture === 'string' ? claims.picture : undefined,
    order,
  };
}

export async function connectAccount(store: Store, now: number): Promise<ConnectedAccount> {
  const temporary = pendingStore(store);
  const result = await gmailProvider.signIn(temporary);
  if (!result.ok) throw failure(result);
  const session = pending;
  try {
    if (!session) throw new Error('Could not connect Gmail.');
    const saved = load(store);
    const previous = saved.accounts.find(
      (account) => account.id === gmailProvider.claims(temporary)?.sub,
    );
    const account = accountFromClaims(temporary, previous?.order ?? now);
    saved.accounts = [...saved.accounts.filter((item) => item.id !== account.id), account];
    saved.sessions[account.id] = session;
    save(store, saved);
    return account;
  } finally {
    pending = null;
  }
}

/** Signs an account in again when its grant no longer covers Gmail's scope. */
export async function reauthorizeAccount(store: Store, accountId: string): Promise<void> {
  const temporary = pendingStore(store);
  const result = await gmailProvider.signIn(temporary);
  try {
    if (!result.ok) throw failure(result);
    if (gmailProvider.claims(temporary)?.sub !== accountId) {
      throw new Error('Sign in with the same Google account to continue.');
    }
    const saved = load(store);
    if (pending) saved.sessions[accountId] = pending;
    save(store, saved);
  } finally {
    pending = null;
  }
}

export async function disconnectAccount(store: Store, accountId: string): Promise<void> {
  try {
    await gmailProvider.signOut(accountStore(store, accountId));
  } finally {
    const saved = load(store);
    saved.accounts = saved.accounts.filter((account) => account.id !== accountId);
    delete saved.sessions[accountId];
    save(store, saved);
  }
}

export function gmailFetch(store: Store, accountId: string, url: string, init?: RequestInit) {
  if (!load(store).sessions[accountId]) {
    throw new Error('This Gmail account needs to be connected again.');
  }
  return gmailProvider.fetch(accountStore(store, accountId), url, init);
}

/** Up to two uppercase letters used when an account has no profile image. */
export function accountInitials(account: ConnectedAccount): string {
  return (account.displayName || account.email)
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
