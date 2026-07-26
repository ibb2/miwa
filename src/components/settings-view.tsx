import {
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import type { ConnectedAccount } from '../mail/types';
import type { MailPreferences } from '../settings/mail-preferences';

type SettingsViewProps = {
  accounts: ConnectedAccount[];
  preferences: MailPreferences;
  onChangePreference: (key: keyof MailPreferences, value: boolean) => void;
  onConnectAccount: () => void;
  onDisconnectAccount: (account: ConnectedAccount) => void;
};

function PreferenceRow({
  description,
  label,
  onValueChange,
  value,
}: {
  description: string;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text selectable style={styles.preferenceLabel}>{label}</Text>
        <Text selectable style={styles.preferenceDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onValueChange}
        value={value}
      />
    </View>
  );
}

export function SettingsView({
  accounts,
  preferences,
  onChangePreference,
  onConnectAccount,
  onDisconnectAccount,
}: SettingsViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.scrollView}
    >
      <View style={styles.titleBlock}>
        <Text selectable style={styles.eyebrow}>MIWA</Text>
        <Text selectable style={styles.title}>Settings</Text>
        <Text selectable style={styles.subtitle}>
          Shape the reading desk around the way you work.
        </Text>
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>INBOX</Text>
        <View style={styles.group}>
          <PreferenceRow
            description="Include a short excerpt in every email row."
            label="Show message previews"
            onValueChange={(value) => onChangePreference('showPreviews', value)}
            value={preferences.showPreviews}
          />
          <View style={styles.separator} />
          <PreferenceRow
            description="Add more breathing room between messages."
            label="Comfortable row spacing"
            onValueChange={(value) => onChangePreference('comfortableRows', value)}
            value={preferences.comfortableRows}
          />
          <View style={styles.separator} />
          <PreferenceRow
            description="Show the destination inbox when viewing all accounts."
            label="Show account labels"
            onValueChange={(value) => onChangePreference('showAccountLabels', value)}
            value={preferences.showAccountLabels}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text selectable style={styles.sectionTitle}>ACCOUNTS</Text>
          <Text selectable style={styles.sectionCount}>
            {accounts.length.toLocaleString()}
          </Text>
        </View>
        <View style={styles.group}>
          {accounts.map((account, index) => (
            <View key={account.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <View style={styles.accountRow}>
                <View style={styles.accountMonogram}>
                  <Text selectable style={styles.accountMonogramText}>
                    {(account.displayName || account.email).slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.accountCopy}>
                  <Text numberOfLines={1} selectable style={styles.accountName}>
                    {account.displayName || 'Gmail'}
                  </Text>
                  <Text numberOfLines={1} selectable style={styles.accountEmail}>
                    {account.email}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`Disconnect ${account.email}`}
                  accessibilityRole="button"
                  onPress={() => onDisconnectAccount(account)}
                  style={({ pressed }) => [
                    styles.disconnectButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {accounts.length ? <View style={styles.separator} /> : null}
          <Pressable
            accessibilityRole="button"
            onPress={onConnectAccount}
            style={({ pressed }) => [
              styles.connectRow,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.connectGlyph}>＋</Text>
            <Text style={styles.connectText}>Connect another Gmail account</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.aboutRow}>
        <Text selectable style={styles.aboutTitle}>Miwa 1.0</Text>
        <Text selectable style={styles.aboutCopy}>
          A quiet, offline-first place for all of your Gmail inboxes.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 34,
    paddingTop: 42,
    paddingBottom: 64,
    gap: 34,
  },
  titleBlock: { gap: 5 },
  eyebrow: {
    color: '#E86E5A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: PlatformColor('labelColor'),
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 14,
    lineHeight: 20,
  },
  section: { gap: 9 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionCount: {
    color: PlatformColor('tertiaryLabelColor'),
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  group: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separatorColor'),
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: PlatformColor('controlBackgroundColor'),
  },
  preferenceRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 18,
  },
  preferenceCopy: { flex: 1, gap: 2 },
  preferenceLabel: {
    color: PlatformColor('labelColor'),
    fontSize: 13,
    fontWeight: '600',
  },
  preferenceDescription: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 11,
    lineHeight: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PlatformColor('separatorColor'),
    marginLeft: 16,
  },
  accountRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 11,
  },
  accountMonogram: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: '#E86E5A',
  },
  accountMonogramText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  accountCopy: { flex: 1, gap: 2 },
  accountName: {
    color: PlatformColor('labelColor'),
    fontSize: 13,
    fontWeight: '600',
  },
  accountEmail: { color: PlatformColor('secondaryLabelColor'), fontSize: 11 },
  disconnectButton: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 59, 48, 0.09)',
  },
  disconnectButtonText: { color: '#C9342D', fontSize: 11, fontWeight: '600' },
  connectRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  connectGlyph: { color: '#E86E5A', fontSize: 18, fontWeight: '500' },
  connectText: { color: '#C95243', fontSize: 12, fontWeight: '600' },
  buttonPressed: { opacity: 0.58 },
  aboutRow: { alignItems: 'center', gap: 3, paddingTop: 2 },
  aboutTitle: { color: PlatformColor('secondaryLabelColor'), fontSize: 11, fontWeight: '600' },
  aboutCopy: {
    color: PlatformColor('tertiaryLabelColor'),
    fontSize: 10,
    textAlign: 'center',
  },
});
