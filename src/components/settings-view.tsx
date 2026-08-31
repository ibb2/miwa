import {
  PlatformColor,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NativeActionButton } from './native-action-button';
import { NativeDivider } from './native-divider';
import { NativePreferenceSwitch } from './native-preference-switch';
import { NativeSectionLabel } from './native-section-label';
import { NativeSymbol } from './native-symbol';
import type { ConnectedAccount } from '../mail/types';
import type { MailPreferences } from '../settings/mail-preferences';

type SettingsViewProps = {
  accounts: ConnectedAccount[];
  clearEnabled: boolean;
  downloadEnabled: boolean;
  downloadLimit: number;
  downloadStatus: string;
  downloadingAccountId?: string;
  isClearingData: boolean;
  isDownloading: boolean;
  preferences: MailPreferences;
  onChangePreference: (key: keyof MailPreferences, value: boolean) => void;
  onClearDatabase: () => void;
  onConnectAccount: () => void;
  onDownloadMail: () => void;
  onDownloadMailbox: (account: ConnectedAccount) => void;
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
      <NativePreferenceSwitch
        label={label}
        onValueChange={onValueChange}
        value={value}
      />
    </View>
  );
}

export function SettingsView({
  accounts,
  clearEnabled,
  downloadEnabled,
  downloadLimit,
  downloadStatus,
  downloadingAccountId,
  isClearingData,
  isDownloading,
  preferences,
  onChangePreference,
  onClearDatabase,
  onConnectAccount,
  onDownloadMail,
  onDownloadMailbox,
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
        <NativeSectionLabel label="OFFLINE MAIL" systemImage="arrow.down.circle" />
        <View style={styles.group}>
          <View style={styles.downloadRow}>
            <View style={styles.preferenceCopy}>
              <Text selectable style={styles.preferenceLabel}>Initial mail download</Text>
              <Text selectable style={styles.preferenceDescription}>
                Download up to {downloadLimit.toLocaleString()} inbox emails per account.
                New mail will be synced incrementally afterwards.
              </Text>
              {isDownloading ? (
                <Text selectable style={styles.downloadStatus}>{downloadStatus}</Text>
              ) : null}
            </View>
            <NativeActionButton
              disabled={!downloadEnabled || isDownloading}
              label={isDownloading ? 'Downloading…' : 'Download all'}
              onPress={onDownloadMail}
              variant="glassProminent"
            />
          </View>
          {accounts.map((account) => (
            <View key={account.id}>
              <NativeDivider />
              <View style={styles.mailboxDownloadRow}>
                <NativeSymbol
                  fallback={(account.displayName || account.email).slice(0, 1).toUpperCase()}
                  systemName="tray"
                />
                <View style={styles.accountCopy}>
                  <Text numberOfLines={1} selectable style={styles.accountEmail}>
                    {account.email}
                  </Text>
                  <Text selectable style={styles.preferenceDescription}>
                    Download up to {downloadLimit.toLocaleString()} inbox emails.
                  </Text>
                  {isDownloading && downloadingAccountId === account.id ? (
                    <Text selectable style={styles.downloadStatus}>{downloadStatus}</Text>
                  ) : null}
                </View>
                <NativeActionButton
                  accessibilityLabel={`Download mail for ${account.email}`}
                  disabled={isDownloading}
                  label={
                    isDownloading && downloadingAccountId === account.id
                      ? 'Downloading…'
                      : 'Download'
                  }
                  onPress={() => onDownloadMailbox(account)}
                  variant="glass"
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <NativeSectionLabel label="INBOX" systemImage="tray.full" />
        <View style={styles.group}>
          <PreferenceRow
            description="Include a short excerpt in every email row."
            label="Show message previews"
            onValueChange={(value) => onChangePreference('showPreviews', value)}
            value={preferences.showPreviews}
          />
          <NativeDivider />
          <PreferenceRow
            description="Add more breathing room between messages."
            label="Comfortable row spacing"
            onValueChange={(value) => onChangePreference('comfortableRows', value)}
            value={preferences.comfortableRows}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <NativeSectionLabel label="ACCOUNTS" systemImage="person.crop.circle" />
          <Text selectable style={styles.sectionCount}>
            {accounts.length.toLocaleString()}
          </Text>
        </View>
        <View style={styles.group}>
          {accounts.map((account, index) => (
            <View key={account.id}>
              {index > 0 ? <NativeDivider /> : null}
              <View style={styles.accountRow}>
                <NativeSymbol
                  fallback={(account.displayName || account.email).slice(0, 1).toUpperCase()}
                  systemName="envelope.fill"
                />
                <View style={styles.accountCopy}>
                  <Text numberOfLines={1} selectable style={styles.accountName}>
                    {account.displayName || 'Gmail'}
                  </Text>
                  <Text numberOfLines={1} selectable style={styles.accountEmail}>
                    {account.email}
                  </Text>
                </View>
                <NativeActionButton
                  accessibilityLabel={`Remove ${account.email}`}
                  label="Remove"
                  onPress={() => onDisconnectAccount(account)}
                  role="destructive"
                  variant="glass"
                />
              </View>
            </View>
          ))}
          {accounts.length ? <NativeDivider /> : null}
          <View style={styles.connectRow}>
            <NativeActionButton
              accessibilityLabel="Add another Gmail account"
              label="Add account"
              onPress={onConnectAccount}
              variant="glassProminent"
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <NativeSectionLabel label="LOCAL DATA" systemImage="internaldrive" />
        <View style={styles.group}>
          <View style={styles.clearDataRow}>
            <View style={styles.preferenceCopy}>
              <Text selectable style={styles.preferenceLabel}>Clear local database</Text>
              <Text selectable style={styles.preferenceDescription}>
                Remove downloaded messages, attachments, account cache and sync history,
                then reset preferences. Your Gmail accounts remain connected.
              </Text>
            </View>
            <NativeActionButton
              disabled={!clearEnabled || isClearingData}
              label={isClearingData ? 'Clearing…' : 'Clear everything'}
              onPress={onClearDatabase}
              role="destructive"
              variant="glass"
            />
          </View>
        </View>
      </View>

      <View style={styles.aboutRow}>
        <Text selectable style={styles.aboutTitle}>Miwa 0.1.0</Text>
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
  downloadRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 18,
  },
  mailboxDownloadRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 11,
  },
  downloadStatus: {
    color: '#C95243',
    fontSize: 10,
    lineHeight: 14,
    paddingTop: 3,
  },
  accountRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 11,
  },
  accountCopy: { flex: 1, gap: 2 },
  accountName: {
    color: PlatformColor('labelColor'),
    fontSize: 13,
    fontWeight: '600',
  },
  accountEmail: { color: PlatformColor('secondaryLabelColor'), fontSize: 11 },
  connectRow: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  clearDataRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 18,
  },
  aboutRow: { alignItems: 'center', gap: 3, paddingTop: 2 },
  aboutTitle: { color: PlatformColor('secondaryLabelColor'), fontSize: 11, fontWeight: '600' },
  aboutCopy: {
    color: PlatformColor('tertiaryLabelColor'),
    fontSize: 10,
    textAlign: 'center',
  },
});
