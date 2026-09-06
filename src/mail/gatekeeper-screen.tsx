import { useEffect, useRef, useState } from 'react';
import { Button, Host } from '@expo/ui/swift-ui';
import { ScrollView, Text, View } from 'react-native';
import { colors } from '../components/native-colors';
import { SenderReviewRow } from './sender-review-row';
import type { GatekeeperMessage, GatekeeperOverview } from './gatekeeper';
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
  const scrollOffset = useRef(0);
  const [expandedEmail, setExpandedEmail] = useState<string>();
  const [detail, setDetail] = useState<MailThreadDetail>();
  const [detailError, setDetailError] = useState<string>();

  useEffect(() => {
    setExpandedEmail(undefined);
    scrollOffset.current = 0;
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

  if (selected) {
    return <ThreadDetail detail={detail} error={detailError} loading={!detail && !detailError} />;
  }

  const allSenders = (tab === 0 ? overview?.pending : overview?.blocked) ?? [];
  const search = query.trim().toLowerCase();
  const senders = allSenders.filter(
    (sender) =>
      `${sender.displayName} ${sender.email}`.toLowerCase().includes(search) ||
      sender.messages.some((message) =>
        `${message.subject} ${message.snippet}`.toLowerCase().includes(search),
      ),
  );

  return (
    <ScrollView
      className="flex-1"
      contentOffset={{ x: 0, y: scrollOffset.current }}
      onScroll={({ nativeEvent }) => {
        scrollOffset.current = nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={100}
      contentContainerClassName="w-full max-w-[1040px] self-center px-[24px] pt-[12px] pb-[16px] gap-[16px]"
    >
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
      {overview ? (
        <View>
          {senders.map((sender) => (
            <SenderReviewRow
              key={sender.email}
              sender={sender}
              expanded={expandedEmail === sender.email}
              busy={!!actionEmail}
              onToggle={() =>
                setExpandedEmail(expandedEmail === sender.email ? undefined : sender.email)
              }
              onApprove={() => onApprove(sender.email)}
              onBlock={() => onBlock(sender.email)}
              onUnblock={() => onUnblock(sender.email)}
              onOpen={(message) => onSelect({ email: sender.email, message })}
              onDelete={(message) => {
                void onDelete(sender.email, message);
              }}
            />
          ))}
          {!senders.length ? (
            <Text className="py-6 text-[13px]" style={{ color: colors.secondaryLabel }}>
              {search
                ? 'No matching senders or emails.'
                : tab === 0
                  ? 'No new senders to review.'
                  : 'No blocked senders.'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
