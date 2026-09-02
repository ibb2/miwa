import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { clearLocalDatabase } from './src/db/clear-database';
import { GatekeeperView } from './src/components/gatekeeper-view';
import { MailboxThreadList } from './src/components/mailbox-thread-list';
import { SettingsView } from './src/components/settings-view';
import { gmailAccountAuth } from './src/mail/account-auth';
import { archiveGmailThread, GmailApiError, setGmailThreadReadState } from './src/mail/gmail';
import {
  loadGatekeeperOverview,
  setGatekeeperSenderStatus,
  type GatekeeperOverview,
  type GatekeeperStatus,
} from './src/mail/gatekeeper';
import {
  DEFAULT_INBOX_DOWNLOAD_LIMIT,
  downloadInbox,
  type InboxDownloadProgress,
} from './src/mail/inbox-download';
import {
  startInboxReconciliation,
  type InboxReconciliationController,
} from './src/mail/inbox-reconciliation';
import {
  inboxLayoutMode,
  type InboxLayoutMode,
  type InboxSectionFocus,
} from './src/mail/inbox-layout';
import {
  loadDownloadedThreadDetail,
  loadDownloadedThreads,
  removeDownloadedInboxThread,
  setDownloadedThreadReadState,
  setDownloadedThreadPinnedState,
} from './src/mail/offline-mail';
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
} from './src/settings/mail-preferences';
import {
  loadInboxLayoutMode,
  saveInboxLayoutMode,
} from './src/settings/inbox-layout-preference';

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

type AppSurface = 'mail' | 'gatekeeper' | 'settings';

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

type MailLoadPerformance = {
  threadCount: number;
  databaseFetchMs: number;
};

export default function App() {
  const toolbarRef = useRef<NativeWindowToolbarRef>(null);
  const reconciliationRef = useRef<InboxReconciliationController>(null);
  const downloadActiveRef = useRef(false);
  const lastDownloadProgressUpdateRef = useRef(0);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [surface, setSurface] = useState<AppSurface>('mail');
  const [preferences, setPreferences] = useState<MailPreferences>(
    loadMailPreferences,
  );
  const [mailboxView, setMailboxView] = useState<MailboxView>({ kind: 'all' });
  const [inboxLayout, setInboxLayout] = useState<InboxLayoutMode>(loadInboxLayoutMode);
  const [focusedInboxSection, setFocusedInboxSection] = useState<InboxSectionFocus>();
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [connectError, setConnectError] = useState<string>();
  const [avatarData, setAvatarData] = useState<Record<string, string>>({});
  const [downloadState, setDownloadState] = useState<ToolbarDownloadState>(idleDownloadState);
  const [isClearingData, setIsClearingData] = useState(false);
  const [reconciliationRevision, setReconciliationRevision] = useState(0);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [syncStatusLabel, setSyncStatusLabel] = useState('Check Gmail for new mail');
  const [downloadedThreads, setDownloadedThreads] = useState<MailThreadSummary[]>();
  const [mailLoadError, setMailLoadError] = useState<string>();
  const [mailLoadPerformance, setMailLoadPerformance] = useState<MailLoadPerformance>();
  const [gatekeeperOverview, setGatekeeperOverview] = useState<GatekeeperOverview>();
  const [gatekeeperLoading, setGatekeeperLoading] = useState(true);
  const [gatekeeperError, setGatekeeperError] = useState<string>();
  const [gatekeeperActionEmail, setGatekeeperActionEmail] = useState<string>();
  const [selectedThread, setSelectedThread] = useState<MailThreadSummary>();
  const [threadDetail, setThreadDetail] = useState<MailThreadDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [readStateActionKey, setReadStateActionKey] = useState<string>();
  const [archiveActionKey, setArchiveActionKey] = useState<string>();
  const [pinActionKey, setPinActionKey] = useState<string>();
  const listPerformanceLoggedRef = useRef(false);
  const mailboxSelectionFrameRef = useRef<number | null>(null);
  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const changePreference = useCallback(
    (key: keyof MailPreferences, value: boolean) => {
      setPreferences((current) => ({ ...current, [key]: value }));
      saveMailPreference(key, value);
    },
    [],
  );

  const refreshGatekeeper = useCallback(async (showLoading = true) => {
    if (showLoading) setGatekeeperLoading(true);
    setGatekeeperError(undefined);
    try {
      setGatekeeperOverview(await loadGatekeeperOverview());
    } catch (error) {
      setGatekeeperError(messageFor(error));
    } finally {
      setGatekeeperLoading(false);
    }
  }, []);

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
      void refreshGatekeeper(false);
    } catch (error) {
      setDownloadedThreads([]);
      setMailLoadError(messageFor(error));
    }
  }, [refreshGatekeeper]);

  useEffect(() => {
    void loadAllDownloadedMail();
  }, [loadAllDownloadedMail]);

  useEffect(() => () => {
    if (mailboxSelectionFrameRef.current !== null) {
      cancelAnimationFrame(mailboxSelectionFrameRef.current);
    }
  }, []);

  useEffect(() => {
    const reconciliation = startInboxReconciliation({
      onCycleStart: () => {
        setSyncingInbox(true);
        setSyncStatusLabel('Checking Gmail for new mail…');
      },
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
        const updated = cycle.accounts.reduce(
          (total, account) => total + account.threadsUpserted,
          0,
        );
        const removed = cycle.accounts.reduce(
          (total, account) => total + account.threadsRemoved,
          0,
        );
        setSyncStatusLabel(
          cycle.failures.length > 0
            ? `Mail sync finished with ${cycle.failures.length.toLocaleString()} ${cycle.failures.length === 1 ? 'account error' : 'account errors'}`
            : changed
            ? `Mail updated: ${updated.toLocaleString()} changed, ${removed.toLocaleString()} removed`
            : 'Mail is up to date',
        );
        if (changed) void loadAllDownloadedMail(false);
      },
      onError: (error) => {
        setSyncStatusLabel(`Mail sync failed: ${messageFor(error)}`);
        if (__DEV__) {
          console.warn(
            '[MiwaReconciliation] Gmail INBOX reconciliation failed',
            messageFor(error),
          );
        }
      },
      onCycleEnd: () => setSyncingInbox(false),
    });
    reconciliationRef.current = reconciliation;
    return () => {
      if (reconciliationRef.current === reconciliation) {
        reconciliationRef.current = null;
      }
      reconciliation.stop();
    };
  }, [loadAllDownloadedMail, reconciliationRevision]);

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
      'Remove Gmail account?',
      `${account.email} will be removed from Miwa. Your Gmail data will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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

  const clearDatabase = useCallback(() => {
    Alert.alert(
      'Clear all local data?',
      'Every downloaded message and attachment, cached account record, sync cursor, and preference will be removed from Miwa. Your Gmail accounts and Gmail messages will not be changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: () => {
            setIsClearingData(true);
            reconciliationRef.current?.stop();
            reconciliationRef.current = null;
            try {
              clearLocalDatabase();
              setDownloadedThreads([]);
              setMailLoadError(undefined);
              setMailLoadPerformance(undefined);
              setSelectedThread(undefined);
              setThreadDetail(undefined);
              setDetailError(undefined);
              setMailboxView({ kind: 'all' });
              setPreferences(loadMailPreferences());
              setInboxLayout(loadInboxLayoutMode());
              setDownloadState(idleDownloadState);
              setSyncStatusLabel('No downloaded mail to sync');
              void refreshGatekeeper();
              setReconciliationRevision((current) => current + 1);
              Alert.alert('Local data cleared', 'Miwa is ready for a fresh download.');
            } catch (error) {
              Alert.alert('Could not clear local data', messageFor(error));
              setReconciliationRevision((current) => current + 1);
            } finally {
              setIsClearingData(false);
            }
          },
        },
      ],
    );
  }, [refreshGatekeeper]);

  const decideGatekeeperSender = useCallback(async (
    email: string,
    status: GatekeeperStatus,
  ) => {
    setGatekeeperActionEmail(email);
    setGatekeeperError(undefined);
    try {
      await setGatekeeperSenderStatus(email, status);
      await Promise.all([
        refreshGatekeeper(false),
        loadAllDownloadedMail(false),
      ]);
    } catch (error) {
      const failure = messageFor(error);
      setGatekeeperError(failure);
      Alert.alert('Could not update Gatekeeper', failure);
    } finally {
      setGatekeeperActionEmail(undefined);
    }
  }, [loadAllDownloadedMail, refreshGatekeeper]);

  const changeThreadReadState = useCallback(async (thread: MailThreadSummary) => {
    const actionKey = `${thread.accountId}:${thread.threadId}`;
    if (readStateActionKey === actionKey) return;
    const unread = !thread.unread;
    const updateVisibleState = (nextUnread: boolean) => {
      setDownloadedThreads((current) => current?.map((item) =>
        item.accountId === thread.accountId && item.threadId === thread.threadId
          ? { ...item, unread: nextUnread }
          : item
      ));
      setSelectedThread((current) =>
        current?.accountId === thread.accountId && current.threadId === thread.threadId
          ? { ...current, unread: nextUnread }
          : current
      );
    };

    setReadStateActionKey(actionKey);
    updateVisibleState(unread);
    let gmailUpdated = false;
    try {
      try {
        await setGmailThreadReadState(thread.accountId, thread.threadId, unread);
      } catch (error) {
        if (!(error instanceof GmailApiError) || !error.requiresReauthentication) throw error;
        await gmailAccountAuth.reauthorizeAccount(thread.accountId);
        await setGmailThreadReadState(thread.accountId, thread.threadId, unread);
      }
      gmailUpdated = true;
      await setDownloadedThreadReadState(thread.accountId, thread.threadId, unread);
      reconciliationRef.current?.runNow();
    } catch (error) {
      if (!gmailUpdated) updateVisibleState(thread.unread);
      else reconciliationRef.current?.runNow();
      Alert.alert(
        gmailUpdated ? 'Gmail updated, but Miwa could not refresh' : 'Could not update Gmail',
        messageFor(error),
      );
    } finally {
      setReadStateActionKey((current) => current === actionKey ? undefined : current);
    }
  }, [readStateActionKey]);

  const archiveThread = useCallback(async (thread: MailThreadSummary) => {
    const actionKey = `${thread.accountId}:${thread.threadId}`;
    if (archiveActionKey === actionKey) return;

    setArchiveActionKey(actionKey);
    setDownloadedThreads((current) => current?.filter((item) =>
      item.accountId !== thread.accountId || item.threadId !== thread.threadId
    ));

    let gmailUpdated = false;
    try {
      try {
        await archiveGmailThread(thread.accountId, thread.threadId);
      } catch (error) {
        if (!(error instanceof GmailApiError) || !error.requiresReauthentication) throw error;
        await gmailAccountAuth.reauthorizeAccount(thread.accountId);
        await archiveGmailThread(thread.accountId, thread.threadId);
      }
      gmailUpdated = true;
      await removeDownloadedInboxThread(thread.accountId, thread.threadId);
      void refreshGatekeeper(false);
      reconciliationRef.current?.runNow();
    } catch (error) {
      await loadAllDownloadedMail(false);
      if (gmailUpdated) reconciliationRef.current?.runNow();
      Alert.alert(
        gmailUpdated ? 'Gmail archived the conversation, but Miwa could not refresh' : 'Could not archive conversation',
        messageFor(error),
      );
    } finally {
      setArchiveActionKey((current) => current === actionKey ? undefined : current);
    }
  }, [archiveActionKey, loadAllDownloadedMail, refreshGatekeeper]);

  const setThreadPinned = useCallback(async (
    thread: MailThreadSummary,
    pinned: boolean,
  ) => {
    const actionKey = `${thread.accountId}:${thread.threadId}`;
    if (pinActionKey === actionKey) return;
    const updateVisibleState = (nextPinned: boolean) => {
      setDownloadedThreads((current) => current?.map((item) =>
        item.accountId === thread.accountId && item.threadId === thread.threadId
          ? { ...item, pinned: nextPinned }
          : item
      ));
      setSelectedThread((current) =>
        current?.accountId === thread.accountId && current.threadId === thread.threadId
          ? { ...current, pinned: nextPinned }
          : current
      );
    };

    setPinActionKey(actionKey);
    updateVisibleState(pinned);
    try {
      await setDownloadedThreadPinnedState(thread.accountId, thread.threadId, pinned);
    } catch (error) {
      updateVisibleState(thread.pinned);
      Alert.alert('Could not update pin', messageFor(error));
    } finally {
      setPinActionKey((current) => current === actionKey ? undefined : current);
    }
  }, [pinActionKey]);

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
  const mailboxName = mailboxView.kind === 'account'
    ? accountsById.get(mailboxView.accountId)?.email
    : undefined;
  const inboxTitle = mailboxView.kind === 'all'
    ? 'All Inboxes'
    : mailboxName ?? 'Inbox';

  const toolbarItems = useMemo<NativeToolbarItem[]>(() => [
    ...(selectedThread || focusedInboxSection || surface !== 'mail'
      ? [{
          id: 'back',
          kind: 'button' as const,
          label: surface !== 'mail' ? 'Back to inbox' : `Back to ${inboxTitle}`,
          systemImage: 'chevron.left',
          toolTip: surface !== 'mail' ? 'Back to inbox' : `Back to ${inboxTitle}`,
          immovable: true,
          navigational: true,
        }]
      : []),
    ...(surface === 'mail'
      ? [{
          id: 'accounts',
          kind: 'segmented' as const,
          label: 'Inbox account',
          selectionMode: 'selectOne' as const,
          selectedIndex: selectedAccountIndex,
          segments: accountSegments,
          immovable: true,
          navigational: true,
        }]
      : []),
    ...(surface === 'mail' && !selectedThread && !focusedInboxSection
      ? [{
          id: 'inbox-layout',
          kind: 'segmented' as const,
          label: 'Inbox layout',
          selectionMode: 'selectOne' as const,
          selectedIndex: inboxLayout === 'categorized' ? 0 : 1,
          segments: [
            { id: 'categorized', label: 'Categorized', systemImage: 'rectangle.grid.1x2' },
            { id: 'single', label: 'Single card', systemImage: 'rectangle' },
          ],
          toolTip: 'Switch inbox layout',
          immovable: true,
          navigational: true,
        }]
      : []),
    { id: 'toolbar-spacer', kind: 'flexibleSpace' },
    ...(surface === 'mail' && selectedThread
      ? [
        {
          id: 'message-read-toggle',
          kind: 'button' as const,
          label: selectedThread.unread ? 'Mark as read' : 'Mark as unread',
          systemImage: selectedThread.unread ? 'envelope.badge' : 'envelope.open',
          toolTip: selectedThread.unread ? 'Mark as read' : 'Mark as unread',
          enabled: readStateActionKey !== `${selectedThread.accountId}:${selectedThread.threadId}`,
          immovable: true,
        },
        {
          id: 'message-archive',
          kind: 'button' as const,
          label: 'Archive',
          systemImage: 'archivebox',
          toolTip: 'Archive conversation',
          enabled: archiveActionKey !== `${selectedThread.accountId}:${selectedThread.threadId}`,
          immovable: true,
        },
        {
          id: 'message-pin',
          kind: 'button' as const,
          label: selectedThread.pinned ? 'Unpin' : 'Pin',
          systemImage: selectedThread.pinned ? 'pin.slash' : 'pin',
          toolTip: selectedThread.pinned ? 'Unpin conversation' : 'Pin conversation',
          enabled: pinActionKey !== `${selectedThread.accountId}:${selectedThread.threadId}`,
          immovable: true,
        },
        {
          id: 'message-delete',
          kind: 'button' as const,
          label: 'Delete',
          systemImage: 'trash',
          toolTip: 'Delete conversation',
          immovable: true,
        },
        { id: 'message-action-space', kind: 'space' as const, immovable: true },
        {
          id: 'message-reply',
          kind: 'button' as const,
          label: 'Reply',
          systemImage: 'arrowshape.turn.up.left',
          toolTip: 'Reply',
          immovable: true,
        },
        {
          id: 'message-reply-all',
          kind: 'button' as const,
          label: 'Reply All',
          systemImage: 'arrowshape.turn.up.left.2',
          toolTip: 'Reply all',
          immovable: true,
        },
        {
          id: 'message-forward',
          kind: 'button' as const,
          label: 'Forward',
          systemImage: 'arrowshape.turn.up.right',
          toolTip: 'Forward',
          immovable: true,
        },
      ]
      : []),
    ...(syncingInbox
      ? [{
          id: 'sync-inbox',
          kind: 'progress' as const,
          label: 'Syncing Mail',
          toolTip: syncStatusLabel,
          indeterminate: true,
          immovable: true,
        }]
      : []),
    ...(downloadState.status === 'running'
      ? [{
          id: 'download-progress',
          kind: 'progress' as const,
          label: 'Download Progress',
          toolTip: downloadStatusLabel,
          progress: downloadState.fraction,
          indeterminate: !downloadState.currentProgress,
          immovable: true,
        }]
      : []),
    { id: 'connect-account', kind: 'button', label: 'Connect Gmail', systemImage: 'plus', toolTip: 'Connect another Gmail account', enabled: downloadState.status !== 'running', immovable: true },
    ...(surface === 'mail'
      ? [
        {
          id: 'gatekeeper',
          kind: 'button' as const,
          label: 'Gatekeeper',
          systemImage: 'checkmark.shield',
          badgeCount: gatekeeperOverview?.pending.length ?? 0,
          toolTip: gatekeeperOverview?.pending.length
            ? `Review ${gatekeeperOverview.pending.length.toLocaleString()} new ${
                gatekeeperOverview.pending.length === 1 ? 'sender' : 'senders'
              }`
            : 'No new senders to review',
          immovable: true,
        },
        {
          id: 'settings',
          kind: 'button' as const,
          label: 'Settings',
          systemImage: 'gearshape',
          toolTip: 'Open Miwa settings',
          immovable: true,
        },
      ]
      : []),
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
  ], [
    accountSegments,
    accounts,
    downloadState,
    downloadStatusLabel,
    gatekeeperOverview?.pending.length,
    focusedInboxSection,
    inboxLayout,
    inboxTitle,
    selectedAccountIndex,
    selectedThread,
    archiveActionKey,
    pinActionKey,
    readStateActionKey,
    surface,
    syncingInbox,
    syncStatusLabel,
  ]);

  const mailboxLists = useMemo(() => [
    {
      key: 'all',
      mailboxName: undefined,
      threads: downloadedThreads ?? [],
    },
    ...accounts.map((account) => ({
      key: `account:${account.id}`,
      mailboxName: account.email,
      threads: (downloadedThreads ?? []).filter(
        (thread) => thread.accountId === account.id,
      ),
    })),
  ], [accounts, downloadedThreads]);
  const activeMailboxKey = mailboxView.kind === 'all'
    ? 'all'
    : `account:${mailboxView.accountId}`;
  const selectMailboxSegment = useCallback((segmentId: string) => {
    if (mailboxSelectionFrameRef.current !== null) {
      cancelAnimationFrame(mailboxSelectionFrameRef.current);
    }
    mailboxSelectionFrameRef.current = requestAnimationFrame(() => {
      mailboxSelectionFrameRef.current = null;
      setSelectedThread(undefined);
      setFocusedInboxSection(undefined);
      setSurface('mail');
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
    const activeList = mailboxLists.find((list) => list.key === activeMailboxKey);
    if (!activeList) return null;

    return (
      <View style={styles.mailboxListStack}>
        <MailboxThreadList
          key={activeList.key}
          accountsById={accountsById}
          focusedSection={focusedInboxSection}
          layoutMode={inboxLayout}
          emptyMailboxName={activeList.mailboxName}
          onFocusSection={setFocusedInboxSection}
          onListLoad={handleListLoad}
          onOpenThread={setSelectedThread}
          onArchive={(thread) => void archiveThread(thread)}
          onSetPinned={(thread, pinned) => void setThreadPinned(thread, pinned)}
          onToggleRead={(thread) => void changeThreadReadState(thread)}
          preferences={preferences}
          threads={activeList.threads}
        />
      </View>
    );
  }, [
    accountsById,
    accounts.length,
    activeMailboxKey,
    archiveThread,
    connectAccount,
    connectError,
    downloadedThreads,
    handleListLoad,
    loadAllDownloadedMail,
    loadingAccounts,
    mailboxLists,
    mailLoadError,
    focusedInboxSection,
    inboxLayout,
    preferences,
    setThreadPinned,
  ]);

  return (
    <View style={styles.appRoot}>
      <NativeWindowToolbar
        ref={toolbarRef}
        style={styles.nativeToolbarBridge}
        identifier={
          surface === 'settings'
            ? 'MiwaSettingsToolbar'
            : surface === 'gatekeeper'
              ? 'MiwaGatekeeperToolbar'
            : selectedThread
              ? 'MiwaMessageToolbar'
              : focusedInboxSection
                ? 'MiwaSectionToolbar'
                : 'MiwaLeadingInboxToolbar'
        }
        items={toolbarItems}
        customizable
        autosavesConfiguration
        displayMode="iconOnly"
        toolbarStyle="unified"
        onItemPress={({ nativeEvent }) => {
          if (nativeEvent.id === 'back') {
            if (selectedThread) setSelectedThread(undefined);
            else if (focusedInboxSection) setFocusedInboxSection(undefined);
            setSurface('mail');
          }
          else if (nativeEvent.id === 'message-read-toggle' && selectedThread) {
            void changeThreadReadState(selectedThread);
          }
          else if (nativeEvent.id === 'message-archive' && selectedThread) {
            void archiveThread(selectedThread);
          }
          else if (nativeEvent.id === 'message-pin' && selectedThread) {
            void setThreadPinned(selectedThread, !selectedThread.pinned);
          }
          else if (nativeEvent.id === 'connect-account') void connectAccount();
          else if (nativeEvent.id === 'gatekeeper') {
            setSelectedThread(undefined);
            setFocusedInboxSection(undefined);
            setSurface('gatekeeper');
          }
          else if (nativeEvent.id === 'settings') {
            setSelectedThread(undefined);
            setFocusedInboxSection(undefined);
            setSurface('settings');
          }
        }}
        onSegmentChange={({ nativeEvent }) => {
          if (nativeEvent.id === 'inbox-layout') {
            const layout = inboxLayoutMode(nativeEvent.segmentId);
            setInboxLayout(layout);
            setFocusedInboxSection(undefined);
            saveInboxLayoutMode(layout);
          } else {
            selectMailboxSegment(nativeEvent.segmentId);
          }
        }}
        onMenuItemPress={({ nativeEvent }) => {
          if (nativeEvent.optionId === 'customize') void toolbarRef.current?.showCustomizationPalette();
          else if (nativeEvent.optionId === 'reset') void toolbarRef.current?.resetConfiguration();
          else if (nativeEvent.optionId.startsWith('disconnect:')) {
            const account = accountsById.get(nativeEvent.optionId.replace('disconnect:', ''));
            if (account) disconnect(account);
          }
        }}
      />

      <View style={styles.mainPane}>
        <View pointerEvents="none" style={styles.backdrop}>
          <View style={styles.backdropBlue} />
          <View style={styles.backdropPink} />
        </View>
        {surface === 'settings' ? (
          <View style={styles.contentLayer}>
            <SettingsView
              accounts={accounts}
              clearEnabled={downloadState.status !== 'running' && !syncingInbox}
              downloadEnabled={accounts.length > 0}
              downloadLimit={DEFAULT_INBOX_DOWNLOAD_LIMIT}
              downloadStatus={downloadStatusLabel}
              downloadingAccountId={downloadState.currentAccountId}
              isClearingData={isClearingData}
              isDownloading={downloadState.status === 'running'}
              onChangePreference={changePreference}
              onClearDatabase={clearDatabase}
              onConnectAccount={() => void connectAccount()}
              onDownloadMail={() => void downloadAccounts(accounts)}
              onDownloadMailbox={(account) => void downloadAccounts([account])}
              onDisconnectAccount={disconnect}
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
              overview={gatekeeperOverview}
            />
          </View>
        ) : null}
        {surface === 'mail' && !selectedThread ? (
          <View style={styles.contentLayer}>
            {mainContent}
          </View>
        ) : null}
        {selectedThread && surface === 'mail' ? (
          <View style={styles.contentLayer}>
            <ScrollView
              contentContainerStyle={styles.detailContent}
              contentInsetAdjustmentBehavior="automatic"
              style={styles.scrollView}
            >
              {detailLoading ? <Text selectable style={styles.stateText}>Opening downloaded conversation…</Text> : null}
              {detailError ? <Text selectable style={styles.connectError}>{detailError}</Text> : null}
              {threadDetail ? (
                <>
                  <Text selectable style={styles.detailSubject}>
                    {threadDetail.subject || '(No subject)'}
                  </Text>
                  <View style={styles.messageStack}>
                    {threadDetail.messages.map((message) => (
                      <View key={message.id} style={styles.messageCard}>
                        <View style={styles.messageHeader}>
                          <View style={styles.senderMonogram}>
                            <Text selectable style={styles.senderMonogramText}>
                              {message.sender.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.messageIdentity}>
                            <Text selectable style={styles.messageSender}>
                              {message.sender}
                            </Text>
                            {message.recipients ? (
                              <Text numberOfLines={1} selectable style={styles.recipients}>
                                to {message.recipients}
                              </Text>
                            ) : null}
                          </View>
                          <Text selectable style={styles.messageDate}>
                            {new Date(message.sentAt).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.messageRule} />
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
                                {attachment.filename || 'Attachment'}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
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
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  backdrop: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  backdropBlue: {
    position: 'absolute',
    left: -140,
    top: -120,
    width: 620,
    height: 520,
    borderRadius: 260,
    backgroundColor: 'rgba(96, 167, 255, 0.12)',
    transform: [{ rotate: '-10deg' }],
  },
  backdropPink: {
    position: 'absolute',
    left: 360,
    top: -180,
    width: 720,
    height: 680,
    borderRadius: 340,
    backgroundColor: 'rgba(255, 116, 177, 0.14)',
    transform: [{ rotate: '14deg' }],
  },
  scrollView: { flex: 1 },
  mailboxListStack: { flex: 1, position: 'relative' },
  contentLayer: { ...StyleSheet.absoluteFillObject },
  detailContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 38,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },
  detailEyebrow: {
    color: '#E86E5A',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    paddingTop: 6,
  },
  detailSubject: {
    color: PlatformColor('labelColor'),
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  messageStack: {
    flexGrow: 1,
    gap: 16,
  },
  messageCard: {
    flexGrow: 1,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separatorColor'),
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: PlatformColor('controlBackgroundColor'),
    boxShadow: '0 8px 26px rgba(0, 0, 0, 0.055)',
    gap: 12,
  },
  messageHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  senderMonogram: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: '#E86E5A',
  },
  senderMonogramText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  messageIdentity: { flex: 1, minWidth: 0, gap: 2 },
  messageSender: {
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
  messageRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PlatformColor('separatorColor'),
  },
  mailViewer: {
    flex: 1,
    minHeight: 320,
    width: '100%',
  },
  attachmentList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PlatformColor('separatorColor'),
    paddingTop: 10,
    gap: 5,
  },
  attachmentText: {
    alignSelf: 'flex-start',
    color: '#C95243',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(232, 110, 90, 0.09)',
  },
  emptyState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 9 },
  emptyTitle: { color: PlatformColor('labelColor'), fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { maxWidth: 320, color: PlatformColor('secondaryLabelColor'), fontSize: 13, lineHeight: 18, textAlign: 'center' },
  connectButton: { width: 150, height: 32, marginTop: 8, borderRadius: 7, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E86E5A' },
  connectButtonPressed: { opacity: 0.72 },
  connectButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  connectError: { maxWidth: 460, marginTop: 6, color: PlatformColor('systemRedColor'), fontSize: 11, lineHeight: 15, textAlign: 'center' },
  stateText: { padding: 16, color: PlatformColor('secondaryLabelColor'), fontSize: 12, textAlign: 'center' },
});
