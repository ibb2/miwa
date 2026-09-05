import { ScrollView, Text, View } from 'react-native';
import { colors } from '../components/native-colors';

import { useResolveClassNames } from 'uniwind';

import { NativeMailViewer } from '../../modules/native-mail-viewer/src';
import type { MailThreadDetail } from './types';

type ThreadDetailProps = {
  detail?: MailThreadDetail;
  loading: boolean;
  error?: string;
};

/** The reading pane for one downloaded conversation. */
export function ThreadDetail({ detail, loading, error }: ThreadDetailProps) {
  const viewerStyle = useResolveClassNames('flex-1 min-h-[320px] w-full');
  return (
    <ScrollView
      contentContainerClassName="grow w-full max-w-[1080px] self-center px-[38px] pt-[16px] pb-[16px] gap-[16px]"
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
    >
      {loading ? (
        <Text
          selectable
          className="p-[20px] text-[12px] text-center"
          style={{ color: colors.secondaryLabel }}
        >
          Opening downloaded conversation…
        </Text>
      ) : null}
      {error ? (
        <Text
          selectable
          className="max-w-[460px] mt-[6px] self-center text-[11px] leading-[15px] text-center"
          style={{ color: colors.red }}
        >
          {error}
        </Text>
      ) : null}
      {detail ? (
        <>
          <Text
            selectable
            className="text-[30px] font-bold tracking-[-0.8px]"
            style={{ color: colors.label }}
          >
            {detail.subject || '(No subject)'}
          </Text>
          <View className="grow gap-[16px]">
            {detail.messages.map((message) => (
              <View
                key={message.id}
                className="grow p-[20px] rounded-[14px] border-continuous border-hairline shadow-[0_8px_26px_rgba(0,_0,_0,_0.055)] gap-[12px]"
                style={{ backgroundColor: colors.card, borderColor: colors.separator }}
              >
                <View className="flex-row items-center gap-[11px]">
                  <View className="w-[34px] h-[34px] items-center justify-center rounded-[11px] border-continuous bg-accent">
                    <Text selectable className="text-[#fff] text-[13px] font-bold">
                      {message.sender.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0 gap-[2px]">
                    <Text
                      selectable
                      className="text-[13px] font-semibold"
                      style={{ color: colors.label }}
                    >
                      {message.sender}
                    </Text>
                    {message.recipients ? (
                      <Text
                        numberOfLines={1}
                        selectable
                        className="text-[10px]"
                        style={{ color: colors.secondaryLabel }}
                      >
                        to {message.recipients}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    selectable
                    className="text-[10px] tabular-nums"
                    style={{ color: colors.secondaryLabel }}
                  >
                    {new Date(message.sentAt).toLocaleString()}
                  </Text>
                </View>
                <View className="h-hairline" style={{ backgroundColor: colors.separator }} />
                <NativeMailViewer
                  html={message.safeHtml}
                  plainText={message.plainText || 'This message has no readable body.'}
                  style={viewerStyle}
                />
                {message.attachments.length ? (
                  <View
                    className="border-t-hairline pt-[10px] gap-[5px]"
                    style={{ borderTopColor: colors.separator }}
                  >
                    {message.attachments.map((attachment) => (
                      <Text
                        key={attachment.id ?? attachment.filename}
                        selectable
                        className="self-start text-accent-dark text-[11px] font-semibold px-[9px] py-[6px] rounded-[7px] border-continuous bg-[rgba(232,110,90,0.09)]"
                      >
                        {attachment.filename || 'Attachment'}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
