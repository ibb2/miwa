import type { AccountInboxPage, MailAttachment, MailThreadSummary } from './types';

export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};

export function decodeBase64UrlBytes(value?: string): Uint8Array {
  if (!value) return new Uint8Array();
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function decodeBase64Url(value?: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|video|audio|source|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|video|audio|source|link|meta|base)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(src|srcset|poster|background|xlink:href)\s*=\s*("https?:[^"]*"|'https?:[^']*'|https?:[^\s>]+)/gi, '')
    .replace(/\s+style\s*=\s*("[^"]*url\([^)]*\)[^"]*"|'[^']*url\([^)]*\)[^']*')/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export function extractMailBody(part: GmailPart | undefined): {
  plain: string[];
  html: string[];
  attachments: MailAttachment[];
} {
  const result = { plain: [] as string[], html: [] as string[], attachments: [] as MailAttachment[] };
  function visit(current: GmailPart | undefined) {
    if (!current) return;
    const filename = current.filename?.trim();
    if (filename) {
      result.attachments.push({
        id: current.body?.attachmentId,
        filename,
        mimeType: current.mimeType ?? 'application/octet-stream',
        size: current.body?.size ?? 0,
      });
    } else if (current.mimeType === 'text/plain') {
      result.plain.push(decodeBase64Url(current.body?.data));
    } else if (current.mimeType === 'text/html') {
      result.html.push(decodeBase64Url(current.body?.data));
    }
    current.parts?.forEach(visit);
  }
  visit(part);
  return result;
}

export function compareThreads(a: MailThreadSummary, b: MailThreadSummary): number {
  return b.receivedAt - a.receivedAt || a.accountId.localeCompare(b.accountId) || a.threadId.localeCompare(b.threadId);
}

export function mergeThreadSummaries(
  existing: readonly MailThreadSummary[],
  incoming: readonly MailThreadSummary[]
): MailThreadSummary[] {
  const threadsById = new Map<string, MailThreadSummary>();
  existing.forEach((thread) => threadsById.set(`${thread.accountId}:${thread.threadId}`, thread));
  incoming.forEach((thread) => threadsById.set(`${thread.accountId}:${thread.threadId}`, thread));
  return Array.from(threadsById.values()).sort(compareThreads);
}

export function mergeAccountThreads(pages: Iterable<AccountInboxPage>): MailThreadSummary[] {
  return Array.from(pages).flatMap((page) => page.threads).sort(compareThreads);
}
