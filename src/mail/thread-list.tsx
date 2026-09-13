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

function itemsAreEqual(prev: MailThreadSummary, next: MailThreadSummary) {
  return (
    prev.accountId === next.accountId &&
    prev.threadId === next.threadId &&
    prev.sender === next.sender &&
    prev.subject === next.subject &&
    prev.preview === next.preview &&
    prev.receivedAt === next.receivedAt &&
    prev.unread === next.unread &&
    prev.done === next.done &&
    prev.pinned === next.pinned &&
    prev.messageCount === next.messageCount &&
    prev.hasAttachments === next.hasAttachments &&
    prev.category === next.category
  );
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
  compact: boolean;
  tint: string;
  thread: MailThreadSummary;
  onPress: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetDone: (thread: MailThreadSummary, done: boolean) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
};

const RowAction = memo(function RowAction({
  label,
  symbol,
  selected = false,
  tint,
  onPress,
}: {
  label: string;
  symbol: React.ComponentProps<typeof Image>['systemName'];
  selected?: boolean;
  tint: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useRecyclingState(false);
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
});

const RowMain = memo(function RowMain({
  thread,
  showPreview,
  compact,
  tint,
}: {
  thread: MailThreadSummary;
  showPreview: boolean;
  compact: boolean;
  tint: string;
}) {
  return (
    <>
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
    </>
  );
});

const RowTrailing = memo(function RowTrailing({
  hovered,
  done,
  unread,
  pinned,
  receivedAt,
  tint,
  onPressDone,
  onPressToggleRead,
  onPressArchive,
  onPressPin,
}: {
  hovered: boolean;
  done: boolean;
  unread: boolean;
  pinned: boolean;
  receivedAt: number;
  tint: string;
  onPressDone: () => void;
  onPressToggleRead: () => void;
  onPressArchive: () => void;
  onPressPin: () => void;
}) {
  return (
    <View className="items-end justify-center" style={{ width: 134, flexShrink: 0, height: 34 }}>
      {hovered ? (
        <View className="flex-row items-center gap-[2px]">
          <RowAction
            label={done ? 'Mark as not done' : 'Mark as done'}
            symbol={done ? 'checkmark.circle.fill' : 'checkmark'}
            selected={done}
            tint={tint}
            onPress={onPressDone}
          />
          <RowAction
            label={unread ? 'Mark as read' : 'Mark as unread'}
            symbol={unread ? 'envelope.open' : 'envelope.badge'}
            tint={tint}
            onPress={onPressToggleRead}
          />
          <RowAction label="Archive" symbol="archivebox" tint={tint} onPress={onPressArchive} />
          <RowAction
            label={pinned ? 'Unpin' : 'Pin'}
            symbol={pinned ? 'pin.fill' : 'pin'}
            selected={pinned}
            tint={tint}
            onPress={onPressPin}
          />
        </View>
      ) : (
        <Text className="text-[12px] tabular-nums" style={{ color: colors.secondaryLabel }}>
          {done ? '✓ Done  ·  ' : ''}
          {formatDate(receivedAt)}
        </Text>
      )}
    </View>
  );
});

const ThreadRow = memo(function ThreadRow({
  showPreview,
  compact,
  tint,
  thread,
  onPress,
  onArchive,
  onSetDone,
  onSetPinned,
  onToggleRead,
}: ThreadRowProps) {
  const [hovered, setHovered] = useRecyclingState(false);
  const handlePress = useCallback(() => onPress(thread), [onPress, thread]);
  const handlePressDone = useCallback(() => onSetDone(thread, !thread.done), [onSetDone, thread]);
  const handleToggleRead = useCallback(() => onToggleRead(thread), [onToggleRead, thread]);
  const handleArchive = useCallback(() => onArchive(thread), [onArchive, thread]);
  const handleTogglePin = useCallback(
    () => onSetPinned(thread, !thread.pinned),
    [onSetPinned, thread],
  );

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
      onPress={handlePress}
      className="w-full h-[58px] relative flex-row items-center px-[8px] gap-[8px] rounded-[12px] border-continuous active:bg-[rgba(128,128,128,0.18)]"
      style={{
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        backgroundColor: hovered ? 'rgba(128,128,128,0.10)' : 'transparent',
      }}
    >
      <RowMain showPreview={showPreview} compact={compact} tint={tint} thread={thread} />
      <RowTrailing
        hovered={hovered}
        done={thread.done}
        unread={thread.unread}
        pinned={thread.pinned}
        receivedAt={thread.receivedAt}
        tint={tint}
        onPressDone={handlePressDone}
        onPressToggleRead={handleToggleRead}
        onPressArchive={handleArchive}
        onPressPin={handleTogglePin}
      />
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
  const tint = useAccent();
  const { width } = useWindowDimensions();
  const compact = width < 960;
  const showPreview = preferences.showPreviews;
  const extraData = `${showPreview ? 1 : 0}:${compact ? 1 : 0}:${tint}`;
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
  const selectTab = useCallback((tabId: InboxTabId) => {
    setSelectedTab(tabId);
  }, []);
  const listHeader = useMemo(
    () => (
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
            onPress={() => selectTab(tab.id)}
            selected={selectedTab === tab.id}
          />
        ))}
      </View>
    ),
    [tabs, selectedTab, selectTab],
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
        showPreview={showPreview}
        compact={compact}
        tint={tint}
        thread={item}
      />
    ),
    [onArchive, openThread, onSetDone, onSetPinned, onToggleRead, showPreview, compact, tint],
  );

  return (
    <View className="flex-1">
      <LegendList
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={visibleThreads}
        dataKey={`${datasetKey}:${selectedTab}`}
        drawDistance={700}
        estimatedItemSize={ROW_HEIGHT}
        extraData={extraData}
        initialScrollOffset={initialScrollOffset}
        onScroll={rememberScroll}
        getFixedItemSize={fixedRowHeight}
        itemsAreEqual={itemsAreEqual}
        keyExtractor={keyExtractor}
        recycleItems
        renderItem={renderItem}
        style={listStyle}
      />
    </View>
  );
});
