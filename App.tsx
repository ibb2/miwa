import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import {
  Alert,
  Image,
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
import { gmailAccountAuth } from './src/mail/account-auth';
import {
  fetchInboxPage,
  fetchThreadDetail,
  GmailApiError,
} from './src/mail/gmail';
import { mergeAccountThreads, mergeThreadSummaries } from './src/mail/gmail-utils';
import type {
  AccountInboxPage,
  AccountLoadError,
  ConnectedAccount,
  MailboxView,
  MailThreadDetail,
  MailThreadSummary,
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

function formatDate(milliseconds: number): string {
  const date = new Date(milliseconds);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

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

function AccountAvatar({ account, size = 24 }: { account: ConnectedAccount; size?: number }) {
  return account.avatarUrl ? (
    <Image
      accessibilityLabel={`${account.displayName} account`}
      source={{ uri: account.avatarUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarInitials, { fontSize: Math.max(8, size * 0.38) }]}>
        {initials(account)}
      </Text>
    </View>
  );
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
      accessibilityRole="button"
      onPress={() => onPress(thread)}
      style={({ pressed }) => [styles.threadRow, pressed && styles.pressed]}
    >
      <View style={styles.threadTopLine}>
        {showAccount && account ? <AccountAvatar account={account} size={19} /> : null}
        <Text numberOfLines={1} style={[styles.threadSender, thread.unread && styles.unreadText]}>{thread.sender}</Text>
        <Text style={styles.threadDate}>{formatDate(thread.receivedAt)}</Text>
      </View>
      <View style={styles.subjectLine}>
        <Text numberOfLines={1} style={[styles.threadSubject, thread.unread && styles.unreadText]}>{thread.subject}</Text>
        {thread.messageCount > 1 ? <Text style={styles.messageCount}>{thread.messageCount}</Text> : null}
      </View>
      <Text numberOfLines={2} style={styles.threadSnippet}>{thread.snippet}</Text>
    </Pressable>
  );
});

type InboxLoadMode = 'append' | 'refresh' | 'replace';

export default function App() {
  const toolbarRef = useRef<NativeWindowToolbarRef>(null);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [mailboxView, setMailboxView] = useState<MailboxView>({ kind: 'all' });
  const [pages, setPages] = useState<Record<string, AccountInboxPage>>({});
  const [errors, setErrors] = useState<Record<string, AccountLoadError>>({});
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [connectError, setConnectError] = useState<string>();
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [selectedThread, setSelectedThread] = useState<MailThreadSummary>();
  const [threadDetail, setThreadDetail] = useState<MailThreadDetail>();
  const [detailError, setDetailError] = useState<string>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRequest, setDetailRequest] = useState(0);
  const [avatarData, setAvatarData] = useState<Record<string, string>>({});
  const pagesRef = useRef<Record<string, AccountInboxPage>>({});
  const loadingIdsRef = useRef<Set<string>>(new Set());
  const skipNextStartRefreshForAccountIdsRef = useRef<Set<string>>(new Set());
  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const loadPage = useCallback(async (accountId: string, mode: InboxLoadMode = 'replace') => {
    if (loadingIdsRef.current.has(accountId)) return;
    const currentPage = pagesRef.current[accountId];
    if (mode === 'append' && !currentPage?.nextPageToken) return;

    if (mode === 'replace') skipNextStartRefreshForAccountIdsRef.current.add(accountId);
    loadingIdsRef.current.add(accountId);
    setLoadingIds((current) => new Set(current).add(accountId));
    setErrors((current) => {
      const next = { ...current };
      delete next[accountId];
      return next;
    });
    try {
      const page = await fetchInboxPage(accountId, mode === 'append' ? currentPage?.nextPageToken : undefined);
      const previous = pagesRef.current[accountId];
      const nextPage = mode === 'append' && previous
        ? { ...page, threads: mergeThreadSummaries(previous.threads, page.threads) }
        : mode === 'refresh' && previous
          ? {
              ...page,
              threads: mergeThreadSummaries(previous.threads, page.threads),
              // Keep the cursor after the oldest loaded page so refreshing does not discard history.
              nextPageToken: previous.nextPageToken,
            }
          : page;
      const nextPages = { ...pagesRef.current, [accountId]: nextPage };
      pagesRef.current = nextPages;
      setPages(nextPages);
    } catch (error) {
      const message = messageFor(error);
      const requiresReauthentication =
        error instanceof GmailApiError && error.requiresReauthentication;
      setErrors((current) => ({
        ...current,
        [accountId]: {
          accountId,
          message,
          requiresReauthentication,
        },
      }));
    } finally {
      loadingIdsRef.current.delete(accountId);
      setLoadingIds((current) => {
        const next = new Set(current);
        next.delete(accountId);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    gmailAccountAuth
      .listAccounts()
      .then((connected) => {
        if (!active) return;
        setAccounts(connected);
        return Promise.allSettled(connected.map((account) => loadPage(account.id)));
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
      return;
    }
    const controller = new AbortController();
    let active = true;
    setThreadDetail(undefined);
    setDetailLoading(true);
    setDetailError(undefined);
    fetchThreadDetail(selectedThread.accountId, selectedThread.threadId, controller.signal)
      .then((detail) => {
        if (active) setThreadDetail(detail);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (active) setDetailError(messageFor(error));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedThread?.accountId, selectedThread?.threadId, detailRequest]);

  const visibleThreads = useMemo(() => {
    if (mailboxView.kind === 'account') return pages[mailboxView.accountId]?.threads ?? [];
    return mergeAccountThreads(Object.values(pages));
  }, [mailboxView, pages]);

  const visibleAccountIds = useMemo(
    () => mailboxView.kind === 'account' ? [mailboxView.accountId] : accounts.map((account) => account.id),
    [accounts, mailboxView]
  );
  const isLoadingMail = visibleAccountIds.some((id) => loadingIds.has(id));
  const visibleErrors = visibleAccountIds.flatMap((id) => errors[id] ? [errors[id]] : []);

  const connectAccount = useCallback(async () => {
    setConnectError(undefined);
    try {
      const account = await gmailAccountAuth.connectAccount();
      setAccounts((current) => {
        const next = current.filter((item) => item.id !== account.id);
        return [...next, account].sort((a, b) => a.order - b.order);
      });
      setSelectedThread(undefined);
      setMailboxView({ kind: 'account', accountId: account.id });
      await loadPage(account.id);
    } catch (error) {
      const message = messageFor(error);
      setConnectError(message);
      Alert.alert('Could not connect Gmail', message);
    }
  }, [loadPage]);

  const reauthorize = useCallback(async (accountId: string) => {
    try {
      const account = await gmailAccountAuth.reauthorizeAccount(accountId);
      setAccounts((current) => current.map((item) => item.id === account.id ? account : item));
      await loadPage(accountId);
    } catch (error) {
      Alert.alert('Could not reconnect Gmail', messageFor(error));
    }
  }, [loadPage]);

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
              setPages((current) => {
                const next = { ...current };
                delete next[account.id];
                pagesRef.current = next;
                return next;
              });
              skipNextStartRefreshForAccountIdsRef.current.delete(account.id);
              setMailboxView({ kind: 'all' });
              if (selectedThread?.accountId === account.id) setSelectedThread(undefined);
            }).catch((error) => Alert.alert('Could not disconnect Gmail', messageFor(error)));
          },
        },
      ]
    );
  }, [selectedThread]);

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

  const toolbarItems = useMemo<NativeToolbarItem[]>(() => [
    { id: 'refresh', kind: 'button', label: 'Refresh', systemImage: 'arrow.clockwise', toolTip: 'Refresh inbox', navigational: true },
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
    { id: 'connect-account', kind: 'button', label: 'Connect Gmail', systemImage: 'plus', toolTip: 'Connect another Gmail account', immovable: true },
    {
      id: 'more',
      kind: 'menu',
      label: 'More',
      systemImage: 'ellipsis.circle',
      options: [
        ...accounts.map((account) => ({ id: `disconnect:${account.id}`, label: `Disconnect ${account.email}` })),
        { id: 'customize', label: 'Customize Toolbar…' },
        { id: 'reset', label: 'Reset Toolbar' },
      ],
    },
  ], [accountSegments, accounts, selectedAccountIndex]);

  const inboxTitle = mailboxView.kind === 'all'
    ? 'All Inboxes'
    : accountsById.get(mailboxView.accountId)?.email ?? 'Inbox';
  const handleEndReached = useCallback(() => {
    visibleAccountIds.forEach((accountId) => void loadPage(accountId, 'append'));
  }, [loadPage, visibleAccountIds]);
  const handleStartReached = useCallback(() => {
    const accountIdsToRefresh = visibleAccountIds.filter((accountId) => {
      if (skipNextStartRefreshForAccountIdsRef.current.delete(accountId)) return false;
      return Boolean(pagesRef.current[accountId]);
    });
    accountIdsToRefresh.forEach((accountId) => void loadPage(accountId, 'refresh'));
  }, [loadPage, visibleAccountIds]);
  const renderThread = useCallback(({ item }: LegendListRenderItemProps<MailThreadSummary>) => (
    <InboxThreadRow
      account={accountsById.get(item.accountId)}
      showAccount={mailboxView.kind === 'all'}
      thread={item}
      onPress={setSelectedThread}
    />
  ), [accountsById, mailboxView.kind]);
  const inboxHeader = useMemo(() => (
    <>
      {loadingAccounts ? <Text style={styles.stateText}>Loading accounts…</Text> : null}
      {visibleErrors.map((error) => (
        <View key={error.accountId} style={styles.errorCard}>
          <Text style={styles.errorTitle}>{accountsById.get(error.accountId)?.email ?? 'Gmail'}</Text>
          <Text style={styles.errorCopy}>{error.message}</Text>
          <Pressable onPress={() => void (error.requiresReauthentication ? reauthorize(error.accountId) : loadPage(error.accountId, 'refresh'))}>
            <Text style={styles.linkText}>{error.requiresReauthentication ? 'Reconnect' : 'Retry'}</Text>
          </Pressable>
        </View>
      ))}
    </>
  ), [accountsById, loadPage, loadingAccounts, reauthorize, visibleErrors]);
  const inboxEmpty = useMemo(() => {
    if (loadingAccounts || isLoadingMail) return null;
    if (!accounts.length) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Bring your inboxes together.</Text>
          <Text style={styles.emptyCopy}>Connect a Gmail account to read conversations in Miwa.</Text>
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
    return <Text style={styles.stateText}>No conversations in this inbox.</Text>;
  }, [accounts.length, connectAccount, connectError, isLoadingMail, loadingAccounts]);
  const inboxFooter = isLoadingMail ? <Text style={styles.stateText}>Loading mail…</Text> : null;

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
          if (nativeEvent.id === 'refresh') {
            visibleAccountIds.forEach((id) => void loadPage(id, 'refresh'));
          }
        }}
        onSegmentChange={({ nativeEvent }) => {
          setSelectedThread(undefined);
          setMailboxView(nativeEvent.segmentId === 'all'
            ? { kind: 'all' }
            : { kind: 'account', accountId: nativeEvent.segmentId.replace('account:', '') });
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
        {selectedThread ? (
          <>
            <View style={styles.contentHeader}>
              <Pressable
                accessibilityLabel={`Back to ${inboxTitle}`}
                accessibilityRole="button"
                onPress={() => setSelectedThread(undefined)}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <Text style={styles.backButtonText}>‹</Text>
                <Text style={styles.backButtonLabel}>{inboxTitle}</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent} style={styles.scrollView}>
              {detailLoading ? <Text style={styles.stateText}>Loading conversation…</Text> : null}
              {detailError ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorCopy}>{detailError}</Text>
                  <Pressable onPress={() => setDetailRequest((request) => request + 1)}>
                    <Text style={styles.linkText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              {threadDetail ? (
                <>
                  <Text style={styles.detailSubject}>{threadDetail.subject}</Text>
                  {threadDetail.messages.map((message) => (
                    <View key={message.id} style={styles.messageCard}>
                      <View style={styles.messageHeader}>
                        <Text style={styles.messageSender}>{message.sender}</Text>
                        <Text style={styles.messageDate}>{new Date(message.sentAt).toLocaleString()}</Text>
                      </View>
                      {message.recipients ? <Text style={styles.recipients}>To: {message.recipients}</Text> : null}
                      <NativeMailViewer
                        html={message.safeHtml}
                        plainText={message.plainText || 'This message has no readable body.'}
                        style={styles.mailViewer}
                      />
                      {message.attachments.length ? (
                        <View style={styles.attachmentList}>
                          {message.attachments.map((attachment, index) => (
                            <Text key={`${attachment.filename}:${index}`} style={styles.attachmentText}>
                              📎 {attachment.filename}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </>
        ) : (
          <>
            <LegendList
              contentContainerStyle={styles.listContent}
              contentInsetAdjustmentBehavior="automatic"
              data={visibleThreads}
              estimatedItemSize={80}
              keyExtractor={(thread) => `${thread.accountId}:${thread.threadId}`}
              ListEmptyComponent={inboxEmpty}
              ListFooterComponent={inboxFooter}
              ListHeaderComponent={inboxHeader}
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.5}
              onStartReached={handleStartReached}
              onStartReachedThreshold={0.25}
              renderItem={renderThread}
              style={styles.scrollView}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: PlatformColor('windowBackgroundColor') },
  nativeToolbarBridge: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  mainPane: { flex: 1, minWidth: 420, backgroundColor: PlatformColor('windowBackgroundColor') },
  contentHeader: { height: 52, justifyContent: 'center', paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PlatformColor('separatorColor') },
  backButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 4, gap: 5 },
  backButtonText: { color: PlatformColor('linkColor'), fontSize: 26, lineHeight: 20 },
  backButtonLabel: { color: PlatformColor('linkColor'), fontSize: 13, fontWeight: '500' },
  scrollView: { flex: 1 },
  listContent: { padding: 10, gap: 7, minHeight: '100%' },
  threadRow: { padding: 11, borderRadius: 9, gap: 4 },
  pressed: { backgroundColor: PlatformColor('quaternaryLabelColor') },
  threadTopLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  threadSender: { flex: 1, color: PlatformColor('labelColor'), fontSize: 13 },
  threadDate: { color: PlatformColor('secondaryLabelColor'), fontSize: 11 },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  threadSubject: { flex: 1, color: PlatformColor('labelColor'), fontSize: 12 },
  unreadText: { fontWeight: '700' },
  messageCount: { color: PlatformColor('secondaryLabelColor'), fontSize: 10 },
  threadSnippet: { color: PlatformColor('secondaryLabelColor'), fontSize: 11, lineHeight: 15 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: PlatformColor('controlAccentColor') },
  avatarInitials: { color: '#fff', fontWeight: '700' },
  emptyState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 9 },
  emptyTitle: { color: PlatformColor('labelColor'), fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { maxWidth: 320, color: PlatformColor('secondaryLabelColor'), fontSize: 13, lineHeight: 18, textAlign: 'center' },
  connectButton: { width: 150, height: 32, marginTop: 8, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: PlatformColor('controlAccentColor') },
  connectButtonPressed: { opacity: 0.72 },
  connectButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  connectError: { maxWidth: 460, marginTop: 6, color: PlatformColor('systemRedColor'), fontSize: 11, lineHeight: 15, textAlign: 'center' },
  stateText: { padding: 16, color: PlatformColor('secondaryLabelColor'), fontSize: 12, textAlign: 'center' },
  errorCard: { padding: 11, borderRadius: 8, backgroundColor: PlatformColor('controlBackgroundColor'), gap: 4 },
  errorTitle: { color: PlatformColor('labelColor'), fontSize: 12, fontWeight: '600' },
  errorCopy: { color: PlatformColor('systemRedColor'), fontSize: 11, lineHeight: 15 },
  linkText: { color: PlatformColor('linkColor'), fontSize: 12, fontWeight: '600' },
  detailContent: { padding: 24, gap: 14 },
  detailSubject: { color: PlatformColor('labelColor'), fontSize: 24, fontWeight: '700', marginBottom: 4 },
  messageCard: { padding: 16, borderRadius: 12, backgroundColor: PlatformColor('controlBackgroundColor'), gap: 7 },
  messageHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  messageSender: { flex: 1, color: PlatformColor('labelColor'), fontSize: 13, fontWeight: '600' },
  messageDate: { color: PlatformColor('secondaryLabelColor'), fontSize: 10 },
  recipients: { color: PlatformColor('secondaryLabelColor'), fontSize: 10 },
  mailViewer: { width: '100%', height: 260, marginTop: 8 },
  attachmentList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PlatformColor('separatorColor'), paddingTop: 8, gap: 4 },
  attachmentText: { color: PlatformColor('secondaryLabelColor'), fontSize: 11 },
});
