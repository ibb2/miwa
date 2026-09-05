import { useEffect, useState } from 'react';
import { colors } from '../components/native-colors';
import { ScrollView, Text, View } from 'react-native';

import { SenderReviewCard } from './sender-review-card';
import type { GatekeeperOverview, GatekeeperSender } from './gatekeeper';
import { NativeActionButton, NativeSymbol } from '../components/native-controls';

type GatekeeperScreenProps = {
  actionEmail?: string;
  error?: string;
  loading: boolean;
  onApprove: (email: string) => void;
  onBlock: (email: string) => void;
  onRetry: () => void;
  onUnblock: (email: string) => void;
  overview?: GatekeeperOverview;
};

/** One blocked sender with an undo action. */
function BlockedSenderRow({
  actionEmail,
  onUnblock,
  sender,
}: {
  actionEmail?: string;
  onUnblock: (email: string) => void;
  sender: GatekeeperSender;
}) {
  const title = sender.displayName || sender.email;
  const busy = actionEmail === sender.email;

  return (
    <View className="min-h-[62px] flex-row items-center px-[14px] py-[9px] gap-[11px]">
      <NativeSymbol fallback={title.slice(0, 1).toUpperCase()} systemName="nosign" />
      <View className="flex-1 min-w-0 gap-[2px]">
        <Text
          numberOfLines={1}
          selectable
          className="text-[13px] font-semibold"
          style={{ color: colors.label }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          selectable
          className="text-[10px]"
          style={{ color: colors.secondaryLabel }}
        >
          {sender.email}
        </Text>
      </View>
      <Text selectable className="text-[9px] tabular-nums" style={{ color: colors.tertiaryLabel }}>
        {sender.messageCount.toLocaleString()}{' '}
        {sender.messageCount === 1 ? 'email hidden' : 'emails hidden'}
      </Text>
      <NativeActionButton
        disabled={busy}
        label={busy ? 'Restoring…' : 'Undo block'}
        onPress={() => onUnblock(sender.email)}
        variant="glass"
      />
    </View>
  );
}

export function GatekeeperScreen({
  actionEmail,
  error,
  loading,
  onApprove,
  onBlock,
  onRetry,
  onUnblock,
  overview,
}: GatekeeperScreenProps) {
  const [showBlocked, setShowBlocked] = useState(false);

  useEffect(() => {
    if (!overview?.blocked.length) setShowBlocked(false);
  }, [overview?.blocked.length]);

  return (
    <ScrollView
      contentContainerClassName="w-full max-w-[880px] self-center px-[34px] pt-[38px] pb-[64px] gap-[22px]"
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
    >
      <View className="flex-row items-start pb-[8px] gap-[14px]">
        <View className="pt-[3px]">
          <NativeSymbol fallback="G" systemName="checkmark.shield.fill" />
        </View>
        <View className="flex-1 min-w-0 gap-[4px]">
          <Text selectable className="text-accent text-[10px] font-extrabold tracking-[1.5px]">
            GATEKEEPER
          </Text>
          <Text
            selectable
            className="text-[30px] font-bold tracking-[-0.8px]"
            style={{ color: colors.label }}
          >
            New senders
          </Text>
          <Text
            selectable
            className="text-[12px] leading-[17px]"
            style={{ color: colors.secondaryLabel }}
          >
            Review each new email address once. Approve keeps its mail in your inbox; Block hides
            its conversations until you undo it.
          </Text>
        </View>
        {overview ? (
          <View
            accessibilityLabel={`${overview.pending.length} new senders`}
            className="min-w-[70px] items-end pt-[2px] gap-[1px]"
          >
            <Text
              selectable
              className="text-accent-dark text-[25px] font-bold tabular-nums tracking-[-0.6px]"
            >
              {overview.pending.length.toLocaleString()}
            </Text>
            <Text
              selectable
              className="text-[8px] font-bold tracking-[0.9px]"
              style={{ color: colors.tertiaryLabel }}
            >
              TO REVIEW
            </Text>
          </View>
        ) : null}
      </View>

      {loading && !overview ? (
        <Text
          selectable
          className="p-[20px] text-[12px] text-center"
          style={{ color: colors.secondaryLabel }}
        >
          Checking new senders…
        </Text>
      ) : null}

      {error ? (
        <View
          className="border-hairline rounded-[14px] border-continuous items-center p-[20px] gap-[7px]"
          style={{ borderColor: colors.separator, backgroundColor: colors.card }}
        >
          <Text selectable className="text-[14px] font-semibold" style={{ color: colors.label }}>
            Gatekeeper could not open.
          </Text>
          <Text selectable className="text-[10px] pb-[4px]" style={{ color: colors.red }}>
            {error}
          </Text>
          <NativeActionButton label="Try again" onPress={onRetry} variant="glassProminent" />
        </View>
      ) : null}

      {overview && !error ? (
        <>
          <View className="gap-[12px]">
            {overview.pending.map((sender) => (
              <SenderReviewCard
                key={sender.email}
                actionEmail={actionEmail}
                onApprove={onApprove}
                onBlock={onBlock}
                sender={sender}
              />
            ))}
            {!overview.pending.length ? (
              <View
                className="border-hairline rounded-[14px] border-continuous min-h-[86px] flex-row items-center px-[18px] gap-[12px]"
                style={{ borderColor: colors.separator, backgroundColor: colors.card }}
              >
                <NativeSymbol fallback="✓" systemName="checkmark.shield.fill" />
                <View className="flex-1 gap-[2px]">
                  <Text
                    selectable
                    className="text-[14px] font-semibold"
                    style={{ color: colors.label }}
                  >
                    You’re caught up.
                  </Text>
                  <Text selectable className="text-[11px]" style={{ color: colors.secondaryLabel }}>
                    New sender addresses will collect here as mail arrives.
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {overview.blocked.length ? (
            <View className="gap-[7px] pt-[2px]">
              <View className="min-h-[36px] flex-row items-center self-start px-[8px] gap-[7px] rounded-[8px] border-continuous">
                <NativeActionButton
                  accessibilityLabel={`${showBlocked ? 'Hide' : 'Show'} ${overview.blocked.length} blocked senders`}
                  label={`${showBlocked ? 'Hide' : 'Show'} ${overview.blocked.length.toLocaleString()} blocked senders`}
                  onPress={() => setShowBlocked((current) => !current)}
                  variant="plain"
                />
              </View>
              {showBlocked ? (
                <View
                  className="border-hairline rounded-[12px] border-continuous overflow-hidden"
                  style={{ borderColor: colors.separator, backgroundColor: colors.card }}
                >
                  {overview.blocked.map((sender, index) => (
                    <View key={sender.email}>
                      {index > 0 ? (
                        <View
                          className="h-hairline ml-[57px]"
                          style={{ backgroundColor: colors.separator }}
                        />
                      ) : null}
                      <BlockedSenderRow
                        actionEmail={actionEmail}
                        onUnblock={onUnblock}
                        sender={sender}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <Text
            selectable
            className="self-center text-[9px] pt-[5px]"
            style={{ color: colors.tertiaryLabel }}
          >
            Watching for new senders since {new Date(overview.activatedAt).toLocaleString()}.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}
