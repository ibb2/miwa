import { and, eq, inArray } from 'drizzle-orm';

import {
  saveAttachment as showSaveAttachmentPanel,
  saveAttachments as showSaveAttachmentsPanel,
  type AttachmentExport,
} from '../../modules/native-mail-viewer/src';
import { db } from '../db/db';
import { mailAttachments } from '../db/schema';
import type { MailAttachment } from './types';

function encodeBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
}

async function loadFiles(attachments: readonly MailAttachment[]): Promise<AttachmentExport[]> {
  const ids = attachments.flatMap((attachment) => (attachment.id ? [attachment.id] : []));
  if (ids.length !== attachments.length) throw new Error('An attachment is missing its local ID.');

  const rows = await db
    .select({
      id: mailAttachments.id,
      filename: mailAttachments.filename,
      data: mailAttachments.data,
    })
    .from(mailAttachments)
    .where(
      and(
        inArray(mailAttachments.id, ids),
        eq(mailAttachments.downloadState, 'complete'),
        eq(mailAttachments.inline, false),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));

  return attachments.map((attachment) => {
    const row = byId.get(attachment.id!);
    if (!row?.data)
      throw new Error(`${attachment.filename || 'Attachment'} is not available offline.`);
    return {
      filename: row.filename || attachment.filename || 'Attachment',
      dataBase64: encodeBase64(row.data),
    };
  });
}

export async function downloadAttachment(attachment: MailAttachment): Promise<void> {
  const [file] = await loadFiles([attachment]);
  await showSaveAttachmentPanel(file);
}

export async function downloadAttachments(attachments: readonly MailAttachment[]): Promise<void> {
  if (!attachments.length) return;
  await showSaveAttachmentsPanel(await loadFiles(attachments));
}
