import { memo, useCallback, useMemo } from 'react';
import {
  LegendList,
  useRecyclingState,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  buildInboxSections,
  type InboxSection,
  type InboxSectionFocus,
  type InboxSectionId,
  type InboxLayoutMode,
} from '../mail/inbox-layout';
import type { ConnectedAccount, MailThreadSummary } from '../mail/types';
import type { MailPreferences } from '../settings/preferences';
import { accent, colors } from '../theme';
import { NativeActionButton, NativeSectionLabel, NativeSymbol } from './native';

const avatarColors = [
  '#5B7CFA',
  '#8B5CF6',
  '#D05B9C',
  '#E66A4E',
  '#C58A20',
  '#3A9B72',
  '#338BA8',
] as const;

/** Derives a stable color, email, and initials for a sender header string. */
function senderAvatar(sender: string) {
  const bracketIndex = sender.lastIndexOf('<');
  const displayName =
    bracketIndex > 0 ? sender.slice(0, bracketIndex).trim().replace(/^['"]|['"]$/g, '') : '';
  const email = (
    bracketIndex >= 0 ? sender.slice(bracketIndex + 1).replace(/>.*$/, '') : sender
  )
    .trim()
    .toLowerCase();
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

/** Today shows a time; older mail shows a short date. */
function formatDate(milliseconds: number) {
  const date = new Date(milliseconds);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

type ThreadRowProps = {
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

const ThreadRow = memo(function ThreadRow({
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
}: ThreadRowProps) {
  const [hovered, setHovered] = useRecyclingState(false);
  const avatar = senderAvatar(thread.sender);
  const senderImageUri =
    account?.email.toLowerCase() === avatar.email ? account.avatarUrl : undefined;

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
        style={({ pressed }) => [styles.pressTarget, pressed && styles.pressedRow]}
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
        <View style={styles.rowCopy}>
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
        </View>
      ) : null}
    </Pressable>
  );
});

function EmptyMailboxState({ mailboxName }: { mailboxName?: string }) {
  return (
    <View
      accessibilityLabel={
        mailboxName
          ? `No mail has been downloaded for ${mailboxName}`
          : 'No mail has been downloaded'
      }
      style={styles.emptyContainer}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.emptyArt}>
        <View style={styles.emptyEnvelope}>
          <View style={styles.emptyEnvelopeFlap} />
          <View style={styles.emptyPostmark} />
        </View>
      </View>
      <Text selectable style={styles.emptyTitle}>
        {mailboxName ? 'Nothing has arrived here yet.' : 'Your reading desk is clear.'}
      </Text>
      <Text selectable style={styles.emptyCopy}>
        {mailboxName
          ? `Open Settings to download ${mailboxName} for offline reading.`
          : 'Open Settings to download your connected inboxes for offline reading.'}
      </Text>
    </View>
  );
}

type ListItem =
  | {
      kind: 'section';
      id: string;
      title: string;
      systemImage: InboxSection['systemImage'];
      totalCount: number;
      presentation: InboxSection['presentation'];
    }
  | {
      kind: 'thread';
      id: string;
      thread: MailThreadSummary;
      presentation: InboxSection['presentation'];
      roundBottom: boolean;
    }
  | { kind: 'footer'; id: string; sectionId: InboxSectionFocus; title: string };

function sectionFocus(sectionId: InboxSectionId): InboxSectionFocus | undefined {
  return sectionId === 'inbox' || sectionId === 'seen' ? undefined : sectionId;
}

export type ThreadListProps = {
  accountsById: Map<string, ConnectedAccount>;
  focusedSection?: InboxSectionFocus;
  layoutMode: InboxLayoutMode;
  emptyMailboxName?: string;
  onFocusSection: (section?: InboxSectionFocus) => void;
  onOpenThread: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
  preferences: MailPreferences;
  threads: MailThreadSummary[];
};

export const ThreadList = memo(function ThreadList({
  accountsById,
  focusedSection,
  layoutMode,
  emptyMailboxName,
  onFocusSection,
  onOpenThread,
  onArchive,
  onSetPinned,
  onToggleRead,
  preferences,
  threads,
}: ThreadListProps) {
  const items = useMemo<ListItem[]>(() => {
    if (!threads.length) return [];

    return buildInboxSections(threads, layoutMode, focusedSection).flatMap((section) => {
      const focus = section.expandable ? sectionFocus(section.id) : undefined;
      const sectionItems: ListItem[] = [
        {
          kind: 'section',
          id: `section:${section.id}`,
          title: section.title,
          systemImage: section.systemImage,
          totalCount: section.totalCount,
          presentation: section.presentation,
        },
        ...section.threads.map((thread, index) => ({
          kind: 'thread' as const,
          id: `${thread.accountId}:${thread.threadId}`,
          thread,
          presentation: section.presentation,
          roundBottom:
            section.presentation === 'card' &&
            index === section.threads.length - 1 &&
            !focus,
        })),
      ];

      if (focus) {
        sectionItems.push({
          kind: 'footer',
          id: `footer:${section.id}`,
          sectionId: focus,
          title: section.title,
        });
      }
      return sectionItems;
    });
  }, [focusedSection, layoutMode, threads]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<ListItem>) => {
      if (item.kind === 'section') {
        return (
          <View
            accessibilityLabel={`${item.title}, ${item.totalCount} emails`}
            accessibilityRole="header"
            style={item.presentation === 'plain' ? styles.plainHeader : styles.cardHeader}
          >
            <NativeSectionLabel
              label={`${item.title}  ${item.totalCount}`}
              systemImage={item.systemImage}
            />
          </View>
        );
      }

      if (item.kind === 'footer') {
        return (
          <View style={styles.cardFooter}>
            <NativeActionButton
              accessibilityLabel={`Show all ${item.title} emails`}
              label="Show all"
              onPress={() => onFocusSection(item.sectionId)}
              variant="plain"
            />
          </View>
        );
      }

      return (
        <ThreadRow
          account={accountsById.get(item.thread.accountId)}
          comfortable={preferences.comfortableRows}
          presentation={item.presentation}
          roundBottom={item.roundBottom}
          showPreview={preferences.showPreviews}
          thread={item.thread}
          onPress={onOpenThread}
          onArchive={onArchive}
          onSetPinned={onSetPinned}
          onToggleRead={onToggleRead}
        />
      );
    },
    [accountsById, onArchive, onFocusSection, onOpenThread, onSetPinned, onToggleRead, preferences],
  );

  return (
    <LegendList
      ListEmptyComponent={<EmptyMailboxState mailboxName={emptyMailboxName} />}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      dataKey={`${layoutMode}:${focusedSection ?? 'root'}`}
      drawDistance={1400}
      estimatedItemSize={preferences.comfortableRows ? 60 : 50}
      getItemType={(item) => item.kind}
      keyExtractor={(item) => item.id}
      recycleItems
      renderItem={renderItem}
      style={styles.list}
    />
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  cardHeader: {
    width: '100%',
    minHeight: 34,
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 8,
    marginTop: 10,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderCurve: 'continuous',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
  },
  plainHeader: {
    width: '100%',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 10,
    marginTop: 8,
  },
  cardFooter: {
    width: '100%',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  row: {
    width: '100%',
    minHeight: 50,
    position: 'relative',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.card,
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
  pressedRow: { backgroundColor: colors.selected },
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
    backgroundColor: accent,
  },
  readMark: { opacity: 0 },
  rowCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  sender: { color: colors.label, fontSize: 11, lineHeight: 15 },
  subject: { color: colors.label, fontSize: 12, lineHeight: 16 },
  snippet: { color: colors.secondaryLabel, fontSize: 10, fontWeight: '400' },
  snippetDivider: { color: colors.tertiaryLabel },
  date: {
    width: 58,
    color: colors.secondaryLabel,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  unreadText: { fontWeight: '700' },
  messageCount: {
    color: colors.secondaryLabel,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  emptyContainer: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyArt: {
    width: 112,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyEnvelope: {
    width: 88,
    height: 58,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: accent,
    boxShadow: '0 10px 26px rgba(92, 44, 36, 0.18)',
    overflow: 'hidden',
  },
  emptyEnvelopeFlap: {
    position: 'absolute',
    top: -34,
    left: 12,
    width: 64,
    height: 64,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ rotate: '45deg' }],
  },
  emptyPostmark: {
    position: 'absolute',
    right: 12,
    bottom: 11,
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 999,
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyCopy: {
    maxWidth: 390,
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
