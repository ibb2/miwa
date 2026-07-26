import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import {
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NativeMailViewer } from './modules/native-mail-viewer/src';
import {
  NativeWindowToolbar,
  type NativeToolbarItem,
  type NativeWindowToolbarRef,
  type ToolbarSegment,
} from './modules/native-window-toolbar/src';
import { EmptyMailboxState } from './src/components/empty-mailbox-state';
import { gmailAccountAuth } from './src/mail/account-auth';
import {
  DEFAULT_INBOX_DOWNLOAD_LIMIT,
  downloadInbox,
  type InboxDownloadProgress,
} from './src/mail/inbox-download';
import { startInboxReconciliation } from './src/mail/inbox-reconciliation';
import {
  loadDownloadedThreadDetail,
  loadDownloadedThreads,
} from './src/mail/offline-mail';
import type {
  ConnectedAccount,
  MailboxView,
  MailThreadDetail,
  MailThreadSummary,
} from './src/mail/types';

const appModuleStartedAt = globalThis.performance.now();

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function initials(account: ConnectedAccount): string {
  const source = account.displayName || account.email;
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

type ToolbarDownloadState = {
  status: 'idle' | 'running' | 'complete' | 'failed';
  fraction: number;
  accountCount: number;
  completedAccountCount: number;
  currentAccountId?: string;
  currentProgress?: InboxDownloadProgress;
  inboxEmailsSelected: number;
  messagesStored: number;
  attachmentsStored: number;
  error?: string;
};

const idleDownloadState: ToolbarDownloadState = {
  status: 'idle',
  fraction: 0,
  accountCount: 0,
  completedAccountCount: 0,
  inboxEmailsSelected: 0,
  messagesStored: 0,
  attachmentsStored: 0,
};

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return globalThis.btoa(binary);
}

function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      if (request.status >= 200 && request.status < 300 && request.response instanceof ArrayBuffer) {
        resolve(request.response);
      } else {
        reject(new Error(`Avatar request failed (${request.status})`));
      }
    };
    request.onerror = () => reject(new Error('Avatar request failed.'));
    request.send();
  });
}

function formatDate(milliseconds: number): string {
  const date = new Date(milliseconds);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const InboxThreadRow = memo(function InboxThreadRow({
  account,
  showAccount,
  thread,
  onPress,
}: {
  account?: ConnectedAccount;
  showAccount: boolean;
  thread: MailThreadSummary;
  onPress: (thread: MailThreadSummary) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${thread.sender}, ${thread.subject}`}
      accessibilityRole="button"
      onPress={() => onPress(thread)}
      style={({ pressed }) => [styles.threadRow, pressed && styles.pressed]}
    >
      <View style={styles.threadTopLine}>
        <Text numberOfLines={1} selectable style={[styles.threadSender, thread.unread && styles.unreadText]}>
          {thread.sender}
        </Text>
        <Text selectable style={styles.threadDate}>{formatDate(thread.receivedAt)}</Text>
      </View>
      <View style={styles.subjectLine}>
        <Text numberOfLines={1} selectable style={[styles.threadSubject, thread.unread && styles.unreadText]}>
          {thread.subject}
        </Text>
        {thread.messageCount > 1 ? <Text selectable style={styles.messageCount}>{thread.messageCount}</Text> : null}
      </View>
      <Text numberOfLines={2} selectable style={styles.threadSnippet}>{thread.snippet}</Text>
      {showAccount && account ? (
        <Text numberOfLines={1} selectable style={styles.threadAccount}>{account.email}</Text>
      ) : null}
    </Pressable>
  );
});

const MailboxThreadList = memo(function MailboxThreadList({
  accountsById,
  active,
  emptyMailboxName,
  onListLoad,
  onOpenThread,
  onScroll,
  showAccount,
  threads,
}: {
  accountsById: Map<string, ConnectedAccount>;
  active: boolean;
  emptyMailboxName?: string;
  onListLoad: (event: { elapsedTimeInMs: number }) => void;
  onOpenThread: (thread: MailThreadSummary) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  showAccount: boolean;
  threads: MailThreadSummary[];
}) {
  const renderThread = useCallback(
    ({ item }: LegendListRenderItemProps<MailThreadSummary>) => (
      <InboxThreadRow
        account={accountsById.get(item.accountId)}
        showAccount={showAccount}
        thread={item}
        onPress={onOpenThread}
      />
    ),
    [accountsById, onOpenThread, showAccount],
  );

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.mailboxListLayer, !active && styles.inactiveMailboxList]}
    >
      <LegendList
        ListEmptyComponent={<EmptyMailboxState mailboxName={emptyMailboxName} />}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        data={threads}
        estimatedItemSize={94}
        keyExtractor={(thread) => `${thread.accountId}:${thread.threadId}`}
        onLoad={onListLoad}
        onScroll={onScroll}
        recycleItems
        renderItem={renderThread}
        scrollEventThrottle={16}
        style={styles.scrollView}
      />
    </View>
  );
});

type MailLoadPerformance = {
  threadCount: number;
  databaseFetchMs: number;
};

type ScrollPerformanceState = {
  lastTimestamp?: number;
  lastOffset?: number;
  intervals: number[];
  distance: number;
  completionTimer?: ReturnType<typeof setTimeout>;
};

export default function App() {
  const toolbarRef = useRef<NativeWindowToolbarRef>(null);
  const downloadActiveRef = useRef(false);
  const lastDownloadProgressUpdateRef = useRef(0);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [mailboxView, setMailboxView] = useState<MailboxView>({ kind: 'all' });
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [connectError, setConnectError] = useState<string>();
  const [avatarData, setAvatarData] = useState<Record<string, string>>({});
  const [downloadState, setDownloadState] = useState<ToolbarDownloadState>(idleDownloadState);
  const [downloadedThreads, setDownloadedThreads] = useState<MailThreadSummary[]>();
  const [mailLoadError, setMailLoadError] = useState<string>();
  const [mailLoadPerformance, setMailLoadPerformance] = useState<MailLoadPerformance>();
  const [selectedThread, setSelectedThread] = useState<MailThreadSummary>();
  const [threadDetail, setThreadDetail] = useState<MailThreadDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const listPerformanceLoggedRef = useRef(false);
  const scrollPerformanceRef = useRef<ScrollPerformanceState>({
    intervals: [],
    distance: 0,
  });
  const mailboxSelectionFrameRef = useRef<number | null>(null);
  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const loadAllDownloadedMail = useCallback(async (showLoading = true) => {
    if (showLoading) setDownloadedThreads(undefined);
    setMailLoadError(undefined);
    const startedAt = globalThis.performance.now();
    try {
      const threads = await loadDownloadedThreads();
      const databaseFetchMs = globalThis.performance.now() - startedAt;
      setMailLoadPerformance({
        threadCount: threads.length,
        databaseFetchMs,
      });
      setDownloadedThreads(threads);
      listPerformanceLoggedRef.current = false;
      if (__DEV__) {
        console.info('[MiwaPerformance] database-fetch', JSON.stringify({
          threadCount: threads.length,
          durationMs: Number(databaseFetchMs.toFixed(2)),
        }));
      }
    } catch (error) {
      setDownloadedThreads([]);
      setMailLoadError(messageFor(error));
    }
  }, []);

  useEffect(() => {
    void loadAllDownloadedMail();
  }, [loadAllDownloadedMail]);

  useEffect(() => () => {
    if (mailboxSelectionFrameRef.current !== null) {
      cancelAnimationFrame(mailboxSelectionFrameRef.current);
    }
  }, []);

  useEffect(() => startInboxReconciliation({
    onCycleComplete: (cycle) => {
      if (__DEV__) {
        console.info('[MiwaReconciliation] cycle complete', JSON.stringify({
          durationMs: cycle.completedAt - cycle.startedAt,
          accounts: cycle.accounts,
          failureCount: cycle.failures.length,
        }));
      }
      const changed = cycle.accounts.some(
        (account) =>
          account.threadsUpserted > 0 || account.threadsRemoved > 0,
      );
      if (changed) void loadAllDownloadedMail(false);
    },
    onError: (error) => {
      if (__DEV__) {
        console.warn(
          '[MiwaReconciliation] Gmail INBOX reconciliation failed',
          messageFor(error),
        );
      }
    },
  }), [loadAllDownloadedMail]);

  useEffect(() => {
    let active = true;
    gmailAccountAuth
      .listAccounts()
      .then((connected) => {
        if (!active) return;
        setAccounts(connected);
      })
      .catch((error) => {
        if (active) Alert.alert('Unable to load Gmail accounts', messageFor(error));
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all(
      accounts.map(async (account) => {
        if (!account.avatarUrl || avatarData[account.id]) return;
        try {
          const encoded = bytesToBase64(await fetchArrayBuffer(account.avatarUrl));
          if (active) setAvatarData((current) => ({ ...current, [account.id]: encoded }));
        } catch {
          // Initials remain available when a profile image cannot be loaded.
        }
      })
    );
    return () => {
      active = false;
    };
  }, [accounts]);

  useEffect(() => {
    if (!selectedThread) {
      setThreadDetail(undefined);
      setDetailError(undefined);
      return;
    }

    let active = true;
    setThreadDetail(undefined);
    setDetailError(undefined);
    setDetailLoading(true);
    loadDownloadedThreadDetail(selectedThread.accountId, selectedThread.threadId)
      .then((detail) => {
        if (active) setThreadDetail(detail);
      })
      .catch((error) => {
        if (active) setDetailError(messageFor(error));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedThread]);

  const connectAccount = useCallback(async () => {
    setConnectError(undefined);
    try {
      const account = await gmailAccountAuth.connectAccount();
      setAccounts((current) => {
        const next = current.filter((item) => item.id !== account.id);
        return [...next, account].sort((a, b) => a.order - b.order);
      });
      setMailboxView({ kind: 'account', accountId: account.id });
    } catch (error) {
      const message = messageFor(error);
      setConnectError(message);
      Alert.alert('Could not connect Gmail', message);
    }
  }, []);

  const disconnect = useCallback((account: ConnectedAccount) => {
    Alert.alert(
      'Disconnect Gmail account?',
      `${account.email} will be removed from Miwa. Your Gmail data will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void gmailAccountAuth.disconnectAccount(account.id).then(() => {
              setAccounts((current) => current.filter((item) => item.id !== account.id));
              setMailboxView({ kind: 'all' });
              if (selectedThread?.accountId === account.id) setSelectedThread(undefined);
            }).catch((error) => Alert.alert('Could not disconnect Gmail', messageFor(error)));
          },
        },
      ]
    );
  }, [selectedThread]);

  const downloadAccounts = useCallback(async (targets: readonly ConnectedAccount[]) => {
    if (downloadActiveRef.current || targets.length === 0) return;
    downloadActiveRef.current = true;
    lastDownloadProgressUpdateRef.current = 0;
    let completedAccountCount = 0;
    let inboxEmailsSelected = 0;
    let messagesStored = 0;
    let attachmentsStored = 0;

    setDownloadState({
      ...idleDownloadState,
      status: 'running',
      accountCount: targets.length,
    });

    try {
      for (const account of targets) {
        const result = await downloadInbox(account.id, {
          maxEmails: DEFAULT_INBOX_DOWNLOAD_LIMIT,
          onProgress: (progress) => {
            const now = Date.now();
            if (
              progress.phase !== 'complete' &&
              now - lastDownloadProgressUpdateRef.current < 500
            ) {
              return;
            }
            lastDownloadProgressUpdateRef.current = now;
            setDownloadState({
              status: 'running',
              fraction: (completedAccountCount + progress.fraction) / targets.length,
              accountCount: targets.length,
              completedAccountCount,
              currentAccountId: account.id,
              currentProgress: progress,
              inboxEmailsSelected: inboxEmailsSelected + progress.inboxEmailsSelected,
              messagesStored: messagesStored + progress.messagesStored,
              attachmentsStored: attachmentsStored + progress.attachmentsStored,
            });
          },
        });
        completedAccountCount += 1;
        inboxEmailsSelected += result.inboxEmailsSelected;
        messagesStored += result.messagesStored;
        attachmentsStored += result.attachmentsStored;
        setDownloadState({
          status: 'running',
          fraction: completedAccountCount / targets.length,
          accountCount: targets.length,
          completedAccountCount,
          inboxEmailsSelected,
          messagesStored,
          attachmentsStored,
        });
      }

      await loadAllDownloadedMail(false);
      setDownloadState({
        status: 'complete',
        fraction: 1,
        accountCount: targets.length,
        completedAccountCount,
        inboxEmailsSelected,
        messagesStored,
        attachmentsStored,
      });
      Alert.alert(
        'Inbox download complete',
        `${inboxEmailsSelected.toLocaleString()} INBOX emails selected across ${targets.length.toLocaleString()} ${targets.length === 1 ? 'inbox' : 'inboxes'}. ${messagesStored.toLocaleString()} conversation messages and ${attachmentsStored.toLocaleString()} attachments are available offline.`
      );
    } catch (error) {
      const failure = messageFor(error);
      setDownloadState((current) => ({
        ...current,
        status: 'failed',
        error: failure,
      }));
      Alert.alert('Inbox download failed', failure);
    } finally {
      downloadActiveRef.current = false;
    }
  }, [loadAllDownloadedMail]);

  const accountSegments = useMemo<ToolbarSegment[]>(() => [
    { id: 'all', label: 'All inboxes', systemImage: 'tray.full' },
    ...accounts.map((account) => ({
      id: `account:${account.id}`,
      label: account.email,
      imageData: avatarData[account.id],
      fallbackText: initials(account),
    })),
  ], [accounts, avatarData]);
  const selectedAccountIndex = mailboxView.kind === 'all'
    ? 0
    : Math.max(0, accounts.findIndex((account) => account.id === mailboxView.accountId) + 1);
  const downloadStatusLabel = useMemo(() => {
    if (downloadState.status === 'idle') return 'No inbox download running';
    if (downloadState.status === 'failed') {
      return `Inbox download failed${downloadState.error ? `: ${downloadState.error}` : ''}`;
    }
    if (downloadState.status === 'complete') {
      return `Download complete: ${downloadState.inboxEmailsSelected.toLocaleString()} INBOX emails selected, ${downloadState.messagesStored.toLocaleString()} messages stored`;
    }
    const account = downloadState.currentAccountId
      ? accountsById.get(downloadState.currentAccountId)
      : undefined;
    const progress = downloadState.currentProgress;
    const accountPosition = Math.min(
      downloadState.completedAccountCount + 1,
      downloadState.accountCount
    );
    if (!progress) {
      return `Preparing inbox ${accountPosition} of ${downloadState.accountCount}`;
    }
    if (progress.phase === 'listing') {
      return `Scanning ${account?.email ?? 'inbox'} (${accountPosition} of ${downloadState.accountCount}): ${progress.inboxEmailsSelected.toLocaleString()} of up to ${progress.targetInboxEmails.toLocaleString()} emails`;
    }
    return `Downloading ${account?.email ?? 'inbox'} (${accountPosition} of ${downloadState.accountCount}): ${progress.threadsDownloaded.toLocaleString()} of ${progress.totalThreads.toLocaleString()} conversations`;
  }, [accountsById, downloadState]);

  const toolbarItems = useMemo<NativeToolbarItem[]>(() => [
    {
      id: 'accounts',
      kind: 'segmented',
      label: 'Inbox account',
      selectionMode: 'selectOne',
      selectedIndex: selectedAccountIndex,
      segments: accountSegments,
      immovable: true,
      navigational: true,
    },
    { id: 'toolbar-spacer', kind: 'flexibleSpace' },
    {
      id: 'download-inbox',
      kind: 'menu',
      label: 'Download Inbox',
      systemImage: 'arrow.down.circle',
      toolTip: `Download up to ${DEFAULT_INBOX_DOWNLOAD_LIMIT.toLocaleString()} emails per inbox`,
      enabled: accounts.length > 0 && downloadState.status !== 'running',
      immovable: true,
      options: [
        {
          id: 'download:all',
          label: `All inboxes — up to ${DEFAULT_INBOX_DOWNLOAD_LIMIT.toLocaleString()} each`,
          systemImage: 'tray.full',
          enabled: accounts.length > 0 && downloadState.status !== 'running',
        },
        ...accounts.map((account) => ({
          id: `download:${account.id}`,
          label: account.email,
          systemImage: 'tray',
          enabled: downloadState.status !== 'running',
        })),
      ],
    },
    downloadState.status === 'running'
      ? {
          id: 'download-progress',
          kind: 'progress',
          label: 'Download Progress',
          toolTip: downloadStatusLabel,
          progress: downloadState.fraction,
          indeterminate: !downloadState.currentProgress,
          immovable: true,
        }
      : {
          id: 'download-progress',
          kind: 'button',
          label: 'Download Status',
          systemImage: downloadState.status === 'complete'
            ? 'checkmark.circle'
            : downloadState.status === 'failed'
              ? 'exclamationmark.triangle'
              : 'circle.dotted',
          toolTip: downloadStatusLabel,
          enabled: false,
          immovable: true,
        },
    { id: 'connect-account', kind: 'button', label: 'Connect Gmail', systemImage: 'plus', toolTip: 'Connect another Gmail account', enabled: downloadState.status !== 'running', immovable: true },
    {
      id: 'more',
      kind: 'menu',
      label: 'More',
      systemImage: 'ellipsis.circle',
      options: [
        ...accounts.map((account) => ({
          id: `disconnect:${account.id}`,
          label: `Disconnect ${account.email}`,
          enabled: downloadState.status !== 'running',
        })),
        { id: 'customize', label: 'Customize Toolbar…' },
        { id: 'reset', label: 'Reset Toolbar' },
      ],
    },
  ], [accountSegments, accounts, downloadState, downloadStatusLabel, selectedAccountIndex]);

  const mailboxName = mailboxView.kind === 'account'
    ? accountsById.get(mailboxView.accountId)?.email
    : undefined;
  const mailboxLists = useMemo(() => [
    {
      key: 'all',
      mailboxName: undefined,
      showAccount: true,
      threads: downloadedThreads ?? [],
    },
    ...accounts.map((account) => ({
      key: `account:${account.id}`,
      mailboxName: account.email,
      showAccount: false,
      threads: (downloadedThreads ?? []).filter(
        (thread) => thread.accountId === account.id,
      ),
    })),
  ], [accounts, downloadedThreads]);
  const activeMailboxKey = mailboxView.kind === 'all'
    ? 'all'
    : `account:${mailboxView.accountId}`;
  const inboxTitle = mailboxView.kind === 'all'
    ? 'All Inboxes'
    : mailboxName ?? 'Inbox';
  const selectMailboxSegment = useCallback((segmentId: string) => {
    if (mailboxSelectionFrameRef.current !== null) {
      cancelAnimationFrame(mailboxSelectionFrameRef.current);
    }
    mailboxSelectionFrameRef.current = requestAnimationFrame(() => {
      mailboxSelectionFrameRef.current = null;
      setSelectedThread(undefined);
      setMailboxView(segmentId === 'all'
        ? { kind: 'all' }
        : { kind: 'account', accountId: segmentId.replace('account:', '') });
    });
  }, []);
  const handleListLoad = useCallback(({ elapsedTimeInMs }: { elapsedTimeInMs: number }) => {
    if (!__DEV__ || listPerformanceLoggedRef.current || !mailLoadPerformance) return;
    listPerformanceLoggedRef.current = true;
    console.info('[MiwaPerformance] list-ready', JSON.stringify({
      threadCount: mailLoadPerformance.threadCount,
      databaseFetchMs: Number(mailLoadPerformance.databaseFetchMs.toFixed(2)),
      legendInitialRenderMs: Number(elapsedTimeInMs.toFixed(2)),
      appModuleToListMs: Number(
        (globalThis.performance.now() - appModuleStartedAt).toFixed(2)
      ),
    }));
  }, [mailLoadPerformance]);
  const handleScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (!__DEV__) return;
    const timestamp = globalThis.performance.now();
    const offset = event.nativeEvent.contentOffset.y;
    const sample = scrollPerformanceRef.current;
    if (
      sample.lastTimestamp !== undefined &&
      timestamp - sample.lastTimestamp < 250
    ) {
      sample.intervals.push(timestamp - sample.lastTimestamp);
    }
    if (sample.lastOffset !== undefined) {
      sample.distance += Math.abs(offset - sample.lastOffset);
    }
    sample.lastTimestamp = timestamp;
    sample.lastOffset = offset;

    if (sample.completionTimer) clearTimeout(sample.completionTimer);
    sample.completionTimer = setTimeout(() => {
      const completed = scrollPerformanceRef.current;
      if (completed.intervals.length >= 3) {
        const sorted = [...completed.intervals].sort((left, right) => left - right);
        const average = completed.intervals.reduce((total, interval) => total + interval, 0)
          / completed.intervals.length;
        const percentileIndex = Math.min(
          sorted.length - 1,
          Math.ceil(sorted.length * 0.95) - 1,
        );
        console.info('[MiwaPerformance] scroll', JSON.stringify({
          eventCount: completed.intervals.length + 1,
          distancePoints: Number(completed.distance.toFixed(1)),
          averageIntervalMs: Number(average.toFixed(2)),
          p95IntervalMs: Number(sorted[percentileIndex].toFixed(2)),
          maxIntervalMs: Number(sorted.at(-1)!.toFixed(2)),
          intervalsOver20Ms: completed.intervals.filter((interval) => interval > 20).length,
          estimatedEventFps: Number((1000 / average).toFixed(1)),
        }));
      }
      scrollPerformanceRef.current = {
        intervals: [],
        distance: 0,
      };
    }, 500);
  }, []);
  const mainContent = useMemo(() => {
    if (loadingAccounts || downloadedThreads === undefined) {
      return <Text selectable style={styles.stateText}>Loading downloaded mail…</Text>;
    }
    if (mailLoadError) {
      return (
        <View style={styles.emptyState}>
          <Text selectable style={styles.emptyTitle}>The mail drawer is stuck.</Text>
          <Text selectable style={styles.connectError}>{mailLoadError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadAllDownloadedMail()}
            style={({ pressed }) => [styles.connectButton, pressed && styles.connectButtonPressed]}
          >
            <Text style={styles.connectButtonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    if (!accounts.length && downloadedThreads.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text selectable style={styles.emptyTitle}>No mailbox has wandered in yet.</Text>
          <Text selectable style={styles.emptyCopy}>Connect a Gmail account, then download an inbox for offline reading.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void connectAccount()}
            style={({ pressed }) => [styles.connectButton, pressed && styles.connectButtonPressed]}
          >
            <Text style={styles.connectButtonText}>Connect Gmail</Text>
          </Pressable>
          {connectError ? <Text style={styles.connectError}>{connectError}</Text> : null}
        </View>
      );
    }
    return (
      <View style={styles.mailboxListStack}>
        {mailboxLists.map((list) => (
          <MailboxThreadList
            key={list.key}
            accountsById={accountsById}
            active={list.key === activeMailboxKey}
            emptyMailboxName={list.mailboxName}
            onListLoad={handleListLoad}
            onOpenThread={setSelectedThread}
            onScroll={handleScroll}
            showAccount={list.showAccount}
            threads={list.threads}
          />
        ))}
      </View>
    );
  }, [
    accountsById,
    accounts.length,
    activeMailboxKey,
    connectAccount,
    connectError,
    downloadedThreads,
    handleListLoad,
    handleScroll,
    loadAllDownloadedMail,
    loadingAccounts,
    mailboxLists,
    mailLoadError,
  ]);

  return (
    <View style={styles.appRoot}>
      <NativeWindowToolbar
        ref={toolbarRef}
        style={styles.nativeToolbarBridge}
        identifier="MiwaLeadingInboxToolbar"
        items={toolbarItems}
        customizable
        autosavesConfiguration
        displayMode="iconOnly"
        toolbarStyle="unified"
        onItemPress={({ nativeEvent }) => {
          if (nativeEvent.id === 'connect-account') void connectAccount();
        }}
        onSegmentChange={({ nativeEvent }) => {
          selectMailboxSegment(nativeEvent.segmentId);
        }}
        onMenuItemPress={({ nativeEvent }) => {
          if (nativeEvent.optionId === 'customize') void toolbarRef.current?.showCustomizationPalette();
          else if (nativeEvent.optionId === 'reset') void toolbarRef.current?.resetConfiguration();
          else if (nativeEvent.optionId === 'download:all') {
            void downloadAccounts(accounts);
          }
          else if (nativeEvent.optionId.startsWith('download:')) {
            const account = accountsById.get(nativeEvent.optionId.replace('download:', ''));
            if (account) void downloadAccounts([account]);
          }
          else if (nativeEvent.optionId.startsWith('disconnect:')) {
            const account = accountsById.get(nativeEvent.optionId.replace('disconnect:', ''));
            if (account) disconnect(account);
          }
        }}
      />

      <View style={styles.mainPane}>
        <View
          accessibilityElementsHidden={Boolean(selectedThread)}
          importantForAccessibility={selectedThread ? 'no-hide-descendants' : 'auto'}
          pointerEvents={selectedThread ? 'none' : 'auto'}
          style={[styles.contentLayer, selectedThread && styles.inactiveMailboxList]}
        >
          {mainContent}
        </View>
        {selectedThread ? (
          <View style={styles.contentLayer}>
            <View style={styles.contentHeader}>
              <Pressable
                accessibilityLabel={`Back to ${inboxTitle}`}
                accessibilityRole="button"
                onPress={() => setSelectedThread(undefined)}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <Text style={styles.backButtonText}>‹</Text>
                <Text numberOfLines={1} style={styles.backButtonLabel}>{inboxTitle}</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.detailContent}
              contentInsetAdjustmentBehavior="automatic"
              style={styles.scrollView}
            >
              {detailLoading ? <Text selectable style={styles.stateText}>Opening downloaded conversation…</Text> : null}
              {detailError ? <Text selectable style={styles.connectError}>{detailError}</Text> : null}
              {threadDetail ? (
                <>
                  <Text selectable style={styles.detailSubject}>{threadDetail.subject}</Text>
                  {threadDetail.messages.map((message) => (
                    <View key={message.id} style={styles.messageCard}>
                      <View style={styles.messageHeader}>
                        <Text selectable style={styles.messageSender}>{message.sender}</Text>
                        <Text selectable style={styles.messageDate}>
                          {new Date(message.sentAt).toLocaleString()}
                        </Text>
                      </View>
                      {message.recipients ? (
                        <Text selectable style={styles.recipients}>To: {message.recipients}</Text>
                      ) : null}
                      <NativeMailViewer
                        html={message.safeHtml}
                        plainText={message.plainText || 'This message has no readable body.'}
                        style={styles.mailViewer}
                      />
                      {message.attachments.length ? (
                        <View style={styles.attachmentList}>
                          {message.attachments.map((attachment) => (
                            <Text
                              key={attachment.id ?? attachment.filename}
                              selectable
                              style={styles.attachmentText}
                            >
                              📎 {attachment.filename || 'Attachment'}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: PlatformColor('windowBackgroundColor') },
  nativeToolbarBridge: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  mainPane: {
    flex: 1,
    minWidth: 420,
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: PlatformColor('windowBackgroundColor'),
  },
  scrollView: { flex: 1 },
  mailboxListStack: { flex: 1, position: 'relative' },
  contentLayer: { ...StyleSheet.absoluteFillObject },
  mailboxListLayer: { ...StyleSheet.absoluteFillObject },
  inactiveMailboxList: { opacity: 0 },
  listContent: { padding: 10, gap: 7 },
  threadRow: {
    padding: 11,
    borderRadius: 10,
    borderCurve: 'continuous',
    gap: 4,
  },
  pressed: { backgroundColor: PlatformColor('quaternaryLabelColor') },
  threadTopLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  threadSender: { flex: 1, color: PlatformColor('labelColor'), fontSize: 13 },
  threadDate: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  threadSubject: { flex: 1, color: PlatformColor('labelColor'), fontSize: 12 },
  unreadText: { fontWeight: '700' },
  messageCount: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  threadSnippet: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 11,
    lineHeight: 15,
  },
  threadAccount: {
    color: PlatformColor('tertiaryLabelColor'),
    fontSize: 9,
    paddingTop: 2,
  },
  contentHeader: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separatorColor'),
  },
  backButton: {
    maxWidth: '100%',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 5,
  },
  backButtonText: { color: PlatformColor('linkColor'), fontSize: 26, lineHeight: 20 },
  backButtonLabel: {
    flexShrink: 1,
    color: PlatformColor('linkColor'),
    fontSize: 13,
    fontWeight: '500',
  },
  detailContent: { padding: 24, gap: 14 },
  detailSubject: {
    color: PlatformColor('labelColor'),
    fontSize: 24,
    fontWeight: '700',
    paddingBottom: 4,
  },
  messageCard: {
    padding: 16,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: PlatformColor('controlBackgroundColor'),
    gap: 7,
  },
  messageHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  messageSender: {
    flex: 1,
    color: PlatformColor('labelColor'),
    fontSize: 13,
    fontWeight: '600',
  },
  messageDate: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  recipients: { color: PlatformColor('secondaryLabelColor'), fontSize: 10 },
  mailViewer: { width: '100%', height: 260, paddingTop: 8 },
  attachmentList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PlatformColor('separatorColor'),
    paddingTop: 8,
    gap: 4,
  },
  attachmentText: { color: PlatformColor('secondaryLabelColor'), fontSize: 11 },
  emptyState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 9 },
  emptyTitle: { color: PlatformColor('labelColor'), fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { maxWidth: 320, color: PlatformColor('secondaryLabelColor'), fontSize: 13, lineHeight: 18, textAlign: 'center' },
  connectButton: { width: 150, height: 32, marginTop: 8, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: PlatformColor('controlAccentColor') },
  connectButtonPressed: { opacity: 0.72 },
  connectButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  connectError: { maxWidth: 460, marginTop: 6, color: PlatformColor('systemRedColor'), fontSize: 11, lineHeight: 15, textAlign: 'center' },
  stateText: { padding: 16, color: PlatformColor('secondaryLabelColor'), fontSize: 12, textAlign: 'center' },
});
