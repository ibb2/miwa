import type { Store } from '../app.contract.d.ts';
import { gmailFetch, reauthorizeAccount } from './accounts';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
/** The default ceiling for a read; each running read reserves its ceiling from a 68 MiB budget. */
const DEFAULT_RESPONSE_BYTES = 4 * 1024 * 1024;

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requiresReauthentication = false,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

type GmailResponse = { status: number; text: string };

function toGmailError(response: GmailResponse): GmailApiError {
  let payload: { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null = null;
  try {
    payload = JSON.parse(response.text);
  } catch {
    // Non-JSON error bodies fall through to the generic message below.
  }
  const message = payload?.error?.message ?? `Gmail request failed (${response.status})`;
  const insufficientScope =
    payload?.error?.errors?.some((error) => error.reason === 'insufficientPermissions') ||
    /insufficient (authentication )?scopes?/i.test(message);
  return new GmailApiError(message, response.status, response.status === 401 || insufficientScope);
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Performs one authenticated Gmail API call. The OAuth package refreshes an
 * expired token once; transient server errors retry twice with backoff.
 * Reads leave the ordered request queue so several run at once.
 */
async function gmailRequest(
  store: Store,
  accountId: string,
  method: 'GET' | 'POST',
  path: string,
  body?: string,
  maxResponseBytes = DEFAULT_RESPONSE_BYTES,
  attempt = 0,
): Promise<GmailResponse> {
  let response: GmailResponse;
  try {
    const reply = await gmailFetch(store, accountId, `${GMAIL_API}${path}`, {
      method,
      ...(body ? { body, headers: { 'Content-Type': 'application/json' } } : {}),
      ...(method === 'GET' ? { exactIndependentHttp: { maxResponseBytes } } : {}),
    });
    response = { status: reply.status, text: await reply.text() };
  } catch (error) {
    if (error instanceof Error && (error as { signedOut?: boolean }).signedOut) {
      throw new GmailApiError('This Gmail account needs to be connected again.', 401, true);
    }
    if (error instanceof Error && error.message.includes('connected again')) throw error;
    throw new GmailApiError('Unable to reach Gmail. Check your connection.', 0);
  }

  if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
    await wait(400 * 2 ** attempt);
    return gmailRequest(store, accountId, method, path, body, maxResponseBytes, attempt + 1);
  }
  if (response.status < 200 || response.status >= 300) throw toGmailError(response);
  return response;
}

/** Authenticated read-only Gmail GET. Never mutates server-side mail. */
export async function gmailGet<T>(
  store: Store,
  accountId: string,
  path: string,
  maxResponseBytes?: number,
): Promise<T> {
  const response = await gmailRequest(store, accountId, 'GET', path, undefined, maxResponseBytes);
  return JSON.parse(response.text) as T;
}

function modifyThread(
  store: Store,
  accountId: string,
  threadId: string,
  modification: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  return gmailRequest(
    store,
    accountId,
    'POST',
    `/threads/${encodeURIComponent(threadId)}/modify`,
    JSON.stringify(modification),
  ).then(() => undefined);
}

/** Marks every message in a Gmail thread read or unread. */
export function setGmailThreadReadState(
  store: Store,
  accountId: string,
  threadId: string,
  unread: boolean,
): Promise<void> {
  return modifyThread(
    store,
    accountId,
    threadId,
    unread ? { addLabelIds: ['UNREAD'] } : { removeLabelIds: ['UNREAD'] },
  );
}

/** Removes a Gmail thread from the inbox without deleting it. */
export function archiveGmailThread(store: Store, accountId: string, threadId: string) {
  return modifyThread(store, accountId, threadId, { removeLabelIds: ['INBOX'] });
}

/**
 * Runs a Gmail mutation, re-authorizing the account once when the stored
 * OAuth grant no longer covers the required scope.
 */
export async function withGmailReauth<T>(
  store: Store,
  accountId: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof GmailApiError) || !error.requiresReauthentication) throw error;
    await reauthorizeAccount(store, accountId);
    return action();
  }
}

/** Moves one message to Gmail Trash, where it can be restored. */
export async function trashGmailMessage(store: Store, accountId: string, messageId: string) {
  await gmailRequest(store, accountId, 'POST', `/messages/${encodeURIComponent(messageId)}/trash`);
}

export async function trashGmailThread(store: Store, accountId: string, threadId: string) {
  await gmailRequest(store, accountId, 'POST', `/threads/${encodeURIComponent(threadId)}/trash`);
}
