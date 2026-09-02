import { memo, useCallback, useMemo } from 'react';
import {
  LegendList,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { PlatformColor, StyleSheet, View } from 'react-native';

import {
  buildInboxSections,
  type InboxLayoutMode,
  type InboxSection,
  type InboxSectionFocus,
  type InboxSectionId,
} from '../mail/inbox-layout';
import type { ConnectedAccount, MailThreadSummary } from '../mail/types';
import type { MailPreferences } from '../settings/mail-preferences';
import { EmptyMailboxState } from './empty-mailbox-state';
import { InboxThreadRow } from './inbox-thread-row';
import { NativeActionButton } from './native-action-button';
import { NativeSectionLabel } from './native-section-label';

const drawDistance = 1400;

type InboxListItem =
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
  | {
      kind: 'sectionFooter';
      id: string;
      sectionId: InboxSectionFocus;
      title: string;
    };

function sectionFocus(sectionId: InboxSectionId): InboxSectionFocus | undefined {
  return sectionId === 'inbox' || sectionId === 'seen' ? undefined : sectionId;
}

function itemType(item: InboxListItem) {
  return item.kind;
}

export type MailboxThreadListProps = {
  accountsById: Map<string, ConnectedAccount>;
  focusedSection?: InboxSectionFocus;
  layoutMode: InboxLayoutMode;
  emptyMailboxName?: string;
  onFocusSection: (section?: InboxSectionFocus) => void;
  onListLoad: (event: { elapsedTimeInMs: number }) => void;
  onOpenThread: (thread: MailThreadSummary) => void;
  onArchive: (thread: MailThreadSummary) => void;
  onSetPinned: (thread: MailThreadSummary, pinned: boolean) => void;
  onToggleRead: (thread: MailThreadSummary) => void;
  preferences: MailPreferences;
  threads: MailThreadSummary[];
};

export const MailboxThreadList = memo(function MailboxThreadList({
  accountsById,
  focusedSection,
  layoutMode,
  emptyMailboxName,
  onFocusSection,
  onListLoad,
  onOpenThread,
  onArchive,
  onSetPinned,
  onToggleRead,
  preferences,
  threads,
}: MailboxThreadListProps) {
  const items = useMemo<InboxListItem[]>(() => {
    if (!threads.length) return [];

    return buildInboxSections(threads, layoutMode, focusedSection).flatMap((section) => {
      const focus = section.expandable ? sectionFocus(section.id) : undefined;
      const sectionItems: InboxListItem[] = [{
        kind: 'section',
        id: `section:${section.id}`,
        title: section.title,
        systemImage: section.systemImage,
        totalCount: section.totalCount,
        presentation: section.presentation,
      }];

      sectionItems.push(...section.threads.map((thread, index) => ({
        kind: 'thread' as const,
        id: `${thread.accountId}:${thread.threadId}`,
        thread,
        presentation: section.presentation,
        roundBottom: section.presentation === 'card'
          && index === section.threads.length - 1
          && !focus,
      })));

      if (focus) {
        sectionItems.push({
          kind: 'sectionFooter',
          id: `footer:${section.id}`,
          sectionId: focus,
          title: section.title,
        });
      }
      return sectionItems;
    });
  }, [focusedSection, layoutMode, threads]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<InboxListItem>) => {
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

      if (item.kind === 'sectionFooter') {
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
        <InboxThreadRow
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
      drawDistance={drawDistance}
      estimatedItemSize={preferences.comfortableRows ? 60 : 50}
      getItemType={itemType}
      keyExtractor={(item) => item.id}
      onLoad={onListLoad}
      recycleItems
      renderItem={renderItem}
      style={styles.list}
    />
  );
});

const glassSurface = PlatformColor('controlBackgroundColor');
const glassBorder = PlatformColor('separatorColor');

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
    borderColor: glassBorder,
    backgroundColor: glassSurface,
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
    borderColor: glassBorder,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: glassSurface,
    overflow: 'hidden',
  },
});
