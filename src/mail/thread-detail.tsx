import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { Button, Host, HStack, Image, Text as SwiftText, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, frame } from '@expo/ui/swift-ui/modifiers';

import { colors } from '../components/native-colors';
import { NativeMailViewer } from '../../modules/native-mail-viewer/src';
import type { MailThreadDetail } from './types';

type ThreadDetailProps = {
  detail?: MailThreadDetail;
  loading: boolean;
  error?: string;
};

function Message({
  message,
  collapsible,
}: {
  message: MailThreadDetail['messages'][number];
  collapsible: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [bodyHeight, setBodyHeight] = useState(1);
  const header = (
    <HStack spacing={10} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
      {collapsible ? (
        <Image
          systemName={expanded ? 'chevron.down' : 'chevron.right'}
          size={10}
          color="secondary"
        />
      ) : null}
      <VStack alignment="leading" spacing={4}>
        <SwiftText size={13} weight="semibold">
          {message.sender}
        </SwiftText>
        {expanded && message.recipients ? (
          <SwiftText size={11} color="secondary">{`To ${message.recipients}`}</SwiftText>
        ) : null}
        <SwiftText size={10} color="secondary">
          {new Date(message.sentAt).toLocaleString()}
        </SwiftText>
      </VStack>
    </HStack>
  );

  return (
    <View
      className="border-t-hairline pt-[16px] gap-[16px]"
      style={{ borderTopColor: colors.separator }}
    >
      <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
        {collapsible ? (
          <Button
            variant="plain"
            onPress={() => setExpanded(!expanded)}
            modifiers={[
              accessibilityLabel(
                `${expanded ? 'Collapse' : 'Expand'} message from ${message.sender}`,
              ),
            ]}
          >
            {header}
          </Button>
        ) : (
          header
        )}
      </Host>
      {expanded ? (
        <>
          <NativeMailViewer
            html={message.safeHtml}
            plainText={message.plainText || 'This message has no readable body.'}
            onContentHeightChange={({ nativeEvent }) => setBodyHeight(nativeEvent.height)}
            style={{ width: '100%', ...(Platform.OS === 'macos' ? { height: bodyHeight } : {}) }}
          />
          {message.attachments.map((attachment) => (
            <View
              key={attachment.id ?? attachment.filename}
              className="flex-row items-center gap-[6px]"
            >
              <Host style={{ width: 14, height: 16 }}>
                <Image systemName="paperclip" size={12} color="secondary" />
              </Host>
              <Text selectable className="text-[12px]" style={{ color: colors.secondaryLabel }}>
                {attachment.filename || 'Attachment'}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

export function ThreadDetail({ detail, loading, error }: ThreadDetailProps) {
  return (
    <ScrollView
      contentContainerClassName="w-full max-w-[1080px] self-center px-[24px] pt-[20px] pb-[32px] gap-[20px]"
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
    >
      {loading ? <Text style={{ color: colors.secondaryLabel }}>Opening conversation…</Text> : null}
      {error ? (
        <Text selectable style={{ color: colors.red }}>
          {error}
        </Text>
      ) : null}
      {detail ? (
        <>
          <Text selectable className="text-[24px] font-semibold" style={{ color: colors.label }}>
            {detail.subject || '(No subject)'}
          </Text>
          {detail.messages.map((message) => (
            <Message key={message.id} message={message} collapsible={detail.messages.length > 1} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
