import './global.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';
import {
  NativeWindowToolbar,
  type NativeWindowToolbarRef,
  type ToolbarItemPressEvent,
  type ToolbarMenuItemPressEvent,
  type ToolbarSegment,
  type ToolbarSegmentChangeEvent,
} from './modules/native-window-toolbar/src';
import { GatekeeperScreen } from './src/mail/gatekeeper-screen';
import { NativeEmptyState } from './src/components/native-controls';
import { SettingsScreen } from './src/settings/settings-screen';
import { ThreadDetail } from './src/mail/thread-detail';
import { ThreadList } from './src/mail/thread-list';
import { colors } from './src/components/native-colors';
import { accountInitials } from './src/mail/accounts';
import { messageFor } from './src/mail/async';
import { DEFAULT_INBOX_DOWNLOAD_LIMIT } from './src/mail/download-inbox';
import { useAccounts } from './src/mail/use-accounts';
import { useInboxDownload } from './src/mail/use-inbox-download';
import { useMailbox } from './src/mail/use-mailbox';
import type { MailboxView } from './src/mail/types';
import { loadMailPreferences, saveShowPreviews } from './src/settings/preferences';
import {
  buildToolbarItems,
  toolbarIdentifier,
  type AppSurface,
  type ToolbarInput,
} from './src/components/mail-toolbar';

export default function App() {
  const toolbarStyle = useResolveClassNames('absolute w-[1px] h-[1px] opacity-0');
  const toolbarRef = useRef<NativeWindowToolbarRef>(null);
  const mailboxFrameRef = useRef<number | null>(null);

  const [surface, setSurface] = useState<AppSurface>('mail');
  const [mailboxView, setMailboxView] = useState<MailboxView>({ kind: 'all' });
  const [preferences, setPreferences] = useState(loadMailPreferences);
  const [clearing, setClearing] = useState(false);

  const mailbox = useMailbox();
  const { selectedThread, setSelectedThread } = mailbox;
  const onDisconnected = useCallback(
    (accountId: string) => {
      setMailboxView({ kind: 'all' });
      setSelectedThread((current) => (current?.accountId === accountId ? undefined : current));
    },
    [setSelectedThread],
  );
  const {
    accounts,
    avatarData,
    connectError,
    connectAccount: connect,
    disconnectAccount,
  } = useAccounts(onDisconnected);
  const { download, downloadAccounts } = useInboxDownload(mailbox.refreshThreads);
  const connectAccount = useCallback(async () => {
    const account = await connect();
    if (account) setMailboxView({ kind: 'account', accountId: account.id });
  }, [connect]);

  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, account])),
    [accounts],
  );

  useEffect(
    () => () => {
      if (mailboxFrameRef.current !== null) cancelAnimationFrame(mailboxFrameRef.current);
    },
    [],
  );

  const changeShowPreviews = (showPreviews: boolean) => {
    saveShowPreviews(showPreviews);
    setPreferences({ showPreviews });
  };

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
            try {
              mailbox.resetMailbox();
              setMailboxView({ kind: 'all' });
              setPreferences(loadMailPreferences());
              Alert.alert('Local data cleared', 'Miwa is ready for a fresh download.');
            } catch (error) {
              Alert.alert('Could not clear local data', messageFor(error));
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  }, [mailbox.resetMailbox]);

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
  const inboxTitle = mailboxView.kind === 'all' ? 'All Inboxes' : (mailboxName ?? 'Inbox');

  const toolbarInput: ToolbarInput = {
    surface,
    inboxTitle,
    thread:
      surface === 'mail' && selectedThread
        ? {
            unread: selectedThread.unread,
            pinned: selectedThread.pinned,
            busy: mailbox.busyAction !== undefined,
          }
        : undefined,
    accountSegments,
    selectedAccountIndex,
    syncing: mailbox.syncing,
    syncLabel: mailbox.syncLabel,
    download,
    gatekeeperPending: mailbox.gatekeeper?.pending.length ?? 0,
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
        void mailbox.toggleRead(selectedThread);
      } else if (id === 'message-archive' && selectedThread) {
        void mailbox.archiveThread(selectedThread);
      } else if (id === 'message-pin' && selectedThread) {
        void mailbox.setPinned(selectedThread, !selectedThread.pinned);
      } else if (id === 'connect-account') {
        void connectAccount();
      } else if (id === 'gatekeeper' || id === 'settings') {
        setSelectedThread(undefined);
        setSurface(id);
      }
    },
    [mailbox.archiveThread, connectAccount, selectedThread, mailbox.setPinned, mailbox.toggleRead],
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

  const visibleThreads = useMemo(() => {
    if (mailboxView.kind === 'all') return mailbox.threads ?? [];
    return (mailbox.threads ?? []).filter((thread) => thread.accountId === mailboxView.accountId);
  }, [mailbox.threads, mailboxView]);

  let mainContent: React.ReactNode = null;
  if (surface === 'settings') {
    mainContent = (
      <SettingsScreen
        accounts={accounts ?? []}
        clearEnabled={!download && !mailbox.syncing}
        downloadEnabled={(accounts ?? []).length > 0}
        downloadLimit={DEFAULT_INBOX_DOWNLOAD_LIMIT}
        downloadStatus={download?.label ?? ''}
        downloadingAccountId={download?.accountId}
        isClearingData={clearing}
        isDownloading={download !== undefined}
        onChangeShowPreviews={changeShowPreviews}
        onClearDatabase={clearData}
        onConnectAccount={() => void connectAccount()}
        onDownloadMail={() => void downloadAccounts(accounts ?? [])}
        onDownloadMailbox={(account) => void downloadAccounts([account])}
        onDisconnectAccount={disconnectAccount}
        preferences={preferences}
      />
    );
  } else if (surface === 'gatekeeper') {
    mainContent = (
      <GatekeeperScreen
        actionEmail={mailbox.gatekeeperActionEmail}
        error={mailbox.gatekeeperError}
        loading={mailbox.gatekeeperLoading}
        onApprove={(email) => void mailbox.decideGatekeeperSender(email, 'approved')}
        onBlock={(email) => void mailbox.decideGatekeeperSender(email, 'blocked')}
        onRetry={() => void mailbox.refreshGatekeeper()}
        onUnblock={(email) => void mailbox.decideGatekeeperSender(email, 'pending')}
        overview={mailbox.gatekeeper}
      />
    );
  } else if (selectedThread) {
    mainContent = (
      <ThreadDetail
        detail={mailbox.detail}
        loading={mailbox.detailLoading}
        error={mailbox.detailError}
      />
    );
  } else if (accounts === undefined || mailbox.threads === undefined) {
    mainContent = (
      <Text
        selectable
        className="p-[20px] text-[12px] text-center"
        style={{ color: colors.secondaryLabel }}
      >
        Loading downloaded mail…
      </Text>
    );
  } else if (mailbox.threadsError) {
    mainContent = (
      <NativeEmptyState
        actionLabel="Try Again"
        description={mailbox.threadsError}
        onAction={() => void mailbox.refreshThreads()}
        systemImage="exclamationmark.triangle"
        title="The mail drawer is stuck."
      />
    );
  } else if (accounts.length === 0 && mailbox.threads.length === 0) {
    mainContent = (
      <NativeEmptyState
        actionLabel="Connect Gmail"
        description={
          connectError ?? 'Connect a Gmail account, then download an inbox for offline reading.'
        }
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
        onArchive={(thread) => void mailbox.archiveThread(thread)}
        onSetDone={(thread, done) => void mailbox.setDone(thread, done)}
        onSetPinned={(thread, pinned) => void mailbox.setPinned(thread, pinned)}
        onToggleRead={(thread) => void mailbox.toggleRead(thread)}
        preferences={preferences}
        threads={visibleThreads}
      />
    );
  }

  return (
    <View className="flex-1 bg-transparent">
      <NativeWindowToolbar
        ref={toolbarRef}
        style={toolbarStyle}
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

      {mainContent}
    </View>
  );
}
