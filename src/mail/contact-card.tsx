import { useState } from 'react';
import { Alert, Clipboard, Image as Bitmap, Linking, View } from 'react-native';
import { Button, Host, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { gmailAccountAuth } from './accounts';
import type { MailAddress } from './types';

export type ContactCardAddress = MailAddress & { avatarUrl?: string };

export function ContactCard({
  contact,
  accountId,
  onClose,
  onBlock,
}: {
  contact: ContactCardAddress;
  accountId?: string;
  onClose: () => void;
  onBlock?: (email: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const name = contact.name || contact.address || contact.rawValue;
  const email = contact.address;
  const open = (url: string) =>
    void Linking.openURL(url).catch(() => Alert.alert('Could not open this action'));
  const search = async () => {
    try {
      const account = (await gmailAccountAuth.listAccounts()).find((item) => item.id === accountId);
      if (!account) throw new Error('The email account is no longer connected.');
      open(
        `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account.email)}#search/${encodeURIComponent(`from:${email}`)}`,
      );
    } catch (error) {
      Alert.alert(
        'Could not open Gmail search',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };
  return (
    <View
      style={{
        width: 300,
        borderRadius: 13,
        backgroundColor: '#FFFCFA',
        borderWidth: 1,
        borderColor: '#DED8D4',
        shadowColor: '#30231E',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
      }}
    >
      <View
        style={{
          padding: 14,
          paddingTop: 15,
          paddingBottom: 15,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        {contact.avatarUrl ? (
          <Bitmap
            source={{ uri: contact.avatarUrl }}
            resizeMode="contain"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#F1EEEB',
            }}
          />
        ) : (
          <Host style={{ width: 36, height: 36 }}>
            <Image systemName="person.crop.circle.fill" size={34} color="#C7B3A9" />
          </Host>
        )}
        <Host colorScheme="light" matchContents={{ vertical: true }} style={{ flex: 1 }}>
          <VStack
            alignment="leading"
            spacing={5}
            modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
          >
            <Text size={14} weight="semibold">
              {name}
            </Text>
            {email ? (
              <HStack spacing={5}>
                <Button variant="plain" onPress={() => open(`mailto:${encodeURIComponent(email)}`)}>
                  <Text size={11} color="#1677D2">
                    {email}
                  </Text>
                </Button>
                <Button
                  variant="plain"
                  onPress={() => {
                    Clipboard.setString(email);
                    setCopied(true);
                  }}
                  modifiers={[accessibilityLabel(copied ? 'Address copied' : 'Copy email address')]}
                >
                  <Image
                    systemName={copied ? 'checkmark' : 'square.on.square'}
                    size={10}
                    color="#1677D2"
                  />
                </Button>
              </HStack>
            ) : (
              <Text size={11} color="secondary">
                {contact.rawValue}
              </Text>
            )}
          </VStack>
        </Host>
      </View>
      <View style={{ height: 1, backgroundColor: '#E7E2DE' }} />
      <Host colorScheme="light" matchContents={{ vertical: true }} style={{ width: 298 }}>
        <VStack
          alignment="leading"
          spacing={2}
          modifiers={[
            padding({ horizontal: 8, vertical: 7 }),
            frame({ maxWidth: Infinity, alignment: 'leading' }),
          ]}
        >
          {email ? (
            <>
              <Button variant="plain" onPress={() => open(`mailto:${encodeURIComponent(email)}`)}>
                <HStack
                  spacing={10}
                  modifiers={[
                    padding({ horizontal: 7, vertical: 7 }),
                    frame({ maxWidth: Infinity, alignment: 'leading' }),
                  ]}
                >
                  <Image systemName="square.and.pencil" size={14} color="#72777F" />
                  <Text size={12} color="#626871">
                    Compose an Email
                  </Text>
                  <Spacer />
                </HStack>
              </Button>
              <Button variant="plain" onPress={() => void search()}>
                <HStack
                  spacing={10}
                  modifiers={[
                    padding({ horizontal: 7, vertical: 7 }),
                    frame({ maxWidth: Infinity, alignment: 'leading' }),
                  ]}
                >
                  <Image systemName="magnifyingglass" size={14} color="#72777F" />
                  <VStack alignment="leading" spacing={3}>
                    <Text size={12} color="#626871">
                      Search Emails from
                    </Text>
                    <Text size={10} color="#7B8087">
                      {email}
                    </Text>
                  </VStack>
                  <Spacer />
                </HStack>
              </Button>
              {onBlock &&
              (contact.kind === 'from' ||
                contact.kind === 'sender' ||
                contact.kind === 'replyTo') ? (
                <Button
                  variant="plain"
                  onPress={() => {
                    onBlock(email);
                    onClose();
                  }}
                >
                  <HStack
                    spacing={10}
                    modifiers={[
                      padding({ horizontal: 7, vertical: 7 }),
                      frame({ maxWidth: Infinity, alignment: 'leading' }),
                    ]}
                  >
                    <Image systemName="hand.thumbsdown" size={14} color="#DD5148" />
                    <Text size={12} color="#DD5148">
                      Block Sender
                    </Text>
                    <Spacer />
                  </HStack>
                </Button>
              ) : null}
            </>
          ) : null}
        </VStack>
      </Host>
    </View>
  );
}
