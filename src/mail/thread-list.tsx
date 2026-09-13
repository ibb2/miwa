import { useResolveClassNames } from 'uniwind';
import { memo, useCallback, useMemo, useState } from 'react';
import { colors, useAccent } from '../components/native-colors';
import {
  LegendList,
  useRecyclingState,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { buildInboxTabs, threadsForInboxTab, type InboxTabId } from './inbox-tabs';
import type { MailThreadSummary } from './types';
import type { MailPreferences } from '../settings/preferences';
import { NativeEmptyState, NativeTabButton } from '../components/native-controls';
import { Button, Host, Image } from '@expo/ui/swift-ui';
import { accessibilityLabel, frame, help } from '@expo/ui/swift-ui/modifiers';
import { senderDisplayName } from './notifications';

const ROW_HEIGHT = 58;
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
function keyExtractor(thread: MailThreadSummary) {
  return `${thread.accountId}:${thread.threadId}`;
}

function fixedRowHeight() {
  return ROW_HEIGHT;
}

function formatDate(milliseconds: number) {
  const date = new Date(milliseconds);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? timeFormatter.format(date)
    : dateFormatter.format(date);
}

type ThreadRowProps = {
  showPreview: boolean;
  thread: MailThreadSummary;
  onPress: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetDone: (thread: MailThreadSummary, done: boolean) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
};

function RowAction({
  label,
  symbol,
  selected = false,
  onPress,
}: {
  label: string;
  symbol: React.ComponentProps<typeof Image>['systemName'];
  selected?: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const tint = useAccent();
  return (
    <Pressable
      accessible={false}
      focusable={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      className="w-[32px] h-[30px]"
    >
      <Host style={{ width: 32, height: 30 }}>
        <Button
          variant="borderless"
          modifiers={[accessibilityLabel(label), help(label)]}
          onPress={onPress}
        >
          <Image
            systemName={symbol}
            size={14}
            color={hovered || selected ? tint : 'secondary'}
            modifiers={[frame({ width: 32, height: 30 })]}
          />
        </Button>
      </Host>
    </Pressable>
  );
}

const ThreadRow = memo(function ThreadRow({
  showPreview,
  thread,
  onPress,
  onArchive,
  onSetDone,
  onSetPinned,
  onToggleRead,
}: ThreadRowProps) {
  const [hovered, setHovered] = useRecyclingState(false);
  const tint = useAccent();
  const { width } = useWindowDimensions();
  const compact = width < 960;

  return (
    <Pressable
      accessibilityLabel={
        thread.sender +
        ', ' +
        (thread.subject || 'No subject') +
        (thread.hasAttachments ? ', has attachment' : '')
      }
      accessibilityRole="button"
      onBlur={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => onPress(thread)}
      className="w-full h-[58px] relative flex-row items-center px-[8px] gap-[8px] rounded-[12px] border-continuous active:bg-[rgba(128,128,128,0.18)]"
      style={{
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        backgroundColor: hovered ? 'rgba(128,128,128,0.10)' : 'transparent',
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="w-[8px] h-[58px] items-center justify-center"
      >
        <View
          className="w-[7px] h-[7px] rounded-[999px]"
          style={{ backgroundColor: thread.unread ? tint : 'transparent' }}
        />
      </View>
      <View
        className="min-w-0 flex-row items-center gap-[6px]"
        style={{
          width: '22%',
          maxWidth: 220,
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        <Text
          numberOfLines={1}
          className="min-w-0"
          style={{
            flexShrink: 1,
            color: colors.label,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: thread.unread ? '700' : '400',
          }}
        >
          {senderDisplayName(thread.sender)}
        </Text>
        {thread.messageCount > 1 ? (
          <Text className="text-[11px] tabular-nums" style={{ color: colors.secondaryLabel }}>
            {thread.messageCount}
          </Text>
        ) : null}
        {thread.hasAttachments ? (
          <Host style={{ width: 18, height: 18 }}>
            <Image
              systemName="paperclip"
              size={12}
              color="secondary"
              modifiers={[frame({ width: 18, height: 18 })]}
            />
          </Host>
        ) : null}
      </View>
      <View
        className="min-w-0 flex-row items-center"
        style={{
          flex: 1,
          flexBasis: 0,
          flexShrink: 1,
          width: 0,
          minWidth: 0,
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          className="min-w-0"
          style={{
            flexShrink: 1,
            maxWidth: !compact && showPreview && thread.preview ? '70%' : '100%',
            color: colors.label,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: thread.unread ? '700' : '400',
          }}
        >
          {thread.subject || '(No subject)'}
        </Text>
        {!compact && showPreview && thread.preview ? (
          <Text
            numberOfLines={1}
            className="min-w-0"
            style={{
              flex: 1,
              flexBasis: 0,
              flexShrink: 1,
              width: 0,
              minWidth: 0,
              color: colors.secondaryLabel,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            {thread.preview}
          </Text>
        ) : null}
      </View>
      <View className="items-end justify-center" style={{ width: 134, flexShrink: 0, height: 34 }}>
        {hovered ? (
          <View className="flex-row items-center gap-[2px]">
            <RowAction
              label={thread.done ? 'Mark as not done' : 'Mark as done'}
              symbol={thread.done ? 'checkmark.circle.fill' : 'checkmark'}
              selected={thread.done}
              onPress={() => onSetDone(thread, !thread.done)}
            />
            <RowAction
              label={thread.unread ? 'Mark as read' : 'Mark as unread'}
              symbol={thread.unread ? 'envelope.open' : 'envelope.badge'}
              onPress={() => onToggleRead(thread)}
            />
            <RowAction label="Archive" symbol="archivebox" onPress={() => onArchive(thread)} />
            <RowAction
              label={thread.pinned ? 'Unpin' : 'Pin'}
              symbol={thread.pinned ? 'pin.fill' : 'pin'}
              selected={thread.pinned}
              onPress={() => onSetPinned(thread, !thread.pinned)}
            />
          </View>
        ) : (
          <Text className="text-[12px] tabular-nums" style={{ color: colors.secondaryLabel }}>
            {thread.done ? '✓ Done  ·  ' : ''}
            {formatDate(thread.receivedAt)}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

export type ThreadListPosition = { datasetKey: string; tab: InboxTabId; offset: number };

type ThreadListProps = {
  positionRef: React.MutableRefObject<ThreadListPosition | undefined>;
  datasetKey: string;
  emptyMailboxName?: string;
  searchQuery?: string;
  onOpenThread: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetDone: (thread: MailThreadSummary, done: boolean) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
  preferences: MailPreferences;
  threads: MailThreadSummary[];
};

export const ThreadList = memo(function ThreadList({
  positionRef,
  datasetKey,
  emptyMailboxName,
  searchQuery,
  onOpenThread,
  onArchive,
  onSetDone,
  onSetPinned,
  onToggleRead,
  preferences,
  threads,
}: ThreadListProps) {
  const listStyle = useResolveClassNames('flex-1');
  const contentStyle = useResolveClassNames('w-full px-[18px] pt-[8px] pb-[20px]');
  const [selectedTab, setSelectedTab] = useState<InboxTabId>(() =>
    positionRef.current?.datasetKey === datasetKey ? positionRef.current.tab : 'inbox',
  );
  const savedPosition = positionRef.current;
  const initialScrollOffset =
    savedPosition?.datasetKey === datasetKey && savedPosition.tab === selectedTab
      ? savedPosition.offset
      : 0;
  const rememberScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      positionRef.current = {
        datasetKey,
        tab: selectedTab,
        offset: Math.max(0, nativeEvent.contentOffset.y),
      };
    },
    [datasetKey, selectedTab, positionRef],
  );
  const openThread = useCallback(
    (thread: MailThreadSummary) => {
      const saved = positionRef.current;
      positionRef.current = {
        datasetKey,
        tab: selectedTab,
        offset: saved?.datasetKey === datasetKey && saved.tab === selectedTab ? saved.offset : 0,
      };
      onOpenThread(thread);
    },
    [datasetKey, selectedTab, positionRef, onOpenThread],
  );
  const tabs = useMemo(() => buildInboxTabs(threads), [threads]);
  const visibleThreads = useMemo(
    () => threadsForInboxTab(threads, selectedTab),
    [selectedTab, threads],
  );
  const emptyState = useMemo(
    () => (
      <NativeEmptyState
        description={
          searchQuery?.trim()
            ? 'Try another term, or use subject:, sender:, attachment: or body: to narrow your search.'
            : selectedTab === 'inbox'
              ? emptyMailboxName
                ? `Open Settings to download ${emptyMailboxName} and get started.`
                : 'Open Settings to download your connected inboxes and get started.'
              : `No messages have been ${tabs.find((tab) => tab.id === selectedTab)?.title ?? 'this tab'}.`
        }
        systemImage={searchQuery?.trim() ? 'magnifyingglass' : 'tray'}
        title={searchQuery?.trim() ? 'No matching messages.' : 'Nothing here yet.'}
      />
    ),
    [emptyMailboxName, selectedTab, tabs, searchQuery],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<MailThreadSummary>) => (
      <ThreadRow
        onArchive={onArchive}
        onPress={openThread}
        onSetDone={onSetDone}
        onSetPinned={onSetPinned}
        onToggleRead={onToggleRead}
        showPreview={preferences.showPreviews}
        thread={item}
      />
    ),
    [onArchive, openThread, onSetDone, onSetPinned, onToggleRead, preferences.showPreviews],
  );

  return (
    <View className="flex-1">
      <LegendList
        ListHeaderComponent={
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              height: 58,
              gap: 12,
            }}
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
          </View>
        }
        ListEmptyComponent={emptyState}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={visibleThreads}
        dataKey={`${datasetKey}:${selectedTab}`}
        drawDistance={700}
        estimatedItemSize={ROW_HEIGHT}
        initialScrollOffset={initialScrollOffset}
        onScroll={rememberScroll}
        getFixedItemSize={fixedRowHeight}
        keyExtractor={keyExtractor}
        recycleItems
        renderItem={renderItem}
        style={listStyle}
      />
    </View>
  );
});
