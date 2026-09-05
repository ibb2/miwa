import { memo, useCallback, useMemo, useState } from 'react';
import {
  LegendList,
  useRecyclingState,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildInboxTabs,
  threadsForInboxTab,
  type InboxTabId,
} from '../mail/inbox-layout';
import type { ConnectedAccount, MailThreadSummary } from '../mail/types';
import type { MailPreferences } from '../settings/preferences';
import { accent, colors } from '../theme';
import { NativeActionButton, NativeEmptyState, NativeSymbol, NativeTabButton } from './native';

const ROW_HEIGHT = 58;
const avatarColors = ['#5B7CFA', '#8B5CF6', '#D05B9C', '#E66A4E', '#C58A20', '#3A9B72', '#338BA8'] as const;

function keyExtractor(thread: MailThreadSummary) {
  return `${thread.accountId}:${thread.threadId}`;
}

function fixedRowHeight() {
  return ROW_HEIGHT;
}

function senderAvatar(sender: string) {
  const bracketIndex = sender.lastIndexOf('<');
  const displayName = bracketIndex > 0 ? sender.slice(0, bracketIndex).trim().replace(/^['"]|['"]$/g, '') : '';
  const email = (bracketIndex >= 0 ? sender.slice(bracketIndex + 1).replace(/>.*$/, '') : sender).trim().toLowerCase();
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  let hash = 0;
  for (const character of email) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return {
    color: avatarColors[Math.abs(hash) % avatarColors.length],
    email,
    initials: nameParts.length ? `${nameParts[0][0]}${nameParts.length > 1 ? nameParts.at(-1)![0] : ''}`.toUpperCase() : '@',
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

type ThreadRowProps = {
  account?: ConnectedAccount;
  showPreview: boolean;
  thread: MailThreadSummary;
  onPress: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
};

const ThreadRow = memo(function ThreadRow({ account, showPreview, thread, onPress, onArchive, onSetPinned, onToggleRead }: ThreadRowProps) {
  const [hovered, setHovered] = useRecyclingState(false);
  const avatar = useMemo(() => senderAvatar(thread.sender), [thread.sender]);
  const senderImageUri = account?.email.toLowerCase() === avatar.email ? account.avatarUrl : undefined;

  return (
    <Pressable
      accessibilityLabel={`${thread.sender}, ${thread.subject || 'No subject'}`}
      accessibilityRole="button"
      onBlur={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => onPress(thread)}
      style={({ pressed }) => [styles.row, hovered && styles.hoveredRow, pressed && styles.pressedRow]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.unreadMark, !thread.unread && styles.readMark]} />
      <NativeSymbol color={avatar.color} fallback={avatar.initials} imageUri={senderImageUri} preferFallback={avatar.usesInitials} systemName="at" />
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={[styles.sender, thread.unread && styles.unreadText]}>{thread.sender}</Text>
        <Text numberOfLines={1} style={[styles.subject, thread.unread && styles.unreadText]}>
          {thread.subject || '(No subject)'}
          {showPreview && thread.snippet ? <Text style={styles.snippet}><Text style={styles.snippetDash}> — </Text>{thread.snippet}</Text> : null}
        </Text>
      </View>
      {thread.messageCount > 1 ? <Text style={styles.messageCount}>{thread.messageCount}</Text> : null}
      <Text style={styles.date}>{formatDate(thread.receivedAt)}</Text>
      {hovered ? (
        <View accessibilityLabel={`Actions for ${thread.subject || 'message'}`} style={styles.hoverActions}>
          <NativeActionButton accessibilityLabel={thread.unread ? 'Mark as read' : 'Mark as unread'} label={thread.unread ? 'Mark as read' : 'Mark as unread'} onPress={() => onToggleRead(thread)} systemImage={thread.unread ? 'envelope.badge' : 'envelope.open'} />
          <NativeActionButton accessibilityLabel="Archive" label="Archive" onPress={() => onArchive(thread)} systemImage="archivebox" />
          <NativeActionButton accessibilityLabel={thread.pinned ? 'Unpin' : 'Pin'} label={thread.pinned ? 'Unpin' : 'Pin'} onPress={() => onSetPinned(thread, !thread.pinned)} systemImage={thread.pinned ? 'pin.slash' : 'pin'} />
        </View>
      ) : null}
    </Pressable>
  );
});

export type ThreadListProps = {
  accountsById: Map<string, ConnectedAccount>;
  datasetKey: string;
  emptyMailboxName?: string;
  onOpenThread: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
  preferences: MailPreferences;
  threads: MailThreadSummary[];
};

export const ThreadList = memo(function ThreadList({ accountsById, datasetKey, emptyMailboxName, onOpenThread, onArchive, onSetPinned, onToggleRead, preferences, threads }: ThreadListProps) {
  const [selectedTab, setSelectedTab] = useState<InboxTabId>('inbox');
  const tabs = useMemo(() => buildInboxTabs(threads), [threads]);
  const visibleThreads = useMemo(() => threadsForInboxTab(threads, selectedTab), [selectedTab, threads]);
  const emptyState = useMemo(() => (
    <NativeEmptyState
      description={selectedTab === 'inbox'
        ? (emptyMailboxName ? `Open Settings to download ${emptyMailboxName} for offline reading.` : 'Open Settings to download your connected inboxes for offline reading.')
        : `No messages currently match ${tabs.find((tab) => tab.id === selectedTab)?.title ?? 'this tab'}.`}
      systemImage="tray"
      title={selectedTab === 'inbox' ? 'Your reading desk is clear.' : 'Nothing here yet.'}
    />
  ), [emptyMailboxName, selectedTab, tabs]);

  const renderItem = useCallback(({ item }: LegendListRenderItemProps<MailThreadSummary>) => (
    <ThreadRow
      account={accountsById.get(item.accountId)}
      onArchive={onArchive}
      onPress={onOpenThread}
      onSetPinned={onSetPinned}
      onToggleRead={onToggleRead}
      showPreview={preferences.showPreviews}
      thread={item}
    />
  ), [accountsById, onArchive, onOpenThread, onSetPinned, onToggleRead, preferences.showPreviews]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.tabs} horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroller}>
        {tabs.map((tab) => (
          <NativeTabButton key={tab.id} count={tab.count} label={tab.title} onPress={() => setSelectedTab(tab.id)} selected={selectedTab === tab.id} />
        ))}
      </ScrollView>
      <LegendList
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        data={visibleThreads}
        dataKey={`${datasetKey}:${selectedTab}`}
        drawDistance={700}
        estimatedItemSize={ROW_HEIGHT}
        getFixedItemSize={fixedRowHeight}
        keyExtractor={keyExtractor}
        recycleItems
        renderItem={renderItem}
        style={styles.list}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabScroller: { flexGrow: 0, borderBottomWidth: 0, backgroundColor: 'transparent' },
  tabs: { minWidth: '100%', height: 58, alignItems: 'center', paddingHorizontal: 18, gap: 6 },
  list: { flex: 1 },
  content: { width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20 },
  row: { width: '100%', height: ROW_HEIGHT, position: 'relative', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9, backgroundColor: 'transparent' },
  hoveredRow: { backgroundColor: 'rgba(128, 128, 128, 0.10)', borderRadius: 10, borderCurve: 'continuous' },
  pressedRow: { backgroundColor: 'rgba(128, 128, 128, 0.18)' },
  hoverActions: { position: 'absolute', top: 12, right: 8, zIndex: 10, height: 34, paddingHorizontal: 4, borderRadius: 20, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: 2 },
  unreadMark: { width: 3, height: 22, borderRadius: 999, backgroundColor: accent },
  readMark: { opacity: 0 },
  rowCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  sender: { color: colors.label, fontSize: 11, lineHeight: 15 },
  subject: { color: colors.label, fontSize: 12, lineHeight: 16 },
  snippet: { color: colors.secondaryLabel, fontSize: 10, fontWeight: '400' },
  snippetDash: { color: colors.tertiaryLabel },
  date: { width: 58, color: colors.secondaryLabel, fontSize: 10, fontVariant: ['tabular-nums'], textAlign: 'right' },
  messageCount: { color: colors.secondaryLabel, fontSize: 10, fontVariant: ['tabular-nums'] },
  unreadText: { fontWeight: '700' },
});
