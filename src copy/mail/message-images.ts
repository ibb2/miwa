import { and, eq } from 'drizzle-orm';
import { db } from '../db/db';
import { mailAttachments, mailMessages } from '../db/schema';
import { gmailGet } from './gmail';
import {
  collectLeafParts,
  decodeBase64UrlBytes,
  isBodyPart,
  sanitizeEmailHtml,
  type GmailPart,
} from './gmail-content';
import type { MailMessage } from './types';

export function inlineImageHtml(
  html: string | undefined,
  images: Array<{
    contentId: string | null;
    mimeType: string;
    data: Uint8Array | null;
  }>,
): string | undefined {
  if (!html) return html;
  const sources = new Map<string, string>();
  for (const image of images) {
    if (!image.contentId || !image.data || !/^image\/[a-z0-9.+-]+$/i.test(image.mimeType)) continue;
    let binary = '';
    for (const byte of image.data) binary += String.fromCharCode(byte);
    sources.set(
      image.contentId.replace(/^<|>$/g, ''),
      `data:${image.mimeType};base64,${globalThis.btoa(binary)}`,
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

export async function loadMessageImages(
  accountId: string,
  message: MailMessage,
): Promise<string | undefined> {
  if (!message.safeHtml || message.safeHtml.startsWith('<!--miwa-images-v1-->'))
    return message.safeHtml;
  // Older cached messages had image URLs removed. Restore their authored HTML once requested.
  const payload = await gmailGet<{ payload?: GmailPart }>(
    accountId,
    `/messages/${encodeURIComponent(message.providerMessageId)}?format=full`,
  );
  const parts = collectLeafParts(payload.payload).filter(
    ({ part }) => isBodyPart(part) && part.mimeType === 'text/html',
  );
  const bodies = await Promise.all(
    parts.map(async ({ part }) => {
      const body = part.body?.attachmentId
        ? await gmailGet<{ data?: string }>(
            accountId,
            `/messages/${encodeURIComponent(message.providerMessageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
          )
        : part.body;
      return new TextDecoder().decode(decodeBase64UrlBytes(body?.data));
    }),
  );
  if (!bodies.length) return message.safeHtml;
  const html = sanitizeEmailHtml(bodies.join('\n'));
  await db
    .update(mailMessages)
    .set({ htmlBody: html })
    .where(and(eq(mailMessages.id, message.id), eq(mailMessages.accountId, accountId)));
  const images = await db
    .select({
      contentId: mailAttachments.contentId,
      mimeType: mailAttachments.mimeType,
      data: mailAttachments.data,
    })
    .from(mailAttachments)
    .where(and(eq(mailAttachments.messageId, message.id), eq(mailAttachments.inline, true)));
  return inlineImageHtml(html, images);
}
