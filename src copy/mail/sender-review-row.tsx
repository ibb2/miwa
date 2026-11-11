import { Button, Host, HStack, Image } from '@expo/ui/swift-ui';
import { accessibilityLabel, frame } from '@expo/ui/swift-ui/modifiers';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, useAccent } from '../components/native-colors';
import { SenderAvatar } from './sender-avatar';
import type { GatekeeperMessage, GatekeeperSender } from './gatekeeper';

type SenderReviewRowProps = {
  sender: GatekeeperSender;
  expanded: boolean;
  busy: boolean;
  onToggle: (email: string) => void;
  onApprove: (email: string) => void;
  onBlock: (email: string) => void;
  onUnblock: (email: string) => void;
  onOpen: (email: string, message: GatekeeperMessage) => void;
  onDelete: (email: string, message: GatekeeperMessage) => void;
};

const MessageRow = memo(function MessageRow({
  message,
  busy,
  onOpen,
  onDelete,
}: {
  message: GatekeeperMessage;
  busy: boolean;
  onOpen: (message: GatekeeperMessage) => void;
  onDelete: (message: GatekeeperMessage) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [trashHovered, setTrashHovered] = useState(false);
  const meta = useMemo(
    () =>
      `${new Date(message.sentAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${message.accountEmail}`,
    [message.sentAt, message.accountEmail],
  );
  return (
    <Pressable
      accessibilityLabel={`Open ${message.subject || 'email without a subject'}`}
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => onOpen(message)}
      className="flex-row items-center gap-[12px] px-[8px] py-[12px] rounded-[12px] active:bg-[rgba(128,128,128,0.18)]"
      style={{ backgroundColor: hovered ? 'rgba(128,128,128,0.10)' : 'transparent' }}
    >
      <View className="flex-1 min-w-0 gap-[4px]">
        <Text numberOfLines={1} style={{ color: colors.label, fontSize: 12, fontWeight: '500' }}>
          {message.subject || '(No subject)'}
        </Text>
        {message.snippet ? (
          <Text numberOfLines={1} style={{ color: colors.secondaryLabel, fontSize: 11 }}>
            {message.snippet}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={{ color: colors.secondaryLabel, fontSize: 10 }}>
          {meta}
        </Text>
      </View>
      <Pressable
        accessible={false}
        focusable={false}
        onHoverIn={() => setTrashHovered(true)}
        onHoverOut={() => setTrashHovered(false)}
      >
        <Host style={{ width: 32, height: 30 }}>
          <Button
            variant="borderless"
            controlSize="small"
            role="destructive"
            disabled={busy}
            onPress={() => onDelete(message)}
            modifiers={[accessibilityLabel(`Move ${message.subject || 'email'} to Trash`)]}
          >
            <Image
              systemName="trash"
              size={14}
              color={trashHovered ? 'red' : 'secondary'}
              modifiers={[frame({ width: 32, height: 30 })]}
            />
          </Button>
        </Host>
      </Pressable>
    </Pressable>
  );
});

export const SenderReviewRow = memo(function SenderReviewRow({
  sender,
  expanded,
  busy,
  onToggle,
  onApprove,
  onBlock,
  onUnblock,
  onOpen,
  onDelete,
}: SenderReviewRowProps) {
  const title = sender.displayName || sender.email;
  const tint = useAccent();
  const handleOpenMessage = useCallback(
    (message: GatekeeperMessage) => {
      onOpen(sender.email, message);
    },
    [sender.email, onOpen],
  );
  const handleDeleteMessage = useCallback(
    (message: GatekeeperMessage) => {
      onDelete(sender.email, message);
    },
    [sender.email, onDelete],
  );
  return (
    <View>
      <View className="flex-row flex-wrap items-center gap-[12px] py-[14px]">
        <SenderAvatar
          sender={sender.displayName ? `${sender.displayName} <${sender.email}>` : sender.email}
          imageUri={sender.avatarUrl}
        />
        <Pressable
          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${sender.messages.length} ${sender.messages.length === 1 ? 'email' : 'emails'} from ${title}`}
          accessibilityRole="button"
          onPress={() => onToggle(sender.email)}
          className="flex-1 min-w-[200px]"
        >
          <View className="flex-row items-center gap-[10px]">
            <View className="flex-1 min-w-0 gap-[3px]">
              <Text
                numberOfLines={1}
                style={{ color: colors.label, fontSize: 13, fontWeight: '600' }}
              >
                {title}
              </Text>
              {sender.displayName ? (
                <Text numberOfLines={1} style={{ color: colors.secondaryLabel, fontSize: 11 }}>
                  {sender.email}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: colors.secondaryLabel, fontSize: 11 }}>
              {`${sender.messages.length} ${sender.messages.length === 1 ? 'email' : 'emails'}`}
            </Text>
            <Text
              style={{ color: colors.secondaryLabel, fontSize: 12, width: 12, textAlign: 'center' }}
            >
              {expanded ? '⌄' : '›'}
            </Text>
          </View>
        </Pressable>
        <Host style={{ width: sender.status === 'blocked' ? 84 : 152, height: 30 }}>
          <HStack spacing={8}>
            {sender.status === 'blocked' ? (
              <Button
                variant="bordered"
                controlSize="small"
                disabled={busy}
                onPress={() => onUnblock(sender.email)}
              >
                Unblock
              </Button>
            ) : (
              <>
                <Button
                  variant="bordered"
                  controlSize="small"
                  disabled={busy}
                  onPress={() => onBlock(sender.email)}
                >
                  Block
                </Button>
                <Button
                  variant="borderedProminent"
                  color={tint}
                  controlSize="small"
                  disabled={busy}
                  onPress={() => onApprove(sender.email)}
                >
                  Allow
                </Button>
              </>
            )}
          </HStack>
        </Host>
      </View>
      {expanded ? (
        <View className="ml-[44px] pb-[12px]">
          {sender.messages.length === 0 ? (
            <Text className="text-[12px] py-[12px]" style={{ color: colors.secondaryLabel }}>
              No emails stored locally.
            </Text>
          ) : null}
          {sender.messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              busy={busy}
              onOpen={handleOpenMessage}
              onDelete={handleDeleteMessage}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});
