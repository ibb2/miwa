import { PlatformColor, StyleSheet, Text, View } from 'react-native';

type EmptyMailboxStateProps = {
  mailboxName?: string;
};

export function EmptyMailboxState({ mailboxName }: EmptyMailboxStateProps) {
  const mailboxSpecific = Boolean(mailboxName);

  return (
    <View
      accessibilityLabel={
        mailboxSpecific
          ? `No mail has been downloaded for ${mailboxName}`
          : 'No mail has been downloaded'
      }
      style={styles.container}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.illustration}>
        <View style={styles.envelope}>
          <View style={styles.envelopeFlap} />
          <View style={styles.postmark} />
        </View>
      </View>

      <Text selectable style={styles.title}>
        {mailboxSpecific ? 'Nothing has arrived here yet.' : 'Your reading desk is clear.'}
      </Text>
      <Text selectable style={styles.copy}>
        {mailboxSpecific
          ? `Download ${mailboxName} from the toolbar to make its conversations available offline.`
          : 'Choose one inbox—or all of them—from the download button in the toolbar.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  illustration: {
    width: 112,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  envelope: {
    width: 88,
    height: 58,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#E86E5A',
    boxShadow: '0 10px 26px rgba(92, 44, 36, 0.18)',
    overflow: 'hidden',
  },
  envelopeFlap: {
    position: 'absolute',
    top: -34,
    left: 12,
    width: 64,
    height: 64,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ rotate: '45deg' }],
  },
  postmark: {
    position: 'absolute',
    right: 12,
    bottom: 11,
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 999,
  },
  title: {
    color: PlatformColor('labelColor'),
    fontSize: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  copy: {
    maxWidth: 390,
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
