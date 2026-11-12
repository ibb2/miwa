import type { Store } from '../app.contract.d.ts';
import { optStr, str, type Db } from './db';
import { gmailGet } from './gmail';
import {
  collectLeafParts,
  decodeBase64UrlBytes,
  isBodyPart,
  sanitizeEmailHtml,
  type GmailPart,
} from './gmail-content';
import { mailChanged } from './thread-store';

export function encodeBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
}

export function inlineImageHtml(
  html: string | undefined,
  images: Array<{ contentId: string | null; mimeType: string; data: Uint8Array | null }>,
): string | undefined {
  if (!html) return html;
  const sources = new Map<string, string>();
  for (const image of images) {
    if (!image.contentId || !image.data || !/^image\/[a-z0-9.+-]+$/i.test(image.mimeType)) continue;
    sources.set(
      image.contentId.replace(/^<|>$/g, ''),
      `data:${image.mimeType};base64,${encodeBase64(image.data)}`,
    );
  }
  return html.replace(/cid:([^\s"'<>]+)/gi, (original, id: string) => {
    try {
      return sources.get(decodeURIComponent(id)) ?? original;
    } catch {
      return original;
    }
  });
}

/**
 * Older cached messages had image URLs removed. Restores their authored HTML
 * from Gmail once the reader asks to retry images.
 */
export async function reloadMessageImages(
  store: Store,
  db: Db,
  accountId: string,
  messageId: string,
): Promise<void> {
  const message = await db.get(
    'SELECT provider_message_id, html_body FROM mail_messages WHERE id = ? AND account_id = ?',
    [messageId, accountId],
  );
  if (!message) throw new Error('This message is no longer available.');
  const html = optStr(message.html_body);
  if (!html || html.startsWith('<!--miwa-images-v1-->')) return;
  const providerMessageId = str(message.provider_message_id);
  const payload = await gmailGet<{ payload?: GmailPart }>(
    store,
    accountId,
    `/messages/${encodeURIComponent(providerMessageId)}?format=full`,
  );
  const parts = collectLeafParts(payload.payload).filter(
    ({ part }) => isBodyPart(part) && part.mimeType === 'text/html',
  );
  const bodies = await Promise.all(
    parts.map(async ({ part }) => {
      const body = part.body?.attachmentId
        ? await gmailGet<{ data?: string }>(
            store,
            accountId,
            `/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
          )
        : part.body;
      return new TextDecoder().decode(decodeBase64UrlBytes(body?.data));
    }),
  );
  if (!bodies.length) return;
  await db.run('UPDATE mail_messages SET html_body = ? WHERE id = ? AND account_id = ?', [
    sanitizeEmailHtml(bodies.join('\n')),
    messageId,
    accountId,
  ]);
  mailChanged();
}
