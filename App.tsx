import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  NativeWindowToolbar,
  type NativeWindowToolbarRef,
  type ToolbarItemPressEvent,
  type ToolbarMenuItemPressEvent,
  type ToolbarSegment,
  type ToolbarSegmentChangeEvent,
} from './modules/native-window-toolbar/src';
import { GatekeeperView } from './src/components/gatekeeper-view';
import { NativeEmptyState } from './src/components/native';
import { SettingsView } from './src/components/settings-view';
import { ThreadDetail } from './src/components/thread-detail';
import { ThreadList } from './src/components/thread-list';
import { clearLocalDatabase } from './src/db/db';
import {
  accountInitials,
  gmailAccountAuth,
  loadAccountAvatars,
} from './src/mail/accounts';
import { DEFAULT_INBOX_DOWNLOAD_LIMIT, downloadInbox } from './src/mail/download';
import {
  loadGatekeeperOverview,
  setGatekeeperSenderStatus,
  type GatekeeperOverview,
  type GatekeeperStatus,
} from './src/mail/gatekeeper';
import { archiveGmailThread, setGmailThreadReadState, withGmailReauth } from './src/mail/gmail';
import {
  loadThreadDetail,
  loadThreads,
  removeInboxThread,
  setThreadPinnedState,
  setThreadReadState,
} from './src/mail/store';
import { startInboxSync, type SyncController } from './src/mail/sync';
import type {
  ConnectedAccount,
  MailboxView,
  MailThreadDetail,
  MailThreadSummary,
} from './src/mail/types';
import {
  loadMailPreferences,
  saveMailPreference,
  type MailPreferences,
} from './src/settings/preferences';
import { shared } from './src/theme';
import { buildToolbarItems, toolbarIdentifier, type AppSurface, type ToolbarInput } from './src/toolbar';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Download progress; undefined while no download is running. */
type DownloadState = {
  fraction: number;
  label: string;
  accountId?: string;
};

export default function App() {
  const toolbarRef = useRef<NativeWindowToolbarRef>(null);
  const syncRef = useRef<SyncController>(null);
  const downloadActiveRef = useRef(false);
  const lastProgressUpdateRef = useRef(0);
  const mailboxFrameRef = useRef<number | null>(null);

  const [accounts, setAccounts] = useState<ConnectedAccount[]>();
  const [avatarData, setAvatarData] = useState<Record<string, string>>({});
  const [surface, setSurface] = useState<AppSurface>('mail');
  const [mailboxView, setMailboxView] = useState<MailboxView>({ kind: 'all' });
  const [preferences, setPreferences] = useState(loadMailPreferences);
  const [threads, setThreads] = useState<MailThreadSummary[]>();
  const [threadsError, setThreadsError] = useState<string>();
  const [selectedThread, setSelectedThread] = useState<MailThreadSummary>();
  const [detail, setDetail] = useState<MailThreadDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [gatekeeper, setGatekeeper] = useState<GatekeeperOverview>();
  const [gatekeeperLoading, setGatekeeperLoading] = useState(true);
  const [gatekeeperError, setGatekeeperError] = useState<string>();
  const [gatekeeperActionEmail, setGatekeeperActionEmail] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState('Check Gmail for new mail');
  const [syncRevision, setSyncRevision] = useState(0);
  const [download, setDownload] = useState<DownloadState>();
  const [clearing, setClearing] = useState(false);
  const [busyAction, setBusyAction] = useState<string>();
  const [connectError, setConnectError] = useState<string>();

  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, account])),
    [accounts],
  );

  // --- Data loading ---

  const refreshGatekeeper = useCallback(async (showLoading = true) => {
    if (showLoading) setGatekeeperLoading(true);
    setGatekeeperError(undefined);
    try {
      setGatekeeper(await loadGatekeeperOverview());
    } catch (error) {
      setGatekeeperError(messageFor(error));
    } finally {
      setGatekeeperLoading(false);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    setThreadsError(undefined);
    try {
      setThreads(await loadThreads());
      void refreshGatekeeper(false);
    } catch (error) {
      setThreads([]);
      setThreadsError(messageFor(error));
    }
  }, [refreshGatekeeper]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    let active = true;
    gmailAccountAuth
      .listAccounts()
      .then((connected) => {
        if (active) setAccounts(connected);
      })
      .catch((error) => {
        if (active) {
          setAccounts([]);
          Alert.alert('Unable to load Gmail accounts', messageFor(error));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!accounts?.length) return;
    let active = true;
    void loadAccountAvatars(accounts).then((loaded) => {
      if (active) setAvatarData((current) => ({ ...current, ...loaded }));
    });
    return () => {
      active = false;
    };
  }, [accounts]);

  useEffect(() => {
    if (!selectedThread) {
      setDetail(undefined);
      setDetailError(undefined);
      return;
    }
    let active = true;
    setDetail(undefined);
    setDetailError(undefined);
    setDetailLoading(true);
    loadThreadDetail(selectedThread.accountId, selectedThread.threadId)
      .then((loaded) => {
        if (active) setDetail(loaded);
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

  // Poll Gmail for changes; refresh the list whenever a sync cycle changed mail.
  useEffect(() => {
    const sync = startInboxSync({
      onCycleStart: () => {
        setSyncing(true);
        setSyncLabel('Checking Gmail for new mail…');
      },
      onCycleComplete: (cycle) => {
        const changed = cycle.accounts.some(
          (account) => account.threadsUpserted > 0 || account.threadsRemoved > 0,
        );
        if (changed) void refreshThreads();
        setSyncLabel(
          cycle.failures.length > 0
            ? 'Mail sync finished with errors'
            : changed
              ? 'Mail updated'
              : 'Mail is up to date',
        );
      },
      onError: () => setSyncLabel('Mail sync failed'),
      onCycleEnd: () => setSyncing(false),
    });
    syncRef.current = sync;
    return () => {
      if (syncRef.current === sync) syncRef.current = null;
      sync.stop();
    };
  }, [refreshThreads, syncRevision]);

  useEffect(
    () => () => {
      if (mailboxFrameRef.current !== null) cancelAnimationFrame(mailboxFrameRef.current);
    },
    [],
  );

  // --- Account actions ---

  const connectAccount = useCallback(async () => {
    setConnectError(undefined);
    try {
      const account = await gmailAccountAuth.connectAccount();
      setAccounts((current) =>
        [...(current ?? []).filter((item) => item.id !== account.id), account].sort(
          (a, b) => a.order - b.order,
        ),
      );
      setMailboxView({ kind: 'account', accountId: account.id });
    } catch (error) {
      const message = messageFor(error);
      setConnectError(message);
      Alert.alert('Could not connect Gmail', message);
    }
  }, []);

  const disconnectAccount = useCallback(
    (account: ConnectedAccount) => {
      Alert.alert(
        'Remove Gmail account?',
        `${account.email} will be removed from Miwa. Your Gmail data will not be deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void gmailAccountAuth
                .disconnectAccount(account.id)
                .then(() => {
                  setAccounts((current) => current?.filter((item) => item.id !== account.id));
                  setMailboxView({ kind: 'all' });
                  setSelectedThread((current) =>
                    current?.accountId === account.id ? undefined : current,
                  );
                })
                .catch((error) => Alert.alert('Could not disconnect Gmail', messageFor(error)));
            },
          },
        ],
      );
    },
    [],
  );

  // --- Preferences ---

  const changePreference = useCallback(
    <K extends keyof MailPreferences>(key: K, value: MailPreferences[K]) => {
      setPreferences((current) => ({ ...current, [key]: value }));
      saveMailPreference(key, value);
    },
    [],
  );

  // --- Downloads and maintenance ---

  const downloadAccounts = useCallback(
    async (targets: readonly ConnectedAccount[]) => {
      if (downloadActiveRef.current || targets.length === 0) return;
      downloadActiveRef.current = true;
      lastProgressUpdateRef.current = 0;
      const totals = { selected: 0, messages: 0, attachments: 0 };

      try {
        for (const [index, account] of targets.entries()) {
          const result = await downloadInbox(account.id, {
            onProgress: (progress) => {
              const now = Date.now();
              if (progress.phase !== 'complete' && now - lastProgressUpdateRef.current < 500) {
                return;
              }
              lastProgressUpdateRef.current = now;
              const position = Math.min(index + 1, targets.length);
              setDownload({
                fraction: (index + progress.fraction) / targets.length,
                accountId: account.id,
                label:
                  progress.phase === 'downloading'
                    ? `Downloading ${account.email} (${position} of ${targets.length}): ` +
                      `${progress.threadsDownloaded.toLocaleString()} of ${progress.totalThreads.toLocaleString()} conversations`
                    : `Scanning ${account.email} (${position} of ${targets.length})`,
              });
            },
          });
          totals.selected += result.inboxEmailsSelected;
          totals.messages += result.messagesStored;
          totals.attachments += result.attachmentsStored;
        }

        await refreshThreads();
        setDownload(undefined);
        Alert.alert(
          'Inbox download complete',
          `${totals.selected.toLocaleString()} INBOX emails selected across ${targets.length.toLocaleString()} ` +
            `${targets.length === 1 ? 'inbox' : 'inboxes'}. ${totals.messages.toLocaleString()} conversation messages ` +
            `and ${totals.attachments.toLocaleString()} attachments are available offline.`,
        );
      } catch (error) {
        setDownload(undefined);
        Alert.alert('Inbox download failed', messageFor(error));
      } finally {
        downloadActiveRef.current = false;
      }
    },
    [refreshThreads],
  );

  const clearData = useCallback(() => {
    Alert.alert(
      'Clear all local data?',
      'Every downloaded message and attachment, cached account record, sync cursor, and preference ' +
        'will be removed from Miwa. Your Gmail accounts and Gmail messages will not be changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: () => {
            setClearing(true);
            syncRef.current?.stop();
            syncRef.current = null;
            try {
              clearLocalDatabase();
              setThreads([]);
              setThreadsError(undefined);
              setSelectedThread(undefined);
              setDetail(undefined);
              setDetailError(undefined);
              setMailboxView({ kind: 'all' });
              setPreferences(loadMailPreferences());
              setDownload(undefined);
              setSyncLabel('No downloaded mail to sync');
              void refreshGatekeeper();
              Alert.alert('Local data cleared', 'Miwa is ready for a fresh download.');
            } catch (error) {
              Alert.alert('Could not clear local data', messageFor(error));
            } finally {
              setClearing(false);
              setSyncRevision((current) => current + 1);
            }
          },
        },
      ],
    );
  }, [refreshGatekeeper]);

  // --- Gatekeeper ---

  const decideGatekeeperSender = useCallback(
    async (email: string, status: GatekeeperStatus) => {
      setGatekeeperActionEmail(email);
      setGatekeeperError(undefined);
      try {
        await setGatekeeperSenderStatus(email, status);
        await Promise.all([refreshGatekeeper(false), refreshThreads()]);
      } catch (error) {
        setGatekeeperError(messageFor(error));
        Alert.alert('Could not update Gatekeeper', messageFor(error));
      } finally {
        setGatekeeperActionEmail(undefined);
      }
    },
    [refreshGatekeeper, refreshThreads],
  );

  // --- Thread actions (optimistic, then confirmed against Gmail) ---

  const patchThread = useCallback(
    (thread: MailThreadSummary, patch: Partial<MailThreadSummary>) => {
      const matches = (item: MailThreadSummary) =>
        item.accountId === thread.accountId && item.threadId === thread.threadId;
      setThreads((current) =>
        current?.map((item) => (matches(item) ? { ...item, ...patch } : item)),
      );
      setSelectedThread((current) =>
        current && matches(current) ? { ...current, ...patch } : current,
      );
    },
    [],
  );

  const toggleRead = useCallback(
    async (thread: MailThreadSummary) => {
      const key = `read:${thread.accountId}:${thread.threadId}`;
      if (busyAction === key) return;
      const unread = !thread.unread;

      setBusyAction(key);
      patchThread(thread, { unread });
      let gmailUpdated = false;
      try {
        await withGmailReauth(thread.accountId, () =>
          setGmailThreadReadState(thread.accountId, thread.threadId, unread),
        );
        gmailUpdated = true;
        await setThreadReadState(thread.accountId, thread.threadId, unread);
        syncRef.current?.runNow();
      } catch (error) {
        if (!gmailUpdated) patchThread(thread, { unread: thread.unread });
        else syncRef.current?.runNow();
        Alert.alert(
          gmailUpdated ? 'Gmail updated, but Miwa could not refresh' : 'Could not update Gmail',
          messageFor(error),
        );
      } finally {
        setBusyAction((current) => (current === key ? undefined : current));
      }
    },
    [busyAction, patchThread],
  );

  const archiveThread = useCallback(
    async (thread: MailThreadSummary) => {
      const key = `archive:${thread.accountId}:${thread.threadId}`;
      if (busyAction === key) return;

      setBusyAction(key);
      setThreads((current) =>
        current?.filter(
          (item) => item.accountId !== thread.accountId || item.threadId !== thread.threadId,
        ),
      );
      let gmailUpdated = false;
      try {
        await withGmailReauth(thread.accountId, () =>
          archiveGmailThread(thread.accountId, thread.threadId),
        );
        gmailUpdated = true;
        await removeInboxThread(thread.accountId, thread.threadId);
        void refreshGatekeeper(false);
        syncRef.current?.runNow();
      } catch (error) {
        await refreshThreads();
        if (gmailUpdated) syncRef.current?.runNow();
        Alert.alert(
          gmailUpdated
            ? 'Gmail archived the conversation, but Miwa could not refresh'
            : 'Could not archive conversation',
          messageFor(error),
        );
      } finally {
        setBusyAction((current) => (current === key ? undefined : current));
      }
    },
    [busyAction, refreshGatekeeper, refreshThreads],
  );

  const setPinned = useCallback(
    async (thread: MailThreadSummary, pinned: boolean) => {
      const key = `pin:${thread.accountId}:${thread.threadId}`;
      if (busyAction === key) return;

      setBusyAction(key);
      patchThread(thread, { pinned });
      try {
        await setThreadPinnedState(thread.accountId, thread.threadId, pinned);
      } catch (error) {
        patchThread(thread, { pinned: thread.pinned });
        Alert.alert('Could not update pin', messageFor(error));
      } finally {
        setBusyAction((current) => (current === key ? undefined : current));
      }
    },
    [busyAction, patchThread],
  );

  // --- Toolbar ---

  const accountSegments = useMemo<ToolbarSegment[]>(
    () => [
      { id: 'all', label: 'All inboxes', systemImage: 'tray.full' },
      ...(accounts ?? []).map((account) => ({
        id: `account:${account.id}`,
        label: account.email,
        imageData: avatarData[account.id],
        fallbackText: accountInitials(account),
      })),
    ],
    [accounts, avatarData],
  );

  const selectedAccountIndex =
    mailboxView.kind === 'all'
      ? 0
      : Math.max(
          0,
          (accounts ?? []).findIndex((account) => account.id === mailboxView.accountId) + 1,
        );
  const mailboxName =
    mailboxView.kind === 'account' ? accountsById.get(mailboxView.accountId)?.email : undefined;
  const inboxTitle = mailboxView.kind === 'all' ? 'All Inboxes' : mailboxName ?? 'Inbox';

  const toolbarInput: ToolbarInput = {
    surface,
    inboxTitle,
    thread:
      surface === 'mail' && selectedThread
        ? {
            unread: selectedThread.unread,
            pinned: selectedThread.pinned,
            busy: busyAction !== undefined,
          }
        : undefined,
    accountSegments,
    selectedAccountIndex,
    syncing,
    syncLabel,
    download,
    gatekeeperPending: gatekeeper?.pending.length ?? 0,
    accounts: (accounts ?? []).map((account) => ({ id: account.id, email: account.email })),
  };
  const toolbarItems = buildToolbarItems(toolbarInput);

  const selectMailbox = useCallback((segmentId: string) => {
    if (mailboxFrameRef.current !== null) cancelAnimationFrame(mailboxFrameRef.current);
    mailboxFrameRef.current = requestAnimationFrame(() => {
      mailboxFrameRef.current = null;
      setSelectedThread(undefined);
      setSurface('mail');
      setMailboxView(
        segmentId === 'all'
          ? { kind: 'all' }
          : { kind: 'account', accountId: segmentId.replace('account:', '') },
      );
    });
  }, []);

  const handleToolbarPress = useCallback(
    ({ nativeEvent }: ToolbarItemPressEvent) => {
      const id = nativeEvent.id;
      if (id === 'back') {
        if (selectedThread) setSelectedThread(undefined);
        setSurface('mail');
      } else if (id === 'message-read-toggle' && selectedThread) {
        void toggleRead(selectedThread);
      } else if (id === 'message-archive' && selectedThread) {
        void archiveThread(selectedThread);
      } else if (id === 'message-pin' && selectedThread) {
        void setPinned(selectedThread, !selectedThread.pinned);
      } else if (id === 'connect-account') {
        void connectAccount();
      } else if (id === 'gatekeeper' || id === 'settings') {
        setSelectedThread(undefined);
        setSurface(id);
      }
    },
    [archiveThread, connectAccount, selectedThread, setPinned, toggleRead],
  );

  const handleSegmentChange = useCallback(
    ({ nativeEvent }: ToolbarSegmentChangeEvent) => {
      selectMailbox(nativeEvent.segmentId);
    },
    [selectMailbox],
  );

  const handleMenuPress = useCallback(
    ({ nativeEvent }: ToolbarMenuItemPressEvent) => {
      if (nativeEvent.optionId === 'customize') {
        void toolbarRef.current?.showCustomizationPalette();
      } else if (nativeEvent.optionId === 'reset') {
        void toolbarRef.current?.resetConfiguration();
      } else if (nativeEvent.optionId.startsWith('disconnect:')) {
        const account = accountsById.get(nativeEvent.optionId.replace('disconnect:', ''));
        if (account) disconnectAccount(account);
      }
    },
    [accountsById, disconnectAccount],
  );

  // --- Main content ---

  const visibleThreads = useMemo(() => {
    if (mailboxView.kind === 'all') return threads ?? [];
    return (threads ?? []).filter((thread) => thread.accountId === mailboxView.accountId);
  }, [threads, mailboxView]);

  let mainContent: React.ReactNode = null;
  if (accounts === undefined || threads === undefined) {
    mainContent = (
      <Text selectable style={shared.stateText}>Loading downloaded mail…</Text>
    );
  } else if (threadsError) {
    mainContent = (
      <NativeEmptyState
        actionLabel="Try Again"
        description={threadsError}
        onAction={() => void refreshThreads()}
        systemImage="exclamationmark.triangle"
        title="The mail drawer is stuck."
      />
    );
  } else if (accounts.length === 0 && threads.length === 0) {
    mainContent = (
      <NativeEmptyState
        actionLabel="Connect Gmail"
        description={connectError ?? 'Connect a Gmail account, then download an inbox for offline reading.'}
        onAction={() => void connectAccount()}
        systemImage="envelope"
        title="No mailbox has wandered in yet."
      />
    );
  } else {
    mainContent = (
      <ThreadList
        accountsById={accountsById}
        datasetKey={mailboxView.kind === 'all' ? 'all' : mailboxView.accountId}
        emptyMailboxName={mailboxName}
        onOpenThread={setSelectedThread}
        onArchive={(thread) => void archiveThread(thread)}
        onSetPinned={(thread, pinned) => void setPinned(thread, pinned)}
        onToggleRead={(thread) => void toggleRead(thread)}
        preferences={preferences}
        threads={visibleThreads}
      />
    );
  }

  return (
    <View style={styles.appRoot}>
      <NativeWindowToolbar
        ref={toolbarRef}
        style={styles.toolbarBridge}
        identifier={toolbarIdentifier(toolbarInput)}
        items={toolbarItems}
        customizable
        autosavesConfiguration
        displayMode="iconOnly"
        toolbarStyle="unified"
        onItemPress={handleToolbarPress}
        onSegmentChange={handleSegmentChange}
        onMenuItemPress={handleMenuPress}
      />

      <View style={styles.mainPane}>
        {surface === 'settings' ? (
          <View style={styles.settingsLayer}>
            <SettingsView
              accounts={accounts ?? []}
              clearEnabled={!download && !syncing}
              downloadEnabled={(accounts ?? []).length > 0}
              downloadLimit={DEFAULT_INBOX_DOWNLOAD_LIMIT}
              downloadStatus={download?.label ?? ''}
              downloadingAccountId={download?.accountId}
              isClearingData={clearing}
              isDownloading={download !== undefined}
              onChangePreference={changePreference}
              onClearDatabase={clearData}
              onConnectAccount={() => void connectAccount()}
              onDownloadMail={() => void downloadAccounts(accounts ?? [])}
              onDownloadMailbox={(account) => void downloadAccounts([account])}
              onDisconnectAccount={disconnectAccount}
              preferences={preferences}
            />
          </View>
        ) : null}
        {surface === 'gatekeeper' ? (
          <View style={styles.contentLayer}>
            <GatekeeperView
              actionEmail={gatekeeperActionEmail}
              error={gatekeeperError}
              loading={gatekeeperLoading}
              onApprove={(email) => void decideGatekeeperSender(email, 'approved')}
              onBlock={(email) => void decideGatekeeperSender(email, 'blocked')}
              onRetry={() => void refreshGatekeeper()}
              onUnblock={(email) => void decideGatekeeperSender(email, 'pending')}
              overview={gatekeeper}
            />
          </View>
        ) : null}
        {surface === 'mail' && !selectedThread ? (
          <View style={styles.contentLayer}>{mainContent}</View>
        ) : null}
        {surface === 'mail' && selectedThread ? (
          <View style={styles.contentLayer}>
            <ThreadDetail detail={detail} loading={detailLoading} error={detailError} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: 'transparent' },
  toolbarBridge: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  mainPane: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  settingsLayer: { flex: 1, alignSelf: 'stretch', zIndex: 1 },
  contentLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
});
