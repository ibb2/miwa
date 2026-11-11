import type { ViewProps } from 'react-native';

export type ThreadRowAction = 'done' | 'read' | 'archive' | 'pin';

export type NativeThreadRowProps = ViewProps & {
  rowKey: string;
  sender: string;
  subject: string;
  preview: string;
  dateText: string;
  messageCount: number;
  unread: boolean;
  done: boolean;
  pinned: boolean;
  hasAttachments: boolean;
  showPreview: boolean;
  compact: boolean;
  accentHex: string;
  onRowPress?: (event: { nativeEvent: {} }) => void;
  onRowAction?: (event: { nativeEvent: { action: ThreadRowAction } }) => void;
};
