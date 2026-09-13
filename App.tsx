import type { GatekeeperMessage } from './src/mail/gatekeeper';
import './global.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, Text, View } from 'react-native';
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
import { openSettingsWindow } from './modules/native-settings-window/src';
import { composeMessage } from './src/mail/compose-message';
import { ThreadDetail } from './src/mail/thread-detail';
import { ThreadList } from './src/mail/thread-list';
import { colors } from './src/components/native-colors';
import { accountInitials } from './src/mail/accounts';
import { useAccounts } from './src/mail/use-accounts';
import { useInboxDownload } from './src/mail/use-inbox-download';
import { useMailbox } from './src/mail/use-mailbox';
import { createMailSearch } from './src/mail/search';
import type { MailboxView } from './src/mail/types';
import { loadMailPreferences } from './src/settings/preferences';
import {
  dismissDeliveredNotifications,
  subscribeNotificationResponses,
} from './src/mail/notifications';
import {
  SETTINGS_CHANGED_EVENT,
  type SettingsChangedPayload,
} from './src/settings/settings-events';
import {
  buildToolbarItems,
  toolbarIdentifier,
  type AppSurface,
  type ToolbarInput,
} from './src/components/mail-toolbar';

export default function App() {
  const [toolbarInset, setToolbarInset] = useState(0);
  const toolbarStyle = useResolveClassNames('absolute w-[1px] h-[1px] opacity-0');
  const toolbarRef = useRef<NativeWindowToolbarRef>(null);
  const mailboxFrameRef = useRef<number | null>(null);

  const [gatekeeperQuery, setGatekeeperQuery] = useState('');
  const [mailQuery, setMailQuery] = useState('');
  const [gatekeeperTab, setGatekeeperTab] = useState(0);
  const [gatekeeperMessage, setGatekeeperMessage] = useState<{
    email: string;
    message: GatekeeperMessage;
  }>();
  const [surface, setSurface] = useState<AppSurface>('mail');
  const [mailboxView, setMailboxView] = useState<MailboxView>({ kind: 'all' });
  const [preferences, setPreferences] = useState(loadMailPreferences);
  const [pendingNotificationThread, setPendingNotificationThread] = useState<{
    accountId: string;
    threadId: string;
  }>();

  const mailbox = useMailbox();
  const { selectedThread, setSelectedThread } = mailbox;

  // Notification click: reopen on that thread. The thread is usually already
  // in the list; otherwise park it until the in-flight sync lands it.
  useEffect(() => {
    const subscription = subscribeNotificationResponses((response) => {
      const { accountId, threadId } = response;
      if (!accountId || !threadId) return;
      void dismissDeliveredNotifications();
      const match = mailbox.threads?.find(
        (thread) => thread.accountId === accountId && thread.threadId === threadId,
      );
      if (match) {
        setSurface('mail');
        setMailboxView({ kind: 'account', accountId });
        setSelectedThread(match);
      } else {
        setSurface('mail');
        setMailboxView({ kind: 'account', accountId });
        setPendingNotificationThread({ accountId, threadId });
        void mailbox.refreshThreads();
      }
    });
    return () => subscription.remove();
  }, [mailbox.threads, mailbox.refreshThreads, setSelectedThread]);

  useEffect(() => {
    if (!pendingNotificationThread || !mailbox.threads) return;
    const match = mailbox.threads.find(
      (thread) =>
        thread.accountId === pendingNotificationThread.accountId &&
        thread.threadId === pendingNotificationThread.threadId,
    );
    if (match) {
      setSelectedThread(match);
      setPendingNotificationThread(undefined);
    }
  }, [pendingNotificationThread, mailbox.threads, setSelectedThread]);
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
    refreshAccounts,
  } = useAccounts(onDisconnected);
  const { download } = useInboxDownload();
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

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      SETTINGS_CHANGED_EVENT,
      (payload: SettingsChangedPayload) => {
        if (payload?.kind === 'preferences') {
          setPreferences(loadMailPreferences());
        } else if (payload?.kind === 'accounts') {
          void refreshAccounts();
        } else if (payload?.kind === 'download-complete') {
          void mailbox.refreshThreads();
        } else if (payload?.kind === 'database-cleared') {
          mailbox.resetMailbox();
          setMailboxView({ kind: 'all' });
          setPreferences(loadMailPreferences());
        }
      },
    );
    return () => subscription.remove();
  }, [mailbox.refreshThreads, mailbox.resetMailbox, refreshAccounts]);

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
    gatekeeperMessage:
      surface === 'gatekeeper' && gatekeeperMessage
        ? { busy: !!mailbox.gatekeeperActionEmail }
        : undefined,
    inboxTitle,
    thread:
      surface === 'mail' && selectedThread
        ? {
            done: selectedThread.done,
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
    gatekeeperQuery,
    mailQuery,
    gatekeeperTab,
    gatekeeperBlocked: mailbox.gatekeeper?.blocked.length ?? 0,
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
      if (id === 'back' && surface === 'gatekeeper' && gatekeeperMessage) {
        setGatekeeperMessage(undefined);
      } else if (id === 'gatekeeper-message-trash' && gatekeeperMessage) {
        void mailbox
          .deleteGatekeeperMessage(gatekeeperMessage.email, gatekeeperMessage.message)
          .then((deleted) => {
            if (deleted)
              setGatekeeperMessage((current) =>
                current?.message.id === gatekeeperMessage.message.id ? undefined : current,
              );
          });
      } else if (id === 'back') {
        if (selectedThread) setSelectedThread(undefined);
        setSurface('mail');
      } else if (['message-reply', 'message-reply-all', 'message-forward'].includes(id)) {
        const target = surface === 'gatekeeper' ? gatekeeperMessage?.message : selectedThread;
        if (target)
          void composeMessage(
            target.accountId,
            target.threadId,
            accountsById.get(target.accountId)?.email,
            id === 'message-forward'
              ? 'forward'
              : id === 'message-reply-all'
                ? 'reply-all'
                : 'reply',
            surface === 'gatekeeper' ? gatekeeperMessage?.message.id : undefined,
          );
      } else if (id === 'message-trash' && selectedThread) {
        void mailbox.trashThread(selectedThread);
      } else if (id === 'message-done' && selectedThread) {
        void mailbox.setDone(selectedThread, !selectedThread.done);
      } else if (id === 'message-read-toggle' && selectedThread) {
        void mailbox.toggleRead(selectedThread);
      } else if (id === 'message-archive' && selectedThread) {
        void mailbox.archiveThread(selectedThread);
      } else if (id === 'message-pin' && selectedThread) {
        void mailbox.setPinned(selectedThread, !selectedThread.pinned);
      } else if (id === 'connect-account') {
        void connectAccount();
      } else if (id === 'settings') {
        void openSettingsWindow();
      } else if (id === 'gatekeeper') {
        setGatekeeperMessage(undefined);
        setSelectedThread(undefined);
        setSurface(id);
      }
    },
    [
      mailbox.archiveThread,
      mailbox.trashThread,
      mailbox.setDone,
      accountsById,
      connectAccount,
      selectedThread,
      mailbox.setPinned,
      mailbox.toggleRead,
      surface,
      gatekeeperMessage,
      mailbox.deleteGatekeeperMessage,
    ],
  );

  const handleSegmentChange = useCallback(
    ({ nativeEvent }: ToolbarSegmentChangeEvent) => {
      if (nativeEvent.id === 'gatekeeper-tabs') {
        setGatekeeperTab(nativeEvent.selectedIndex);
      } else {
        selectMailbox(nativeEvent.segmentId);
      }
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

  const searchMail = useMemo(() => createMailSearch(mailbox.threads ?? []), [mailbox.threads]);
  const visibleThreads = useMemo(() => {
    const candidates = (mailbox.threads ?? []).filter(
      (thread) => mailboxView.kind === 'all' || thread.accountId === mailboxView.accountId,
    );
    return searchMail(mailQuery, candidates);
  }, [mailbox.threads, mailboxView, mailQuery, searchMail]);

  let mainContent: React.ReactNode = null;
  if (surface === 'gatekeeper') {
    mainContent = (
      <GatekeeperScreen
        query={gatekeeperQuery}
        tab={gatekeeperTab}
        selected={gatekeeperMessage}
        onSelect={setGatekeeperMessage}
        actionEmail={mailbox.gatekeeperActionEmail}
        error={mailbox.gatekeeperError}
        loading={mailbox.gatekeeperLoading}
        onDelete={mailbox.deleteGatekeeperMessage}
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
        onBlock={(email) => void mailbox.decideGatekeeperSender(email, 'blocked')}
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
          connectError
            ? 'Connect a Gmail account and download the inbox to get started.'
            : 'Connect a Gmail account and download the inbox to get started.'
        }
        onAction={() => void connectAccount()}
        systemImage="envelope"
        title="We couldn't find any inboxes."
      />
    );
  } else {
    mainContent = (
      <ThreadList
        datasetKey={`${mailboxView.kind === 'all' ? 'all' : mailboxView.accountId}:${mailQuery}`}
        emptyMailboxName={mailboxName}
        searchQuery={mailQuery}
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
    <View className="flex-1 bg-transparent" style={{ paddingTop: toolbarInset }}>
      <NativeWindowToolbar
        ref={toolbarRef}
        style={toolbarStyle}
        identifier={toolbarIdentifier(toolbarInput)}
        items={toolbarItems}
        customizable
        autosavesConfiguration
        displayMode="iconOnly"
        toolbarStyle="unified"
        onContentInsetChange={({ nativeEvent }) => setToolbarInset(nativeEvent.top)}
        onItemPress={handleToolbarPress}
        onSearchChange={({ nativeEvent }) => {
          if (nativeEvent.id === 'mail-search') setMailQuery(nativeEvent.text);
          else setGatekeeperQuery(nativeEvent.text);
        }}
        onSegmentChange={handleSegmentChange}
        onMenuItemPress={handleMenuPress}
      />
      {mainContent}
    </View>
  );
}
