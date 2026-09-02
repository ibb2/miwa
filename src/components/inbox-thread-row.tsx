import { memo } from 'react';
import { useRecyclingState } from '@legendapp/list/react-native';
import {
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { InboxSection } from '../mail/inbox-layout';
import type { ConnectedAccount, MailThreadSummary } from '../mail/types';
import { NativeActionButton } from './native-action-button';
import { NativeSymbol } from './native-symbol';

const avatarColors = [
  '#5B7CFA',
  '#8B5CF6',
  '#D05B9C',
  '#E66A4E',
  '#C58A20',
  '#3A9B72',
  '#338BA8',
] as const;

function senderAvatar(sender: string) {
  const bracketIndex = sender.lastIndexOf('<');
  const displayName = bracketIndex > 0
    ? sender.slice(0, bracketIndex).trim().replace(/^['"]|['"]$/g, '')
    : '';
  const email = bracketIndex >= 0
    ? sender.slice(bracketIndex + 1).replace(/>.*$/, '').trim().toLowerCase()
    : sender.trim().toLowerCase();
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  let hash = 0;
  for (const character of email) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return {
    color: avatarColors[Math.abs(hash) % avatarColors.length],
    email,
    initials: nameParts.length
      ? `${nameParts[0][0]}${nameParts.length > 1 ? nameParts.at(-1)![0] : ''}`.toUpperCase()
      : '@',
    usesInitials: nameParts.length > 0,
  };
}

function formatDate(milliseconds: number) {
  const date = new Date(milliseconds);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export type InboxThreadRowProps = {
  account?: ConnectedAccount;
  comfortable: boolean;
  presentation: InboxSection['presentation'];
  roundBottom: boolean;
  showPreview: boolean;
  thread: MailThreadSummary;
  onPress: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
};

export const InboxThreadRow = memo(function InboxThreadRow({
  account,
  comfortable,
  presentation,
  roundBottom,
  showPreview,
  thread,
  onPress,
  onArchive,
  onSetPinned,
  onToggleRead,
}: InboxThreadRowProps) {
  const [hovered, setHovered] = useRecyclingState(false);
  const avatar = senderAvatar(thread.sender);
  const senderImageUri = account?.email.toLowerCase() === avatar.email
    ? account.avatarUrl
    : undefined;

  return (
    <Pressable
      accessible={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.row,
        presentation === 'plain' && styles.plainRow,
        comfortable && styles.comfortableRow,
        roundBottom && styles.roundBottom,
      ]}
    >
      <Pressable
        accessibilityLabel={`${thread.sender}, ${thread.subject}`}
        accessibilityRole="button"
        onBlur={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onPress={() => onPress(thread)}
        style={({ pressed }) => [styles.pressTarget, pressed && styles.pressed]}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.unreadMark, !thread.unread && styles.readMark]}
        />
        <NativeSymbol
          color={avatar.color}
          fallback={avatar.initials}
          imageUri={senderImageUri}
          preferFallback={avatar.usesInitials}
          systemName="at"
        />
        <View style={styles.copy}>
          <Text
            numberOfLines={1}
            selectable
            style={[styles.sender, thread.unread && styles.unreadText]}
          >
            {thread.sender}
          </Text>
          <Text
            numberOfLines={1}
            selectable
            style={[styles.subject, thread.unread && styles.unreadText]}
          >
            {thread.subject || '(No subject)'}
            {showPreview && thread.snippet ? (
              <Text style={styles.snippet}>
                <Text style={styles.snippetDivider}> — </Text>
                {thread.snippet}
              </Text>
            ) : null}
          </Text>
        </View>
        {thread.messageCount > 1 ? (
          <Text selectable style={styles.messageCount}>{thread.messageCount}</Text>
        ) : null}
        <Text selectable style={styles.date}>{formatDate(thread.receivedAt)}</Text>
      </Pressable>
      {hovered ? (
        <View
          accessibilityLabel={`Actions for ${thread.subject || 'message'}`}
          style={styles.hoverActions}
        >
          <NativeActionButton
            accessibilityLabel={thread.unread ? 'Mark as read' : 'Mark as unread'}
            label={thread.unread ? 'Mark as read' : 'Mark as unread'}
            onPress={() => onToggleRead(thread)}
            systemImage={thread.unread ? 'envelope.badge' : 'envelope.open'}
            variant="glass"
          />
          <NativeActionButton
            accessibilityLabel="Archive"
            label="Archive"
            onPress={() => onArchive(thread)}
            systemImage="archivebox"
            variant="glass"
          />
          <NativeActionButton
            accessibilityLabel={thread.pinned ? 'Unpin' : 'Pin'}
            label={thread.pinned ? 'Unpin' : 'Pin'}
            onPress={() => onSetPinned(thread, !thread.pinned)}
            systemImage={thread.pinned ? 'pin.slash' : 'pin'}
            variant="glass"
          />
          <NativeActionButton
            accessibilityLabel="Delete"
            label="Delete"
            onPress={() => {}}
            role="destructive"
            systemImage="trash"
            variant="glass"
          />
        </View>
      ) : null}
    </Pressable>
  );
});

const glassSurface = PlatformColor('controlBackgroundColor');
const glassBorder = PlatformColor('separatorColor');

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 50,
    position: 'relative',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: glassBorder,
    backgroundColor: glassSurface,
  },
  plainRow: {
    borderLeftWidth: 0,
    borderRightWidth: 0,
    backgroundColor: 'transparent',
  },
  roundBottom: {
    marginBottom: 2,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  comfortableRow: { minHeight: 60 },
  pressTarget: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  pressed: { backgroundColor: PlatformColor('selectedContentBackgroundColor') },
  hoverActions: {
    position: 'absolute',
    top: '50%',
    right: 6,
    zIndex: 10,
    height: 34,
    transform: [{ translateY: -17 }],
    paddingHorizontal: 4,
    borderRadius: 20,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  unreadMark: {
    width: 3,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#E86E5A',
  },
  readMark: { opacity: 0 },
  copy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  sender: {
    color: PlatformColor('labelColor'),
    fontSize: 11,
    lineHeight: 15,
  },
  subject: {
    color: PlatformColor('labelColor'),
    fontSize: 12,
    lineHeight: 16,
  },
  snippet: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 10,
    fontWeight: '400',
  },
  snippetDivider: { color: PlatformColor('tertiaryLabelColor') },
  date: {
    width: 58,
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  unreadText: { fontWeight: '700' },
  messageCount: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
});
