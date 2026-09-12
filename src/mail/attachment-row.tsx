import { useState } from 'react';
import { Button, Host, Image } from '@expo/ui/swift-ui';
import { accessibilityLabel, frame } from '@expo/ui/swift-ui/modifiers';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { colors } from '../components/native-colors';
import { messageFor } from './async';
import { downloadAttachment, downloadAttachments } from './attachment-export';
import type { MailAttachment } from './types';

type FileTypeIcon = {
  symbol: React.ComponentProps<typeof Image>['systemName'];
  color: string;
};

const fileTypeIcons: Record<string, FileTypeIcon> = {
  pdf: { symbol: 'doc.richtext', color: '#E5484D' },
  doc: { symbol: 'doc.text', color: '#2B579A' },
  docx: { symbol: 'doc.text', color: '#2B579A' },
  pages: { symbol: 'doc.text', color: '#D24726' },
  xls: { symbol: 'tablecells', color: '#217346' },
  xlsx: { symbol: 'tablecells', color: '#217346' },
  csv: { symbol: 'tablecells', color: '#217346' },
  numbers: { symbol: 'tablecells', color: '#217346' },
  ppt: { symbol: 'rectangle.on.rectangle', color: '#D24726' },
  pptx: { symbol: 'rectangle.on.rectangle', color: '#D24726' },
  key: { symbol: 'rectangle.on.rectangle', color: '#D24726' },
  zip: { symbol: 'doc.zipper', color: '#B07D36' },
  rar: { symbol: 'doc.zipper', color: '#B07D36' },
  '7z': { symbol: 'doc.zipper', color: '#B07D36' },
  gz: { symbol: 'doc.zipper', color: '#B07D36' },
  tar: { symbol: 'doc.zipper', color: '#B07D36' },
  png: { symbol: 'photo', color: '#8E5BD9' },
  jpg: { symbol: 'photo', color: '#8E5BD9' },
  jpeg: { symbol: 'photo', color: '#8E5BD9' },
  gif: { symbol: 'photo', color: '#8E5BD9' },
  heic: { symbol: 'photo', color: '#8E5BD9' },
  webp: { symbol: 'photo', color: '#8E5BD9' },
  tiff: { symbol: 'photo', color: '#8E5BD9' },
  svg: { symbol: 'photo', color: '#8E5BD9' },
  mp3: { symbol: 'music.note', color: '#D64BA3' },
  wav: { symbol: 'music.note', color: '#D64BA3' },
  m4a: { symbol: 'music.note', color: '#D64BA3' },
  aac: { symbol: 'music.note', color: '#D64BA3' },
  flac: { symbol: 'music.note', color: '#D64BA3' },
  mp4: { symbol: 'film', color: '#7A5AF8' },
  mov: { symbol: 'film', color: '#7A5AF8' },
  avi: { symbol: 'film', color: '#7A5AF8' },
  mkv: { symbol: 'film', color: '#7A5AF8' },
  txt: { symbol: 'doc.plaintext', color: '#6B7280' },
  md: { symbol: 'doc.plaintext', color: '#6B7280' },
  rtf: { symbol: 'doc.plaintext', color: '#6B7280' },
  html: { symbol: 'globe', color: '#0891B2' },
  htm: { symbol: 'globe', color: '#0891B2' },
  eml: { symbol: 'envelope', color: '#2563EB' },
  msg: { symbol: 'envelope', color: '#2563EB' },
  ics: { symbol: 'calendar', color: '#DC2626' },
};

const defaultIcon: FileTypeIcon = { symbol: 'doc', color: '#6B7280' };

function iconFor(attachment: MailAttachment): FileTypeIcon {
  const extension = attachment.filename.split('.').pop()?.toLowerCase();
  const byExtension = extension ? fileTypeIcons[extension] : undefined;
  if (byExtension) return byExtension;

  const [type, subtype = ''] = attachment.mimeType.toLowerCase().split('/');
  if (type === 'image') return fileTypeIcons.png;
  if (type === 'audio') return fileTypeIcons.mp3;
  if (type === 'video') return fileTypeIcons.mp4;
  if (subtype === 'pdf') return fileTypeIcons.pdf;
  if (subtype === 'csv') return fileTypeIcons.csv;
  if (type === 'application' && (subtype.includes('zip') || subtype.includes('compressed'))) {
    return fileTypeIcons.zip;
  }
  return defaultIcon;
}

function AttachmentPill({
  attachment,
  disabled,
  onDownload,
}: {
  attachment: MailAttachment;
  disabled: boolean;
  onDownload: () => void;
}) {
  const icon = iconFor(attachment);
  return (
    <Pressable
      accessibilityLabel={`Download ${attachment.filename || 'attachment'}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onDownload}
      tooltip={attachment.filename || 'Attachment'}
      style={({ pressed }) => ({ opacity: disabled ? 0.55 : pressed ? 0.7 : 1 })}
      className="w-[170px] h-[34px] flex-row items-center gap-[6px] px-[10px] rounded-[999px] border-continuous"
    >
      <View
        className="absolute inset-0 rounded-[999px] border-continuous"
        style={{ backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.separator }}
      >
        <View className="flex-1 flex-row items-center gap-[6px] px-[10px]">
          <Host style={{ width: 16, height: 16 }}>
            <Image
              systemName={icon.symbol}
              size={13}
              color={icon.color}
              modifiers={[frame({ width: 16, height: 16 })]}
            />
          </Host>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            className="flex-1 text-[12px]"
            style={{ color: colors.label }}
          >
            {attachment.filename || 'Attachment'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function AttachmentRow({ attachments }: { attachments: MailAttachment[] }) {
  const [busy, setBusy] = useState(false);
  const save = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert('Could not save attachments', messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-row items-center gap-[8px]">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {attachments.map((attachment) => (
          <AttachmentPill
            key={attachment.id ?? attachment.filename}
            attachment={attachment}
            disabled={busy}
            onDownload={() => void save(() => downloadAttachment(attachment))}
          />
        ))}
      </ScrollView>
      <Host style={{ width: 150, height: 34 }}>
        <Button
          variant="glass"
          controlSize="regular"
          disabled={busy}
          onPress={() => void save(() => downloadAttachments(attachments))}
          systemImage="arrow.down.circle"
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'trailing' }),
            accessibilityLabel(`Download all ${attachments.length} attachments`),
          ]}
        >
          {busy ? 'Saving…' : 'Download all'}
        </Button>
      </Host>
    </View>
  );
}
