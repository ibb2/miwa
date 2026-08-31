import { gmailAccountAuth } from './account-auth';
import { mailCategoryForLabels } from './mail-category';
import {
  compareThreads,
  extractMailBody,
  gmailThreadReadStateModification,
  sanitizeEmailHtml,
  stripHtml,
  type GmailPart,
} from './gmail-utils';
import type {
  AccountInboxPage,
  MailMessage,
  MailThreadDetail,
  MailThreadSummary,
} from './types';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PAGE_SIZE = 25;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

type XhrResponse = {
  status: number;
  text: string;
};

type GmailHeader = { name: string; value: string };
type GmailMessage = {
  id: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};
type GmailThread = { id: string; messages?: GmailMessage[] };
type GmailThreadList = {
  threads?: Array<{ id: string }>;
  nextPageToken?: string;
};

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requiresReauthentication = false
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function gmailRequest(
  url: string,
  accessToken: string,
  signal?: AbortSignal,
  method = 'GET',
  body?: string,
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

function gmailError(response: XhrResponse): GmailApiError {
  const payload = (() => {
    try {
      return JSON.parse(response.text) as {
        error?: {
          message?: string;
          errors?: Array<{ reason?: string }>;
        };
      };
    } catch {
      return null;
    }
  })();
  const message = payload?.error?.message ?? `Gmail request failed (${response.status})`;
  const insufficientScope = payload?.error?.errors?.some(
    (error) => error.reason === 'insufficientPermissions',
  ) || /insufficient (authentication )?scopes?/i.test(message);
  return new GmailApiError(
    message,
    response.status,
    response.status === 401 || insufficientScope,
  );
}

/**
 * Performs an authenticated, read-only Gmail API GET request.
 *
 * Keep mutation endpoints out of this helper so download/sync services cannot
 * accidentally alter labels, read state, or delete server-side mail.
 */
export async function gmailGet<T>(
  accountId: string,
  path: string,
  signal?: AbortSignal,
  attempt = 0,
  forceRefresh = false
): Promise<T> {
  const token = await gmailAccountAuth.getAccessToken(accountId, forceRefresh);
  let response: XhrResponse;

  try {
    response = await gmailRequest(`${GMAIL_API}${path}`, token.accessToken, signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GmailApiError('Unable to reach Gmail. Check your connection.', 0);
  }

  if (response.status === 401 && !forceRefresh) {
    return gmailGet(accountId, path, signal, attempt, true);
  }

  if (TRANSIENT_STATUSES.has(response.status) && attempt < 2) {
    await wait(400 * 2 ** attempt);
    return gmailGet(accountId, path, signal, attempt + 1, forceRefresh);
  }

  if (response.status < 200 || response.status >= 300) {
    throw gmailError(response);
  }

  return JSON.parse(response.text) as T;
}

/** Updates the UNREAD label for every message in a Gmail thread. */
export async function setGmailThreadReadState(
  accountId: string,
  threadId: string,
  unread: boolean,
  attempt = 0,
  forceRefresh = false,
): Promise<void> {
  const token = await gmailAccountAuth.getAccessToken(accountId, forceRefresh);
  let response: XhrResponse;
  try {
    response = await gmailRequest(
      `${GMAIL_API}/threads/${encodeURIComponent(threadId)}/modify`,
      token.accessToken,
      undefined,
      'POST',
      JSON.stringify(gmailThreadReadStateModification(unread)),
    );
  } catch {
    throw new GmailApiError('Unable to reach Gmail. Check your connection.', 0);
  }

  if (response.status === 401 && !forceRefresh) {
    return setGmailThreadReadState(accountId, threadId, unread, attempt, true);
  }
  if (TRANSIENT_STATUSES.has(response.status) && attempt < 2) {
    await wait(400 * 2 ** attempt);
    return setGmailThreadReadState(accountId, threadId, unread, attempt + 1, forceRefresh);
  }
  if (response.status < 200 || response.status >= 300) throw gmailError(response);
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}


function toSummary(accountId: string, thread: GmailThread): MailThreadSummary {
  const messages = thread.messages ?? [];
  const latest = messages.at(-1);
  const headers = latest?.payload?.headers;
  return {
    provider: 'gmail',
    accountId,
    threadId: thread.id,
    sender: header(headers, 'From') || 'Unknown sender',
    subject: header(headers, 'Subject') || '(No subject)',
    snippet: latest?.snippet ?? '',
    receivedAt: Number(latest?.internalDate ?? 0),
    unread: messages.some((message) => message.labelIds?.includes('UNREAD')),
    messageCount: messages.length,
    category: mailCategoryForLabels(latest?.labelIds ?? []),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  transform: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await transform(values[index]);
      }
    })
  );
  return results;
}

export async function fetchInboxPage(
  accountId: string,
  pageToken?: string,
  signal?: AbortSignal
): Promise<AccountInboxPage> {
  const query = new URLSearchParams({ maxResults: String(PAGE_SIZE), labelIds: 'INBOX' });
  if (pageToken) query.set('pageToken', pageToken);
  const list = await gmailGet<GmailThreadList>(accountId, `/threads?${query}`, signal);
  const threads = await mapWithConcurrency(list.threads ?? [], 5, async ({ id }) => {
    const params = new URLSearchParams({ format: 'metadata' });
    ['From', 'Subject', 'Date'].forEach((name) => params.append('metadataHeaders', name));
    const thread = await gmailGet<GmailThread>(
      accountId,
      `/threads/${encodeURIComponent(id)}?${params}`,
      signal
    );
    return toSummary(accountId, thread);
  });

  return {
    accountId,
    threads: threads.sort(compareThreads),
    nextPageToken: list.nextPageToken,
  };
}

function toMessage(message: GmailMessage): MailMessage {
  const bodies = extractMailBody(message.payload);
  const html = bodies.html.join('\n');
  const plainText = bodies.plain.join('\n').trim() || stripHtml(html);
  return {
    id: message.id,
    sender: header(message.payload?.headers, 'From') || 'Unknown sender',
    recipients: header(message.payload?.headers, 'To'),
    sentAt: Number(message.internalDate ?? 0),
    subject: header(message.payload?.headers, 'Subject') || '(No subject)',
    plainText,
    safeHtml: html ? sanitizeEmailHtml(html) : undefined,
    attachments: bodies.attachments,
  };
}

export async function fetchThreadDetail(
  accountId: string,
  threadId: string,
  signal?: AbortSignal
): Promise<MailThreadDetail> {
  const thread = await gmailGet<GmailThread>(
    accountId,
    `/threads/${encodeURIComponent(threadId)}?format=full`,
    signal
  );
  const messages = (thread.messages ?? []).map(toMessage).sort((a, b) => a.sentAt - b.sentAt);
  return {
    provider: 'gmail',
    accountId,
    threadId,
    subject: messages.at(-1)?.subject ?? '(No subject)',
    messages,
  };
}
