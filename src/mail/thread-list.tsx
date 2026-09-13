import { useResolveClassNames } from 'uniwind';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAccent } from '../components/native-colors';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import {
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { buildInboxTabs, threadsForInboxTab, type InboxTabId } from './inbox-tabs';
import type { MailThreadSummary } from './types';
import type { MailPreferences } from '../settings/preferences';
import { NativeEmptyState, NativeTabButton } from '../components/native-controls';
import { NativeThreadRow } from '../../modules/native-thread-row/src';
import { senderDisplayName } from './notifications';

const ROW_HEIGHT = 58;
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateWithYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
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
  if (date.toDateString() === today.toDateString()) return timeFormatter.format(date);
  return date.getFullYear() === today.getFullYear()
    ? dateFormatter.format(date)
    : dateWithYearFormatter.format(date);
}

type ThreadRowHostProps = {
  showPreview: boolean;
  fadeDone: boolean;
  compact: boolean;
  accentHex: string;
  thread: MailThreadSummary;
  onPress: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetDone: (thread: MailThreadSummary, done: boolean) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
};

const ThreadRowHost = memo(function ThreadRowHost({
  showPreview,
  fadeDone,
  compact,
  accentHex,
  thread,
  onPress,
  onArchive,
  onSetDone,
  onSetPinned,
  onToggleRead,
}: ThreadRowHostProps) {
  const handlePress = useCallback(() => onPress(thread), [onPress, thread]);
  const handleRowAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { action: 'done' | 'read' | 'archive' | 'pin' } }) => {
      switch (nativeEvent.action) {
        case 'done':
          onSetDone(thread, !thread.done);
          break;
        case 'read':
          onToggleRead(thread);
          break;
        case 'archive':
          onArchive(thread);
          break;
        case 'pin':
          onSetPinned(thread, !thread.pinned);
          break;
      }
    },
    [onArchive, onSetDone, onSetPinned, onToggleRead, thread],
  );

  return (
    <View style={{ width: '100%', height: 58, opacity: thread.done && fadeDone ? 0.45 : 1 }}>
      <NativeThreadRow
        style={{ width: '100%', height: 58 }}
        rowKey={`${thread.accountId}:${thread.threadId}`}
        sender={senderDisplayName(thread.sender)}
        subject={thread.subject || '(No subject)'}
        preview={thread.preview}
        dateText={formatDate(thread.receivedAt)}
        messageCount={thread.messageCount}
        unread={thread.unread}
        done={thread.done}
        pinned={thread.pinned}
        hasAttachments={thread.hasAttachments}
        showPreview={showPreview}
        compact={compact}
        accentHex={accentHex}
        onRowPress={handlePress}
        onRowAction={handleRowAction}
      />
    </View>
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
  /** Dims conversations marked done when they are visible. */
  fadeDone: boolean;
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
  fadeDone,
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
  const [initialScrollOffset] = useState(() => {
    const saved = positionRef.current;
    return saved?.datasetKey === datasetKey ? saved.offset : 0;
  });
  const listRef = useRef<LegendListRef>(null);
  const listIdentity = `${datasetKey}:${selectedTab}`;
  const previousIdentity = useRef(listIdentity);
  // Reset only the scroll position: dataKey resets can leave macOS row containers hidden.
  useLayoutEffect(() => {
    if (previousIdentity.current !== listIdentity) {
      previousIdentity.current = listIdentity;
      positionRef.current = { datasetKey, tab: selectedTab, offset: 0 };
      void listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [listIdentity, datasetKey, selectedTab, positionRef]);
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
      <ThreadRowHost
        onArchive={onArchive}
        onPress={openThread}
        onSetDone={onSetDone}
        onSetPinned={onSetPinned}
        onToggleRead={onToggleRead}
        showPreview={showPreview}
        fadeDone={fadeDone}
        compact={compact}
        accentHex={tint}
        thread={item}
      />
    ),
    [
      onArchive,
      openThread,
      onSetDone,
      onSetPinned,
      onToggleRead,
      showPreview,
      fadeDone,
      compact,
      tint,
    ],
  );

  return (
    <View className="flex-1">
      <LegendList
        ref={listRef}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={visibleThreads}
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
