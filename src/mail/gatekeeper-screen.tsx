import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Host } from '@expo/ui/swift-ui';
import { Text, View } from 'react-native';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { colors } from '../components/native-colors';
import { SenderReviewRow } from './sender-review-row';
import type { GatekeeperMessage, GatekeeperOverview, GatekeeperSender } from './gatekeeper';
import { loadThreadDetail } from './thread-store';
import { ThreadDetail } from './thread-detail';
import type { MailThreadDetail } from './types';
import { messageFor } from './async';

type GatekeeperScreenProps = {
  tab: number;
  query: string;
  actionEmail?: string;
  error?: string;
  loading: boolean;
  onApprove: (email: string) => void;
  onBlock: (email: string) => void;
  onRetry: () => void;
  onUnblock: (email: string) => void;
  onDelete: (email: string, message: GatekeeperMessage) => Promise<boolean>;
  selected?: { email: string; message: GatekeeperMessage };
  onSelect: (selected: { email: string; message: GatekeeperMessage }) => void;
  overview?: GatekeeperOverview;
};

const EMPTY_SENDERS: GatekeeperSender[] = [];

function senderKeyExtractor(sender: GatekeeperSender) {
  return sender.email;
}

function sendersAreEqual(previous: GatekeeperSender, next: GatekeeperSender) {
  if (
    previous.email !== next.email ||
    previous.displayName !== next.displayName ||
    previous.avatarUrl !== next.avatarUrl ||
    previous.status !== next.status ||
    previous.messageCount !== next.messageCount ||
    previous.firstSeenAt !== next.firstSeenAt ||
    previous.lastSeenAt !== next.lastSeenAt ||
    previous.messages.length !== next.messages.length
  ) {
    return false;
  }
  return previous.messages.every((message, index) => {
    const other = next.messages[index];
    return (
      message.id === other.id &&
      message.subject === other.subject &&
      message.snippet === other.snippet &&
      message.sentAt === other.sentAt &&
      message.accountEmail === other.accountEmail
    );
  });
}

export function GatekeeperScreen({
  tab,
  query,
  actionEmail,
  error,
  loading,
  onApprove,
  onBlock,
  onRetry,
  onUnblock,
  onDelete,
  overview,
  selected,
  onSelect,
}: GatekeeperScreenProps) {
  const [expandedEmail, setExpandedEmail] = useState<string>();
  const [detail, setDetail] = useState<MailThreadDetail>();
  const [detailError, setDetailError] = useState<string>();

  useEffect(() => {
    setExpandedEmail(undefined);
  }, [tab]);

  useEffect(() => {
    setDetail(undefined);
    setDetailError(undefined);
    if (!selected) return;
    let active = true;
    const { message } = selected;
    loadThreadDetail(message.accountId, message.threadId)
      .then((thread) => {
        if (!active) return;
        const messages = thread.messages.filter((item) => item.id === message.id);
        if (!messages.length) throw new Error('This email is no longer available locally.');
        setDetail({ ...thread, subject: message.subject, messages });
      })
      .catch((error) => {
        if (active) setDetailError(messageFor(error));
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const handleToggle = useCallback((email: string) => {
    setExpandedEmail((current) => (current === email ? undefined : email));
  }, []);
  const handleApprove = useCallback(
    (email: string) => {
      onApprove(email);
    },
    [onApprove],
  );
  const handleBlock = useCallback(
    (email: string) => {
      onBlock(email);
    },
    [onBlock],
  );
  const handleUnblock = useCallback(
    (email: string) => {
      onUnblock(email);
    },
    [onUnblock],
  );
  const handleOpen = useCallback(
    (email: string, message: GatekeeperMessage) => {
      onSelect({ email, message });
    },
    [onSelect],
  );
  const handleDelete = useCallback(
    (email: string, message: GatekeeperMessage) => {
      void onDelete(email, message);
    },
    [onDelete],
  );

  const allSenders = (tab === 0 ? overview?.pending : overview?.blocked) ?? EMPTY_SENDERS;
  const search = query.trim().toLowerCase();
  const senders = useMemo(() => {
    if (!search) return allSenders;
    return allSenders.filter(
      (sender) =>
        `${sender.displayName} ${sender.email}`.toLowerCase().includes(search) ||
        sender.messages.some((message) =>
          `${message.subject} ${message.snippet}`.toLowerCase().includes(search),
        ),
    );
  }, [allSenders, search]);

  const busy = !!actionEmail;
  const extraData = `${expandedEmail ?? ''}:${busy ? '1' : '0'}`;

  const renderSender = useCallback(
    ({ item }: LegendListRenderItemProps<GatekeeperSender>) => (
      <SenderReviewRow
        sender={item}
        expanded={item.email === expandedEmail}
        busy={busy}
        onToggle={handleToggle}
        onApprove={handleApprove}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
        onOpen={handleOpen}
        onDelete={handleDelete}
      />
    ),
    [
      busy,
      expandedEmail,
      handleApprove,
      handleBlock,
      handleDelete,
      handleOpen,
      handleToggle,
      handleUnblock,
    ],
  );

  const listHeader = useMemo(
    () => (
      <>
        {error ? (
          <View className="gap-2">
            <Text style={{ color: colors.red }}>{error}</Text>
            <Host style={{ width: 90, height: 30 }}>
              <Button onPress={onRetry}>Try again</Button>
            </Host>
          </View>
        ) : null}
        {loading && !overview ? (
          <Text style={{ color: colors.secondaryLabel }}>Loading senders…</Text>
        ) : null}
      </>
    ),
    [error, loading, onRetry, overview],
  );

  const listEmpty = useMemo(
    () =>
      overview ? (
        <Text className="py-6 text-[13px]" style={{ color: colors.secondaryLabel }}>
          {search
            ? 'No matching senders or emails.'
            : tab === 0
              ? 'No new senders to review.'
              : 'No blocked senders.'}
        </Text>
      ) : null,
    [overview, search, tab],
  );

  if (selected) {
    return (
      <ThreadDetail
        onBlock={onBlock}
        detail={detail}
        error={detailError}
        loading={!detail && !detailError}
      />
    );
  }

  return (
    <View className="flex-1">
      <LegendList
        ListEmptyComponent={listEmpty}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1040,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 16,
          gap: 16,
        }}
        data={senders}
        dataKey={`${tab}:${search ? 'q' : ''}`}
        estimatedItemSize={96}
        extraData={extraData}
        itemsAreEqual={sendersAreEqual}
        keyExtractor={senderKeyExtractor}
        recycleItems
        renderItem={renderSender}
        style={{ flex: 1 }}
      />
    </View>
  );
}
