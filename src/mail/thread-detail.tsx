import { useEffect, useRef, useState } from 'react';
import { Image as Bitmap, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Host, HStack, Image, Spacer, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  background,
  cornerRadius,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';

import { colors } from '../components/native-colors';
import { NativeMailViewer } from '../../modules/native-mail-viewer/src';
import { AttachmentRow } from './attachment-row';
import { ContactCard, type ContactCardAddress } from './contact-card';
import { loadMessageImages } from './message-images';
import type { MailAddress, MailThreadDetail } from './types';

type ThreadDetailProps = {
  detail?: MailThreadDetail;
  loading: boolean;
  error?: string;
  onBlock?: (email: string) => void;
};
const addressLabel = (address: MailAddress) => address.name || address.address || address.rawValue;

function AddressButton({
  address,
  compact = false,
  onContact,
}: {
  address: MailAddress;
  compact?: boolean;
  onContact: (address: ContactCardAddress, x: number, y: number) => void;
}) {
  const anchorRef = useRef<View>(null);
  return (
    <Pressable
      ref={anchorRef}
      accessibilityRole="button"
      accessibilityLabel={`Show contact card for ${addressLabel(address)}`}
      onPress={() =>
        anchorRef.current?.measureInWindow((x, y, _width, height) =>
          onContact(address, x, y + height + 6),
        )
      }
      style={({ pressed }) => ({
        alignSelf: 'center',
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: compact ? 0 : 8,
        paddingVertical: compact ? 2 : 5,
        borderRadius: 6,
        backgroundColor: pressed ? '#EED2C8' : compact ? 'transparent' : '#FAEDE8',
      })}
    >
      <Text
        style={{
          fontSize: compact ? 13 : 12,
          fontWeight: compact ? '600' : '400',
          color: compact ? colors.label : '#B64735',
          flexShrink: 1,
          textDecorationLine: compact ? 'none' : 'underline',
        }}
      >
        {compact
          ? addressLabel(address)
          : address.name && address.address && address.name !== address.address
            ? `${address.name} <${address.address}>`
            : address.address || address.rawValue}
      </Text>
      {!compact ? (
        <Host style={{ width: 14, height: 14 }}>
          <Image systemName="person.crop.circle" size={12} color="#B64735" />
        </Host>
      ) : null}
    </Pressable>
  );
}

function Message({
  message,
  accountId,
  collapsible,
  onContact,
}: {
  message: MailThreadDetail['messages'][number];
  accountId: string;
  collapsible: boolean;
  onContact: (address: ContactCardAddress, x: number, y: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [details, setDetails] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(1);
  const [html, setHtml] = useState(message.safeHtml);
  const [imageError, setImageError] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [loadingImages, setLoadingImages] = useState(false);
  const sender = message.addresses.find((item) => item.kind === 'from');
  const name = sender ? addressLabel(sender) : message.sender;
  const recipients = message.addresses.filter((item) => item.kind === 'to');
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const logo = Array.from((html ?? '').matchAll(/<img\b[^>]*>/gi))
    .find(([tag]) => {
      const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1];
      return alt && name.toLowerCase().includes(alt.trim().toLowerCase()) && alt.trim().length > 2;
    })?.[0]
    .match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1]
    ?.replace(/&amp;/g, '&');
  const avatar =
    logo && (logo.startsWith('data:image/') || /^https?:/i.test(logo)) ? logo : undefined;
  useEffect(() => {
    let active = true;
    setLoadingImages(true);
    setImageError(false);
    void loadMessageImages(accountId, message)
      .then((body) => {
        if (active) setHtml(body);
      })
      .catch(() => {
        if (active) setImageError(true);
      })
      .finally(() => {
        if (active) setLoadingImages(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, message, imageAttempt]);

  return (
    <View
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: colors.separator,
      }}
    >
      <View
        style={{
          padding: 18,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'flex-start',
          backgroundColor: colors.card,
        }}
      >
        {avatar ? (
          <Bitmap
            source={{ uri: avatar }}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'white' }}
            resizeMode="contain"
          />
        ) : (
          <Host style={{ width: 38, height: 38 }}>
            <SwiftText
              size={13}
              weight="semibold"
              color="#8C5147"
              modifiers={[
                frame({ width: 38, height: 38 }),
                background('#F5E4DE'),
                cornerRadius(19),
              ]}
            >
              {initials}
            </SwiftText>
          </Host>
        )}
        <View style={{ flex: 1, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {sender ? (
                <AddressButton
                  address={sender}
                  compact
                  onContact={(address, x, y) => onContact({ ...address, avatarUrl: avatar }, x, y)}
                />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{name}</Text>
              )}
              <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>to</Text>
              {recipients.map((recipient, index) => (
                <AddressButton key={index} address={recipient} compact onContact={onContact} />
              ))}
              {!recipients.length ? (
                <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>
                  {message.recipients || 'undisclosed recipients'}
                </Text>
              ) : null}
              <Host style={{ width: 20, height: 22 }}>
                <Button
                  variant="plain"
                  onPress={() => setDetails(!details)}
                  modifiers={[
                    accessibilityLabel(details ? 'Hide address details' : 'Show address details'),
                  ]}
                >
                  <Image
                    systemName={details ? 'chevron.up' : 'chevron.down'}
                    size={9}
                    color="secondary"
                  />
                </Button>
              </Host>
            </View>
            <Host matchContents={{ vertical: true }} style={{ width: collapsible ? 152 : 128 }}>
              <HStack spacing={10}>
                <SwiftText size={11} color="secondary">
                  {new Date(message.sentAt).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </SwiftText>
                {collapsible ? (
                  <Button
                    variant="plain"
                    onPress={() => setExpanded(!expanded)}
                    modifiers={[accessibilityLabel(`${expanded ? 'Collapse' : 'Expand'} message`)]}
                  >
                    <Image systemName={expanded ? 'chevron.up' : 'chevron.down'} size={10} />
                  </Button>
                ) : null}
              </HStack>
            </Host>
          </View>
          {details ? (
            <View style={{ gap: 6 }}>
              {message.addresses.map((address, index) => (
                <View
                  key={`${address.kind}:${index}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <Host matchContents={{ vertical: true }} style={{ width: 48 }}>
                    <SwiftText
                      size={11}
                      color="secondary"
                      modifiers={[frame({ width: 48, alignment: 'trailing' })]}
                    >
                      {address.kind === 'replyTo' ? 'reply-to' : address.kind}
                    </SwiftText>
                  </Host>
                  <AddressButton
                    address={address}
                    onContact={(contact, x, y) =>
                      onContact(
                        {
                          ...contact,
                          avatarUrl: contact.address === sender?.address ? avatar : undefined,
                        },
                        x,
                        y,
                      )
                    }
                  />
                </View>
              ))}
              <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
                <HStack
                  spacing={8}
                  modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
                >
                  <SwiftText
                    size={11}
                    color="secondary"
                    modifiers={[frame({ width: 48, alignment: 'trailing' })]}
                  >
                    date
                  </SwiftText>
                  <SwiftText size={11}>{new Date(message.sentAt).toLocaleString()}</SwiftText>
                </HStack>
              </Host>
            </View>
          ) : null}
        </View>
      </View>
      {expanded ? (
        <>
          {imageError ? (
            <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
              <HStack
                spacing={12}
                modifiers={[
                  padding({ horizontal: 18, vertical: 9 }),
                  frame({ maxWidth: Infinity, alignment: 'leading' }),
                ]}
              >
                <Image systemName="photo" size={12} color="secondary" />
                <SwiftText size={11} color="secondary">
                  Some images could not be loaded
                </SwiftText>
                <Spacer />
                <Button
                  variant="borderless"
                  controlSize="small"
                  disabled={loadingImages}
                  onPress={() => setImageAttempt((attempt) => attempt + 1)}
                >
                  {loadingImages ? 'Loading…' : 'Retry images'}
                </Button>
              </HStack>
            </Host>
          ) : null}
          <View style={{ backgroundColor: '#fff', padding: 14 }}>
            <NativeMailViewer
              html={html}
              allowRemoteImages
              plainText={message.plainText || 'This message has no readable body.'}
              onContentHeightChange={({ nativeEvent }) => setBodyHeight(nativeEvent.height)}
              style={{ width: '100%', ...(Platform.OS === 'macos' ? { height: bodyHeight } : {}) }}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

export function ThreadDetail({ detail, loading, error, onBlock }: ThreadDetailProps) {
  const [contact, setContact] = useState<ContactCardAddress>();
  const [anchor, setAnchor] = useState({ x: 24, y: 100 });
  const rootRef = useRef<View>(null);
  const openContact = (address: ContactCardAddress, x: number, y: number) => {
    rootRef.current?.measureInWindow((rootX, rootY, width, height) => {
      setAnchor({
        x: Math.max(12, Math.min(x - rootX, width - 312)),
        y: Math.max(12, Math.min(y - rootY, height - 230)),
      });
      setContact(address);
    });
  };
  return (
    <View ref={rootRef} style={{ flex: 1 }}>
      <ScrollView
        contentContainerClassName="w-full max-w-[1080px] self-center px-[24px] pt-[20px] pb-[32px] gap-[16px]"
        onScrollBeginDrag={() => setContact(undefined)}
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1"
      >
        {loading ? (
          <Text style={{ color: colors.secondaryLabel }}>Opening conversation…</Text>
        ) : null}
        {error ? (
          <Text selectable style={{ color: colors.red }}>
            {error}
          </Text>
        ) : null}
        {detail ? (
          <>
            <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
              <SwiftText
                size={17}
                weight="semibold"
                modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
              >
                {detail.subject || '(No subject)'}
              </SwiftText>
            </Host>
            {detail.messages.some((message) => message.attachments.length) ? (
              <AttachmentRow
                attachments={detail.messages.flatMap((message) => message.attachments)}
              />
            ) : null}
            {detail.messages.map((message) => (
              <Message
                onContact={openContact}
                key={message.id}
                accountId={detail.accountId}
                message={message}
                collapsible={detail.messages.length > 1}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
      {contact ? (
        <Pressable
          style={{ position: 'absolute', inset: 0, zIndex: 10 }}
          onPress={() => setContact(undefined)}
          accessibilityLabel="Dismiss contact card"
        >
          <View
            style={{ position: 'absolute', left: anchor.x, top: anchor.y }}
            onStartShouldSetResponder={() => true}
          >
            <ContactCard
              key={contact.address || contact.rawValue}
              contact={contact}
              accountId={detail?.accountId}
              onClose={() => setContact(undefined)}
              onBlock={onBlock}
            />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
