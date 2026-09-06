import { Button, Host, HStack, Image, Text as SwiftText, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, frame } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { accent, colors } from '../components/native-colors';
import { SenderAvatar } from './sender-avatar';
import type { GatekeeperMessage, GatekeeperSender } from './gatekeeper';

export function SenderReviewRow({
  sender,
  expanded,
  busy,
  onToggle,
  onApprove,
  onBlock,
  onUnblock,
  onOpen,
  onDelete,
}: {
  sender: GatekeeperSender;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onOpen: (message: GatekeeperMessage) => void;
  onDelete: (message: GatekeeperMessage) => void;
}) {
  const [hoveredTrash, setHoveredTrash] = useState<string>();
  const [hoveredMessage, setHoveredMessage] = useState<string>();
  const title = sender.displayName || sender.email;
  return (
    <View>
      <View className="flex-row flex-wrap items-center gap-[12px] py-[14px]">
        <SenderAvatar
          sender={sender.displayName ? `${sender.displayName} <${sender.email}>` : sender.email}
          imageUri={sender.avatarUrl}
        />
        <View className="flex-1 min-w-[200px]">
          <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
            <Button
              variant="plain"
              onPress={onToggle}
              modifiers={[
                accessibilityLabel(
                  `${expanded ? 'Hide' : 'Show'} ${sender.messages.length} ${sender.messages.length === 1 ? 'email' : 'emails'} from ${title}`,
                ),
              ]}
            >
              <HStack
                spacing={10}
                modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
              >
                <VStack
                  alignment="leading"
                  spacing={3}
                  modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
                >
                  <SwiftText size={13} weight="semibold" lineLimit={1}>
                    {title}
                  </SwiftText>
                  {sender.displayName ? (
                    <SwiftText size={11} color="secondary" lineLimit={1}>
                      {sender.email}
                    </SwiftText>
                  ) : null}
                </VStack>
                <SwiftText
                  size={11}
                  color="secondary"
                >{`${sender.messages.length} ${sender.messages.length === 1 ? 'email' : 'emails'}`}</SwiftText>
                <Image
                  systemName={expanded ? 'chevron.down' : 'chevron.right'}
                  size={10}
                  color="secondary"
                />
              </HStack>
            </Button>
          </Host>
        </View>
        <Host style={{ width: sender.status === 'blocked' ? 84 : 152, height: 30 }}>
          <HStack spacing={8}>
            {sender.status === 'blocked' ? (
              <Button variant="bordered" controlSize="small" disabled={busy} onPress={onUnblock}>
                Unblock
              </Button>
            ) : (
              <>
                <Button variant="bordered" controlSize="small" disabled={busy} onPress={onBlock}>
                  Block
                </Button>
                <Button
                  variant="borderedProminent"
                  color={accent}
                  controlSize="small"
                  disabled={busy}
                  onPress={onApprove}
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
            <Pressable
              key={message.id}
              accessible={false}
              focusable={false}
              onHoverIn={() => setHoveredMessage(message.id)}
              onHoverOut={() => setHoveredMessage(undefined)}
              className="flex-row items-center gap-[12px] px-[8px] py-[12px] rounded-[8px]"
              style={{
                backgroundColor:
                  hoveredMessage === message.id ? 'rgba(128,128,128,0.14)' : 'transparent',
              }}
            >
              <View className="flex-1 min-w-0">
                <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
                  <Button
                    variant="plain"
                    onPress={() => onOpen(message)}
                    modifiers={[
                      accessibilityLabel(`Open ${message.subject || 'email without a subject'}`),
                    ]}
                  >
                    <VStack
                      alignment="leading"
                      spacing={4}
                      modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
                    >
                      <SwiftText size={12} weight="medium" lineLimit={1}>
                        {message.subject || '(No subject)'}
                      </SwiftText>
                      {message.snippet ? (
                        <SwiftText size={11} color="secondary" lineLimit={1}>
                          {message.snippet}
                        </SwiftText>
                      ) : null}
                      <SwiftText
                        size={10}
                        color="secondary"
                        lineLimit={1}
                      >{`${new Date(message.sentAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${message.accountEmail}`}</SwiftText>
                    </VStack>
                  </Button>
                </Host>
              </View>
              <Pressable
                accessible={false}
                focusable={false}
                onHoverIn={() => setHoveredTrash(message.id)}
                onHoverOut={() => setHoveredTrash(undefined)}
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
                      color={hoveredTrash === message.id ? 'red' : 'secondary'}
                      modifiers={[frame({ width: 32, height: 30 })]}
                    />
                  </Button>
                </Host>
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
