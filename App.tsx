import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import type {
  ConnectedAccount,
  MailboxView,
} from './src/mail/types';

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
  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

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
            }).catch((error) => Alert.alert('Could not disconnect Gmail', messageFor(error)));
          },
        },
      ]
    );
  }, []);

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
  }, []);

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
  const mainContent = useMemo(() => {
    if (loadingAccounts) {
      return <Text selectable style={styles.stateText}>Loading accounts…</Text>;
    }
    if (!accounts.length) {
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
    return <EmptyMailboxState mailboxName={mailboxName} />;
  }, [accounts.length, connectAccount, connectError, loadingAccounts, mailboxName]);

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
          setMailboxView(nativeEvent.segmentId === 'all'
            ? { kind: 'all' }
            : { kind: 'account', accountId: nativeEvent.segmentId.replace('account:', '') });
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
        {mainContent}
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
  emptyState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 9 },
  emptyTitle: { color: PlatformColor('labelColor'), fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { maxWidth: 320, color: PlatformColor('secondaryLabelColor'), fontSize: 13, lineHeight: 18, textAlign: 'center' },
  connectButton: { width: 150, height: 32, marginTop: 8, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: PlatformColor('controlAccentColor') },
  connectButtonPressed: { opacity: 0.72 },
  connectButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  connectError: { maxWidth: 460, marginTop: 6, color: PlatformColor('systemRedColor'), fontSize: 11, lineHeight: 15, textAlign: 'center' },
  stateText: { padding: 16, color: PlatformColor('secondaryLabelColor'), fontSize: 12, textAlign: 'center' },
});
