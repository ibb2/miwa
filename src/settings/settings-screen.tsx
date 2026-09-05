import { ScrollView, Switch, Text, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';
import { accent, colors } from '../components/native-colors';

import type { ConnectedAccount } from '../mail/types';
import type { MailPreferences } from './preferences';
import {
  NativeActionButton,
  NativeDivider,
  NativeSectionLabel,
  NativeSymbol,
} from '../components/native-controls';

type SettingsScreenProps = {
  accounts: ConnectedAccount[];
  clearEnabled: boolean;
  downloadEnabled: boolean;
  downloadLimit: number;
  downloadStatus: string;
  downloadingAccountId?: string;
  isClearingData: boolean;
  isDownloading: boolean;
  preferences: MailPreferences;
  onChangeShowPreviews: (value: boolean) => void;
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
  const switchStyle = useResolveClassNames('w-[38px] h-[22px]');
  return (
    <View className="min-h-[66px] flex-row items-center px-[16px] py-[11px] gap-[18px]">
      <View className="flex-1 gap-[2px]">
        <Text selectable className="text-[13px] font-semibold" style={{ color: colors.label }}>
          {label}
        </Text>
        <Text
          selectable
          className="text-[11px] leading-[15px]"
          style={{ color: colors.secondaryLabel }}
        >
          {description}
        </Text>
      </View>
      <Switch
        accessibilityLabel={label}
        onTintColor={accent}
        onValueChange={onValueChange}
        value={value}
        style={switchStyle}
      />
    </View>
  );
}

export function SettingsScreen({
  accounts,
  clearEnabled,
  downloadEnabled,
  downloadLimit,
  downloadStatus,
  downloadingAccountId,
  isClearingData,
  isDownloading,
  preferences,
  onChangeShowPreviews,
  onClearDatabase,
  onConnectAccount,
  onDownloadMail,
  onDownloadMailbox,
  onDisconnectAccount,
}: SettingsScreenProps) {
  return (
    <ScrollView
      contentContainerClassName="w-full max-w-[760px] self-center px-[34px] pt-[42px] pb-[64px] gap-[34px]"
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
    >
      <View className="gap-[5px]">
        <Text selectable className="text-accent text-[10px] font-extrabold tracking-[1.5px]">
          MIWA
        </Text>
        <Text
          selectable
          className="text-[32px] font-bold tracking-[-0.8px]"
          style={{ color: colors.label }}
        >
          Settings
        </Text>
        <Text
          selectable
          className="text-[14px] leading-[20px]"
          style={{ color: colors.secondaryLabel }}
        >
          Shape the reading desk around the way you work.
        </Text>
      </View>

      <View className="gap-[9px]">
        <NativeSectionLabel label="OFFLINE MAIL" systemImage="arrow.down.circle" />
        <View
          className="border-hairline rounded-[14px] border-continuous"
          style={{ borderColor: colors.separator, backgroundColor: colors.card }}
        >
          <View className="min-h-[66px] flex-row items-center px-[16px] py-[11px] gap-[18px]">
            <View className="flex-1 gap-[2px]">
              <Text
                selectable
                className="text-[13px] font-semibold"
                style={{ color: colors.label }}
              >
                Initial mail download
              </Text>
              <Text
                selectable
                className="text-[11px] leading-[15px]"
                style={{ color: colors.secondaryLabel }}
              >
                Download up to {downloadLimit.toLocaleString()} inbox emails per account. New mail
                will be synced incrementally afterwards.
              </Text>
              {isDownloading ? (
                <Text selectable className="text-accent-dark text-[10px] leading-[14px] pt-[3px]">
                  {downloadStatus}
                </Text>
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
              <View className="min-h-[66px] flex-row items-center px-[16px] py-[11px] gap-[18px]">
                <NativeSymbol
                  fallback={(account.displayName || account.email).slice(0, 1).toUpperCase()}
                  systemName="tray"
                />
                <View className="flex-1 gap-[2px]">
                  <Text
                    numberOfLines={1}
                    selectable
                    className="text-[13px] font-semibold"
                    style={{ color: colors.label }}
                  >
                    {account.email}
                  </Text>
                  <Text
                    selectable
                    className="text-[11px] leading-[15px]"
                    style={{ color: colors.secondaryLabel }}
                  >
                    Download up to {downloadLimit.toLocaleString()} inbox emails.
                  </Text>
                  {isDownloading && downloadingAccountId === account.id ? (
                    <Text
                      selectable
                      className="text-accent-dark text-[10px] leading-[14px] pt-[3px]"
                    >
                      {downloadStatus}
                    </Text>
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
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-[9px]">
        <NativeSectionLabel label="INBOX" systemImage="tray.full" />
        <View
          className="border-hairline rounded-[14px] border-continuous"
          style={{ borderColor: colors.separator, backgroundColor: colors.card }}
        >
          <PreferenceRow
            description="Include a short excerpt in every email row."
            label="Show message previews"
            onValueChange={onChangeShowPreviews}
            value={preferences.showPreviews}
          />
        </View>
      </View>

      <View className="gap-[9px]">
        <View className="flex-row items-center justify-between px-[2px]">
          <NativeSectionLabel label="ACCOUNTS" systemImage="person.crop.circle" />
          <Text
            selectable
            className="text-[10px] tabular-nums"
            style={{ color: colors.tertiaryLabel }}
          >
            {accounts.length.toLocaleString()}
          </Text>
        </View>
        <View
          className="border-hairline rounded-[14px] border-continuous"
          style={{ borderColor: colors.separator, backgroundColor: colors.card }}
        >
          {accounts.map((account, index) => (
            <View key={account.id}>
              {index > 0 ? <NativeDivider /> : null}
              <View className="min-h-[66px] flex-row items-center px-[16px] py-[11px] gap-[18px]">
                <NativeSymbol
                  fallback={(account.displayName || account.email).slice(0, 1).toUpperCase()}
                  systemName="envelope.fill"
                />
                <View className="flex-1 gap-[2px]">
                  <Text
                    numberOfLines={1}
                    selectable
                    className="text-[13px] font-semibold"
                    style={{ color: colors.label }}
                  >
                    {account.displayName || 'Gmail'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    selectable
                    className="text-[11px] leading-[15px]"
                    style={{ color: colors.secondaryLabel }}
                  >
                    {account.email}
                  </Text>
                </View>
                <NativeActionButton
                  accessibilityLabel={`Remove ${account.email}`}
                  label="Remove"
                  onPress={() => onDisconnectAccount(account)}
                  role="destructive"
                />
              </View>
            </View>
          ))}
          {accounts.length ? <NativeDivider /> : null}
          <View className="min-h-[50px] items-center justify-center px-[12px]">
            <NativeActionButton
              accessibilityLabel="Add another Gmail account"
              label="Add account"
              onPress={onConnectAccount}
              variant="glassProminent"
            />
          </View>
        </View>
      </View>

      <View className="gap-[9px]">
        <NativeSectionLabel label="LOCAL DATA" systemImage="internaldrive" />
        <View
          className="border-hairline rounded-[14px] border-continuous"
          style={{ borderColor: colors.separator, backgroundColor: colors.card }}
        >
          <View className="min-h-[66px] flex-row items-center px-[16px] py-[11px] gap-[18px]">
            <View className="flex-1 gap-[2px]">
              <Text
                selectable
                className="text-[13px] font-semibold"
                style={{ color: colors.label }}
              >
                Clear local database
              </Text>
              <Text
                selectable
                className="text-[11px] leading-[15px]"
                style={{ color: colors.secondaryLabel }}
              >
                Remove downloaded messages, attachments, account cache and sync history, then reset
                preferences. Your Gmail accounts remain connected.
              </Text>
            </View>
            <NativeActionButton
              disabled={!clearEnabled || isClearingData}
              label={isClearingData ? 'Clearing…' : 'Clear everything'}
              onPress={onClearDatabase}
              role="destructive"
            />
          </View>
        </View>
      </View>

      <View className="items-center gap-[3px] pt-[2px]">
        <Text
          selectable
          className="text-[11px] font-semibold"
          style={{ color: colors.secondaryLabel }}
        >
          Miwa 0.1.0
        </Text>
        <Text
          selectable
          className="text-[10px] text-center"
          style={{ color: colors.tertiaryLabel }}
        >
          A quiet, offline-first place for all of your Gmail inboxes.
        </Text>
      </View>
    </ScrollView>
  );
}
