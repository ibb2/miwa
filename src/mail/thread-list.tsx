import { useResolveClassNames } from 'uniwind';
import { memo, useCallback, useMemo, useState } from 'react';
import { colors } from '../components/native-colors';
import {
  LegendList,
  useRecyclingState,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { buildInboxTabs, threadsForInboxTab, type InboxTabId } from './inbox-tabs';
import type { ConnectedAccount, MailThreadSummary } from './types';
import type { MailPreferences } from '../settings/preferences';
import {
  NativeActionButton,
  NativeEmptyState,
  NativeSymbol,
  NativeTabButton,
} from '../components/native-controls';

const ROW_HEIGHT = 58;
const avatarColors = [
  '#5B7CFA',
  '#8B5CF6',
  '#D05B9C',
  '#E66A4E',
  '#C58A20',
  '#3A9B72',
  '#338BA8',
] as const;

function keyExtractor(thread: MailThreadSummary) {
  return `${thread.accountId}:${thread.threadId}`;
}

function fixedRowHeight() {
  return ROW_HEIGHT;
}

function senderAvatar(sender: string) {
  const bracketIndex = sender.lastIndexOf('<');
  const displayName =
    bracketIndex > 0
      ? sender
          .slice(0, bracketIndex)
          .trim()
          .replace(/^['"]|['"]$/g, '')
      : '';
  const email = (bracketIndex >= 0 ? sender.slice(bracketIndex + 1).replace(/>.*$/, '') : sender)
    .trim()
    .toLowerCase();
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  let hash = 0;
  for (const character of email) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
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

type ThreadRowProps = {
  account?: ConnectedAccount;
  showPreview: boolean;
  thread: MailThreadSummary;
  onPress: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
};

const ThreadRow = memo(function ThreadRow({
  account,
  showPreview,
  thread,
  onPress,
  onArchive,
  onSetPinned,
  onToggleRead,
}: ThreadRowProps) {
  const [hovered, setHovered] = useRecyclingState(false);
  const avatar = useMemo(() => senderAvatar(thread.sender), [thread.sender]);
  const senderImageUri =
    account?.email.toLowerCase() === avatar.email ? account.avatarUrl : undefined;

  return (
    <Pressable
      accessibilityLabel={`${thread.sender}, ${thread.subject || 'No subject'}`}
      accessibilityRole="button"
      onBlur={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => onPress(thread)}
      className={`w-full h-[58px] relative flex-row items-center px-[12px] gap-[9px] ${hovered ? 'bg-[rgba(128,128,128,0.10)] rounded-[10px] border-continuous' : 'bg-transparent'} active:bg-[rgba(128,128,128,0.18)]`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={`w-[3px] h-[22px] rounded-[999px] bg-accent ${thread.unread ? '' : 'opacity-0'}`}
      />
      <NativeSymbol
        color={avatar.color}
        fallback={avatar.initials}
        imageUri={senderImageUri}
        preferFallback={avatar.usesInitials}
        systemName="at"
      />
      <View className="flex-1 min-w-0 justify-center">
        <Text
          numberOfLines={1}
          className={`text-[11px] leading-[15px] ${thread.unread ? 'font-bold' : ''}`}
          style={{ color: colors.label }}
        >
          {thread.sender}
        </Text>
        <Text
          numberOfLines={1}
          className={`text-[12px] leading-[16px] ${thread.unread ? 'font-bold' : ''}`}
          style={{ color: colors.label }}
        >
          {thread.subject || '(No subject)'}
          {showPreview && thread.snippet ? (
            <Text className="text-[10px] font-normal" style={{ color: colors.secondaryLabel }}>
              <Text style={{ color: colors.tertiaryLabel }}> — </Text>
              {thread.snippet}
            </Text>
          ) : null}
        </Text>
      </View>
      {thread.messageCount > 1 ? (
        <Text className="text-[10px] tabular-nums" style={{ color: colors.secondaryLabel }}>
          {thread.messageCount}
        </Text>
      ) : null}
      <Text
        className="w-[58px] text-[10px] tabular-nums text-right"
        style={{ color: colors.secondaryLabel }}
      >
        {formatDate(thread.receivedAt)}
      </Text>
      {hovered ? (
        <View
          accessibilityLabel={`Actions for ${thread.subject || 'message'}`}
          className="absolute top-[12px] right-[8px] z-10 h-[34px] px-[4px] rounded-[20px] border-continuous flex-row items-center gap-[2px]"
        >
          <NativeActionButton
            accessibilityLabel={thread.unread ? 'Mark as read' : 'Mark as unread'}
            label={thread.unread ? 'Mark as read' : 'Mark as unread'}
            onPress={() => onToggleRead(thread)}
            systemImage={thread.unread ? 'envelope.badge' : 'envelope.open'}
          />
          <NativeActionButton
            accessibilityLabel="Archive"
            label="Archive"
            onPress={() => onArchive(thread)}
            systemImage="archivebox"
          />
          <NativeActionButton
            accessibilityLabel={thread.pinned ? 'Unpin' : 'Pin'}
            label={thread.pinned ? 'Unpin' : 'Pin'}
            onPress={() => onSetPinned(thread, !thread.pinned)}
            systemImage={thread.pinned ? 'pin.slash' : 'pin'}
          />
        </View>
      ) : null}
    </Pressable>
  );
});

type ThreadListProps = {
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

export const ThreadList = memo(function ThreadList({
  accountsById,
  datasetKey,
  emptyMailboxName,
  onOpenThread,
  onArchive,
  onSetPinned,
  onToggleRead,
  preferences,
  threads,
}: ThreadListProps) {
  const listStyle = useResolveClassNames('flex-1');
  const contentStyle = useResolveClassNames(
    'w-full max-w-[840px] self-center px-[18px] pt-[8px] pb-[20px]',
  );
  const [selectedTab, setSelectedTab] = useState<InboxTabId>('inbox');
  const tabs = useMemo(() => buildInboxTabs(threads), [threads]);
  const visibleThreads = useMemo(
    () => threadsForInboxTab(threads, selectedTab),
    [selectedTab, threads],
  );
  const emptyState = useMemo(
    () => (
      <NativeEmptyState
        description={
          selectedTab === 'inbox'
            ? emptyMailboxName
              ? `Open Settings to download ${emptyMailboxName} for offline reading.`
              : 'Open Settings to download your connected inboxes for offline reading.'
            : `No messages currently match ${tabs.find((tab) => tab.id === selectedTab)?.title ?? 'this tab'}.`
        }
        systemImage="tray"
        title={selectedTab === 'inbox' ? 'Your reading desk is clear.' : 'Nothing here yet.'}
      />
    ),
    [emptyMailboxName, selectedTab, tabs],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<MailThreadSummary>) => (
      <ThreadRow
        account={accountsById.get(item.accountId)}
        onArchive={onArchive}
        onPress={onOpenThread}
        onSetPinned={onSetPinned}
        onToggleRead={onToggleRead}
        showPreview={preferences.showPreviews}
        thread={item}
      />
    ),
    [accountsById, onArchive, onOpenThread, onSetPinned, onToggleRead, preferences.showPreviews],
  );

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerClassName="min-w-full h-[58px] items-center px-[18px] gap-[6px]"
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0 border-b-0 bg-transparent"
      >
        {tabs.map((tab) => (
          <NativeTabButton
            key={tab.id}
            count={tab.count}
            label={tab.title}
            onPress={() => setSelectedTab(tab.id)}
            selected={selectedTab === tab.id}
          />
        ))}
      </ScrollView>
      <LegendList
        ListEmptyComponent={emptyState}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={visibleThreads}
        dataKey={`${datasetKey}:${selectedTab}`}
        drawDistance={700}
        estimatedItemSize={ROW_HEIGHT}
        getFixedItemSize={fixedRowHeight}
        keyExtractor={keyExtractor}
        recycleItems
        renderItem={renderItem}
        style={listStyle}
      />
    </View>
  );
});
