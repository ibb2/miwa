import { gmailAccountAuth } from './accounts';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

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

type XhrResponse = { status: number; text: string };

function xhrRequest(
  method: string,
  url: string,
  accessToken: string,
  body?: string,
  signal?: AbortSignal,
): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);

    request.open(method, url, true);
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    if (body) request.setRequestHeader('Content-Type', 'application/json');
    request.onload = () => {
      cleanup();
      resolve({ status: request.status, text: request.responseText ?? '' });
    };
    request.onerror = () => {
      cleanup();
      reject(new Error('Network request failed'));
    };
    request.onabort = () => {
      cleanup();
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      reject(error);
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    request.send(body);
  });
}

function toGmailError(response: XhrResponse): GmailApiError {
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
 * Performs one authenticated Gmail API call. A 401 retries once with a fresh
 * access token; transient server errors retry twice with backoff.
 */
async function gmailFetch(
  accountId: string,
  method: 'GET' | 'POST',
  path: string,
  body?: string,
  signal?: AbortSignal,
  attempt = 0,
  refreshed = false,
): Promise<XhrResponse> {
  const token = await gmailAccountAuth.getAccessToken(accountId, refreshed);
  let response: XhrResponse;
  try {
    response = await xhrRequest(method, `${GMAIL_API}${path}`, token.accessToken, body, signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GmailApiError('Unable to reach Gmail. Check your connection.', 0);
  }

  if (response.status === 401 && !refreshed) {
    return gmailFetch(accountId, method, path, body, signal, attempt, true);
  }
  if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
    await wait(400 * 2 ** attempt);
    return gmailFetch(accountId, method, path, body, signal, attempt + 1, refreshed);
  }
  if (response.status < 200 || response.status >= 300) throw toGmailError(response);
  return response;
}

/** Authenticated read-only Gmail GET. Never mutates server-side mail. */
export async function gmailGet<T>(
  accountId: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await gmailFetch(accountId, 'GET', path, undefined, signal);
  return JSON.parse(response.text) as T;
}

function modifyThread(
  accountId: string,
  threadId: string,
  modification: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  return gmailFetch(
    accountId,
    'POST',
    `/threads/${encodeURIComponent(threadId)}/modify`,
    JSON.stringify(modification),
  ).then(() => undefined);
}

/** Marks every message in a Gmail thread read or unread. */
export function setGmailThreadReadState(
  accountId: string,
  threadId: string,
  unread: boolean,
): Promise<void> {
  return modifyThread(
    accountId,
    threadId,
    unread ? { addLabelIds: ['UNREAD'] } : { removeLabelIds: ['UNREAD'] },
  );
}

/** Removes a Gmail thread from the inbox without deleting it. */
export function archiveGmailThread(accountId: string, threadId: string): Promise<void> {
  return modifyThread(accountId, threadId, { removeLabelIds: ['INBOX'] });
}

/**
 * Runs a Gmail mutation, re-authorizing the account once when the stored
 * OAuth grant no longer covers the required scope.
 */
export async function withGmailReauth<T>(accountId: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof GmailApiError) || !error.requiresReauthentication) throw error;
    await gmailAccountAuth.reauthorizeAccount(accountId);
    return action();
  }
}

/** Moves one message to Gmail Trash, where it can be restored. */
export async function trashGmailMessage(accountId: string, messageId: string): Promise<void> {
  await gmailFetch(accountId, 'POST', `/messages/${encodeURIComponent(messageId)}/trash`);
}

export async function trashGmailThread(accountId: string, threadId: string): Promise<void> {
  await gmailFetch(accountId, 'POST', `/threads/${encodeURIComponent(threadId)}/trash`);
}
