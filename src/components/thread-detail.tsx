import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { NativeMailViewer } from '../../modules/native-mail-viewer/src';
import type { MailThreadDetail } from '../mail/types';
import { accent, accentDark, colors, shared } from '../theme';

type ThreadDetailProps = {
  detail?: MailThreadDetail;
  loading: boolean;
  error?: string;
};

/** The reading pane for one downloaded conversation. */
export function ThreadDetail({ detail, loading, error }: ThreadDetailProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={shared.screenScroll}
    >
      {loading ? (
        <Text selectable style={shared.stateText}>Opening downloaded conversation…</Text>
      ) : null}
      {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
      {detail ? (
        <>
          <Text selectable style={shared.screenTitle}>
            {detail.subject || '(No subject)'}
          </Text>
          <View style={styles.messageStack}>
            {detail.messages.map((message) => (
              <View key={message.id} style={styles.messageCard}>
                <View style={styles.messageHeader}>
                  <View style={styles.senderMonogram}>
                    <Text selectable style={styles.senderMonogramText}>
                      {message.sender.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.messageIdentity}>
                    <Text selectable style={styles.messageSender}>{message.sender}</Text>
                    {message.recipients ? (
                      <Text numberOfLines={1} selectable style={styles.recipients}>
                        to {message.recipients}
                      </Text>
                    ) : null}
                  </View>
                  <Text selectable style={styles.messageDate}>
                    {new Date(message.sentAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.messageRule} />
                <NativeMailViewer
                  html={message.safeHtml}
                  plainText={message.plainText || 'This message has no readable body.'}
                  style={styles.mailViewer}
                />
                {message.attachments.length ? (
                  <View style={styles.attachmentList}>
                    {message.attachments.map((attachment) => (
                      <Text
                        key={attachment.id ?? attachment.filename}
                        selectable
                        style={styles.attachmentText}
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

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 38,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },
  errorText: {
    maxWidth: 460,
    marginTop: 6,
    alignSelf: 'center',
    color: colors.red,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  messageStack: { flexGrow: 1, gap: 16 },
  messageCard: {
    flexGrow: 1,
    padding: 20,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    boxShadow: '0 8px 26px rgba(0, 0, 0, 0.055)',
    gap: 12,
  },
  messageHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  senderMonogram: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: accent,
  },
  senderMonogramText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  messageIdentity: { flex: 1, minWidth: 0, gap: 2 },
  messageSender: { color: colors.label, fontSize: 13, fontWeight: '600' },
  messageDate: {
    color: colors.secondaryLabel,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  recipients: { color: colors.secondaryLabel, fontSize: 10 },
  messageRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  mailViewer: { flex: 1, minHeight: 320, width: '100%' },
  attachmentList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: 10,
    gap: 5,
  },
  attachmentText: {
    alignSelf: 'flex-start',
    color: accentDark,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(232, 110, 90, 0.09)',
  },
});
