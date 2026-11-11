import type { NewMailMessageAddressRow } from '../db/schema';

export type GmailHeader = { name: string; value: string };

/** Subset of the Gmail MIME payload tree that Miwa reads. */
export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};

/** Finds a header by name (case-insensitive); returns '' when missing. */
export function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** Gmail encodes bodies as base64url; decode to raw bytes. */
export function decodeBase64UrlBytes(value?: string): Uint8Array {
  if (!value) return new Uint8Array();
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Best-effort plain text from HTML, used when a message has no text part. */
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

/**
 * Removes active content. The native viewer enforces network policy with CSP.
 */
export function sanitizeEmailHtml(html: string): string {
  return (
    '<!--miwa-images-v1-->' +
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(
        /<(script|iframe|object|embed|form|input|button|video|audio|source|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        '',
      )
      .replace(
        /<(script|iframe|object|embed|form|input|button|video|audio|source|link|meta|base)\b[^>]*\/?>/gi,
        '',
      )
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '')
  );
}

/** Splits a header address list on commas, ignoring commas inside quotes and angles. */
function splitAddressList(value: string): string[] {
  const addresses: string[] = [];
  let start = 0;
  let quoted = false;
  let angleDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && value[index - 1] !== '\\') quoted = !quoted;
    if (!quoted && character === '<') angleDepth += 1;
    if (!quoted && character === '>') angleDepth = Math.max(0, angleDepth - 1);
    if (!quoted && angleDepth === 0 && character === ',') {
      addresses.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  addresses.push(value.slice(start).trim());
  return addresses.filter(Boolean);
}

const addressHeaders: Array<{ headerName: string; kind: NewMailMessageAddressRow['kind'] }> = [
  { headerName: 'From', kind: 'from' },
  { headerName: 'Sender', kind: 'sender' },
  { headerName: 'Reply-To', kind: 'replyTo' },
  { headerName: 'To', kind: 'to' },
  { headerName: 'Cc', kind: 'cc' },
  { headerName: 'Bcc', kind: 'bcc' },
];

/** Turns From/To/Cc/... headers into address rows for offline recipient display. */
export function parseAddresses(
  messageId: string,
  sourceHeaders: GmailHeader[],
): NewMailMessageAddressRow[] {
  const result: NewMailMessageAddressRow[] = [];

  for (const { headerName, kind } of addressHeaders) {
    const values = sourceHeaders.filter(
      (item) => item.name.toLowerCase() === headerName.toLowerCase(),
    );
    let position = 0;
    for (const value of values) {
      for (const rawValue of splitAddressList(value.value)) {
        const angleMatch = rawValue.match(/^(.*?)<([^<>]+)>\s*$/);
        const address = (angleMatch?.[2] ?? rawValue).trim();
        const rawName = angleMatch?.[1]?.trim();
        result.push({
          messageId,
          kind,
          position,
          name: rawName ? rawName.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"') : null,
          address: address.includes('@') ? address : null,
          rawValue,
        });
        position += 1;
      }
    }
  }

  return result;
}

/** Extracts every `<message-id>` from a References header. */
export function parseReferences(value: string): Array<{ messageId: string }> {
  return Array.from(value.matchAll(/<([^<>]+)>/g), (match) => ({ messageId: match[1] }));
}

export function removeAngleBrackets(value: string): string {
  return value.trim().replace(/^<|>$/g, '');
}

/** Strips <> from a Content-ID header so it can match `cid:` URLs. */
export function contentId(part: GmailPart): string | undefined {
  const value = header(part.headers, 'Content-ID');
  return value ? removeAngleBrackets(value) : undefined;
}

export function contentDisposition(part: GmailPart): string {
  return header(part.headers, 'Content-Disposition');
}

/** Body parts are text/plain or text/html leaves that are not attachments. */
export function isBodyPart(part: GmailPart): boolean {
  return (
    (part.mimeType === 'text/plain' || part.mimeType === 'text/html') &&
    !part.filename?.trim() &&
    !contentDisposition(part).toLowerCase().startsWith('attachment')
  );
}

type CollectedPart = { part: GmailPart; path: string };

/** Flattens the MIME tree into its leaf parts, remembering each part's path. */
export function collectLeafParts(part: GmailPart | undefined, path = '0'): CollectedPart[] {
  if (!part) return [];
  if (part.parts?.length) {
    return part.parts.flatMap((child, index) => collectLeafParts(child, `${path}.${index}`));
  }
  return [{ part, path }];
}
