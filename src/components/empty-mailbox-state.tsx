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
        <Text style={[styles.sparkle, styles.sparkleLeft]}>✦</Text>
        <Text style={[styles.sparkle, styles.sparkleRight]}>✧</Text>
        <View style={styles.envelope}>
          <View style={styles.envelopeFlap} />
          <Text style={styles.sleepyFace}>• ᴗ •</Text>
        </View>
      </View>

      <Text selectable style={styles.title}>
        {mailboxSpecific ? 'This mailbox is taking a tiny nap.' : 'Your mailboxes are taking a tiny nap.'}
      </Text>
      <Text selectable style={styles.copy}>
        {mailboxSpecific
          ? `No mail has been downloaded for ${mailboxName} yet. Use the download button in the toolbar when you are ready.`
          : 'No mail has been downloaded yet. Choose one inbox—or all of them—from the download button in the toolbar.'}
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
    width: 132,
    height: 106,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  envelope: {
    width: 94,
    height: 64,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: PlatformColor('controlAccentColor'),
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.12)',
    overflow: 'hidden',
  },
  envelopeFlap: {
    position: 'absolute',
    top: -31,
    width: 68,
    height: 68,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ rotate: '45deg' }],
  },
  sleepyFace: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sparkle: {
    position: 'absolute',
    color: PlatformColor('controlAccentColor'),
    fontSize: 22,
    fontWeight: '700',
  },
  sparkleLeft: {
    left: 3,
    top: 18,
    transform: [{ rotate: '-14deg' }],
  },
  sparkleRight: {
    right: 2,
    top: 4,
    transform: [{ rotate: '12deg' }],
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
