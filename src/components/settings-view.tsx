import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ConnectedAccount } from '../mail/types';
import type { MailPreferences } from '../settings/preferences';
import { accentDark, colors, shared } from '../theme';
import {
  NativeActionButton,
  NativeDivider,
  NativeSectionLabel,
  NativeSwitch,
  NativeSymbol,
} from './native';

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
  onChangePreference: <K extends keyof MailPreferences>(
    key: K,
    value: MailPreferences[K],
  ) => void;
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
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text selectable style={styles.rowLabel}>{label}</Text>
        <Text selectable style={styles.rowDescription}>{description}</Text>
      </View>
      <NativeSwitch label={label} onValueChange={onValueChange} value={value} />
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
      style={shared.screenScroll}
    >
      <View style={styles.titleBlock}>
        <Text selectable style={shared.eyebrow}>MIWA</Text>
        <Text selectable style={[shared.screenTitle, styles.title]}>Settings</Text>
        <Text selectable style={[shared.screenSubtitle, styles.subtitle]}>
          Shape the reading desk around the way you work.
        </Text>
      </View>

      <View style={styles.section}>
        <NativeSectionLabel label="OFFLINE MAIL" systemImage="arrow.down.circle" />
        <View style={shared.card}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text selectable style={styles.rowLabel}>Initial mail download</Text>
              <Text selectable style={styles.rowDescription}>
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
              <View style={styles.row}>
                <NativeSymbol
                  fallback={(account.displayName || account.email).slice(0, 1).toUpperCase()}
                  systemName="tray"
                />
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} selectable style={styles.rowLabel}>
                    {account.email}
                  </Text>
                  <Text selectable style={styles.rowDescription}>
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
        <View style={shared.card}>
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
          <Text selectable style={styles.sectionCount}>{accounts.length.toLocaleString()}</Text>
        </View>
        <View style={shared.card}>
          {accounts.map((account, index) => (
            <View key={account.id}>
              {index > 0 ? <NativeDivider /> : null}
              <View style={styles.row}>
                <NativeSymbol
                  fallback={(account.displayName || account.email).slice(0, 1).toUpperCase()}
                  systemName="envelope.fill"
                />
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} selectable style={styles.rowLabel}>
                    {account.displayName || 'Gmail'}
                  </Text>
                  <Text numberOfLines={1} selectable style={styles.rowDescription}>
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
        <View style={shared.card}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text selectable style={styles.rowLabel}>Clear local database</Text>
              <Text selectable style={styles.rowDescription}>
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
  title: { fontSize: 32 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  section: { gap: 9 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionCount: {
    color: colors.tertiaryLabel,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 18,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: { color: colors.label, fontSize: 13, fontWeight: '600' },
  rowDescription: { color: colors.secondaryLabel, fontSize: 11, lineHeight: 15 },
  downloadStatus: { color: accentDark, fontSize: 10, lineHeight: 14, paddingTop: 3 },
  connectRow: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  aboutRow: { alignItems: 'center', gap: 3, paddingTop: 2 },
  aboutTitle: { color: colors.secondaryLabel, fontSize: 11, fontWeight: '600' },
  aboutCopy: { color: colors.tertiaryLabel, fontSize: 10, textAlign: 'center' },
});
