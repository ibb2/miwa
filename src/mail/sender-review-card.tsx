import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../components/native-colors';
import { NativeActionButton, NativeSymbol } from '../components/native-controls';
import type { GatekeeperSender } from './gatekeeper';

function formatMessageDate(milliseconds: number): string {
  return new Date(milliseconds).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function SenderReviewCard({
  actionEmail,
  onApprove,
  onBlock,
  sender,
}: {
  actionEmail?: string;
  onApprove: (email: string) => void;
  onBlock: (email: string) => void;
  sender: GatekeeperSender;
}) {
  const [expanded, setExpanded] = useState(false);
  const messages = expanded ? sender.messages : sender.messages.slice(0, 1);
  const title = sender.displayName || sender.email;
  const busy = actionEmail === sender.email;

  return (
    <View
      className="border-hairline rounded-[14px] border-continuous overflow-hidden shadow-[0_6px_18px_rgba(0,_0,_0,_0.045)]"
      style={{ borderColor: colors.separator, backgroundColor: colors.card }}
    >
      <Pressable
        accessibilityHint="Shows or hides this sender's messages"
        accessibilityLabel={`${title}, ${sender.messageCount} ${
          sender.messageCount === 1 ? 'email' : 'emails'
        }`}
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        className="min-h-[64px] flex-row items-center px-[16px] py-[10px] gap-[11px] active:opacity-[0.58]"
      >
        <NativeSymbol fallback={title.slice(0, 1).toUpperCase()} systemName="person.crop.circle" />
        <View className="flex-1 min-w-0 gap-[2px]">
          <Text
            numberOfLines={1}
            selectable
            className="text-[13px] font-semibold"
            style={{ color: colors.label }}
          >
            {title}
          </Text>
          {sender.displayName ? (
            <Text
              numberOfLines={1}
              selectable
              className="text-[10px]"
              style={{ color: colors.secondaryLabel }}
            >
              {sender.email}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-[8px]">
          <Text
            selectable
            className="text-[10px] tabular-nums"
            style={{ color: colors.secondaryLabel }}
          >
            {sender.messageCount.toLocaleString()} {sender.messageCount === 1 ? 'email' : 'emails'}
          </Text>
          <Text
            accessibilityElementsHidden
            className="w-[14px] text-[12px] text-center"
            style={{ color: colors.tertiaryLabel }}
          >
            {expanded ? '⌃' : '⌄'}
          </Text>
        </View>
      </Pressable>

      {messages.length ? (
        <View className="border-t-hairline px-[16px]" style={{ borderTopColor: colors.separator }}>
          {messages.map((message, index) => (
            <View key={message.id}>
              {index > 0 ? (
                <View className="h-hairline" style={{ backgroundColor: colors.separator }} />
              ) : null}
              <View className="min-h-[62px] flex-row items-start py-[11px] gap-[18px]">
                <View className="flex-1 min-w-0 gap-[3px]">
                  <Text
                    numberOfLines={1}
                    selectable
                    className="text-[12px] font-semibold"
                    style={{ color: colors.label }}
                  >
                    {message.subject || '(No subject)'}
                  </Text>
                  {message.snippet ? (
                    <Text
                      numberOfLines={2}
                      selectable
                      className="text-[10px] leading-[14px]"
                      style={{ color: colors.secondaryLabel }}
                    >
                      {message.snippet}
                    </Text>
                  ) : null}
                </View>
                <Text
                  selectable
                  className="w-[132px] text-[9px] tabular-nums text-right"
                  style={{ color: colors.tertiaryLabel }}
                >
                  {formatMessageDate(message.sentAt)}
                </Text>
              </View>
            </View>
          ))}
          {!expanded && sender.messages.length > 1 ? (
            <View className="self-start pt-[2px] pb-[10px]">
              <NativeActionButton
                label={`Show all ${sender.messages.length.toLocaleString()} emails`}
                onPress={() => setExpanded(true)}
                variant="link"
              />
            </View>
          ) : null}
        </View>
      ) : (
        <Text
          selectable
          className="border-t-hairline px-[16px] py-[13px] text-[10px]"
          style={{ borderTopColor: colors.separator, color: colors.secondaryLabel }}
        >
          These emails are no longer available in the local mailbox.
        </Text>
      )}

      <View
        className="min-h-[52px] flex-row items-center justify-end border-t-hairline px-[14px] py-[9px] gap-[8px]"
        style={{ borderTopColor: colors.separator, backgroundColor: colors.underPage }}
      >
        <Text selectable className="flex-1 text-[9px]" style={{ color: colors.tertiaryLabel }}>
          Approve keeps these emails in the inbox. Block hides them.
        </Text>
        <NativeActionButton
          disabled={busy}
          label={busy ? 'Working…' : 'Block'}
          onPress={() => onBlock(sender.email)}
          role="destructive"
          variant="glass"
        />
        <NativeActionButton
          disabled={busy}
          label={busy ? 'Working…' : 'Approve'}
          onPress={() => onApprove(sender.email)}
          variant="glassProminent"
        />
      </View>
    </View>
  );
}
