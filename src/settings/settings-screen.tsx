import { useState, type ComponentProps, type ReactNode } from 'react';
import { PlatformColor, useColorScheme, View } from 'react-native';
import {
  Button,
  Form,
  Host,
  HStack,
  Image as SwiftUIImage,
  LinearProgress,
  Section,
  Switch,
  Text as SwiftText,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  background,
  fixedSize,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';

import type { ConnectedAccount } from '../mail/types';
import { useAccent } from '../components/native-colors';
import type { NotificationPermissionStatus } from '../../modules/native-local-notifications/src';
import type { MailPreferences } from './preferences';

type SettingsScreenProps = {
  accounts: ConnectedAccount[];
  clearEnabled: boolean;
  connectError?: string;
  downloadEnabled: boolean;
  downloadFraction?: number;
  downloadLimit: number;
  downloadStatus: string;
  downloadingAccountId?: string;
  isClearingData: boolean;
  isDownloading: boolean;
  preferences: MailPreferences;
  notificationPermission: NotificationPermissionStatus;
  notificationsSupported: boolean;
  onChangeShowPreviews: (value: boolean) => void;
  onChangeNotificationsEnabled: (value: boolean) => void;
  onChangeNotificationsSound: (value: boolean) => void;
  onChangeNotificationsBadge: (value: boolean) => void;
  onChangeNotificationsPreview: (value: boolean) => void;
  onChangeDndEnabled: (value: boolean) => void;
  onChangeDndStartHour: (value: number) => void;
  onChangeDndEndHour: (value: number) => void;
  onToggleAccountNotifications: (account: ConnectedAccount, value: boolean) => void;
  onOpenSystemNotificationSettings: () => void;
  onClearDatabase: () => void;
  onConnectAccount: () => void;
  onDownloadMail: () => void;
  onDownloadMailbox: (account: ConnectedAccount) => void;
  onDisconnectAccount: (account: ConnectedAccount) => void;
};

const TABS = [
  { id: 'offline', label: 'Offline', systemImage: 'arrow.down.circle' },
  { id: 'inbox', label: 'Inbox', systemImage: 'tray.full' },
  { id: 'notifications', label: 'Notifications', systemImage: 'bell.badge' },
  { id: 'accounts', label: 'Accounts', systemImage: 'person.crop.circle' },
  { id: 'data', label: 'Data', systemImage: 'internaldrive' },
] as const;

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

function DndHourStepper({
  hour,
  label,
  disabled,
  onChange,
}: {
  hour: number;
  label: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const tint = useAccent();
  return (
    <SettingsRow title={label} symbol="moon">
      <HStack spacing={8}>
        <Button
          controlSize="regular"
          disabled={disabled || hour <= 0}
          onPress={() => onChange(hour - 1)}
          variant="glass"
          modifiers={[accessibilityLabel(`One hour earlier for ${label}`)]}
        >
          {'\u2212'}
        </Button>
        <SwiftText size={13} weight="medium" modifiers={[frame({ width: 52 })]}>
          {formatHour(hour)}
        </SwiftText>
        <Button
          controlSize="regular"
          disabled={disabled || hour >= 23}
          onPress={() => onChange(hour + 1)}
          variant="glassProminent"
          color={tint}
          modifiers={[accessibilityLabel(`One hour later for ${label}`)]}
        >
          {'+'}
        </Button>
      </HStack>
    </SettingsRow>
  );
}

function SettingsRow({
  title,
  description,
  symbol,
  children,
}: {
  title: string;
  description?: string;
  symbol?: ComponentProps<typeof SwiftUIImage>['systemName'];
  children?: ReactNode;
}) {
  const tint = useAccent();
  return (
    <HStack
      spacing={20}
      modifiers={[
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        padding({ top: 10, bottom: 10 }),
      ]}
    >
      {symbol ? (
        <SwiftUIImage
          systemName={symbol}
          color={tint}
          size={22}
          modifiers={[frame({ width: 30 })]}
        />
      ) : null}
      <VStack
        alignment="leading"
        spacing={5}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
      >
        <SwiftText size={13} weight="medium">
          {title}
        </SwiftText>
        {description ? (
          <SwiftText
            color="secondary"
            size={12}
            modifiers={[fixedSize({ horizontal: false, vertical: true })]}
          >
            {description}
          </SwiftText>
        ) : null}
      </VStack>
      {children ? (
        <VStack modifiers={[fixedSize({ horizontal: true, vertical: false })]}>{children}</VStack>
      ) : null}
    </HStack>
  );
}

export function SettingsScreen({
  accounts,
  clearEnabled,
  connectError,
  downloadEnabled,
  downloadFraction,
  downloadLimit,
  downloadStatus,
  downloadingAccountId,
  isClearingData,
  isDownloading,
  preferences,
  notificationPermission,
  notificationsSupported,
  onChangeShowPreviews,
  onChangeNotificationsEnabled,
  onChangeNotificationsSound,
  onChangeNotificationsBadge,
  onChangeNotificationsPreview,
  onChangeDndEnabled,
  onChangeDndStartHour,
  onChangeDndEndHour,
  onToggleAccountNotifications,
  onOpenSystemNotificationSettings,
  onClearDatabase,
  onConnectAccount,
  onDownloadMail,
  onDownloadMailbox,
  onDisconnectAccount,
}: SettingsScreenProps) {
  const [tab, setTab] = useState(0);
  const dark = useColorScheme() === 'dark';
  const tint = useAccent();
  return (
    <View className="flex-1 bg-transparent">
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <VStack spacing={0} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
          <VStack
            spacing={10}
            modifiers={[
              padding({ top: 16, bottom: 12 }),
              background(dark ? '#202426' : PlatformColor('windowBackgroundColor')),
            ]}
          >
            <HStack spacing={10} modifiers={[frame({ maxWidth: Infinity, alignment: 'center' })]}>
              {TABS.map((item, index) => {
                const selected = tab === index;
                return (
                  <Button
                    key={item.id}
                    variant={selected ? 'glassProminent' : 'glass'}
                    color={selected ? tint : undefined}
                    controlSize="regular"
                    onPress={() => setTab(index)}
                    modifiers={[
                      accessibilityLabel(item.label),
                      accessibilityValue(selected ? 'Selected' : ''),
                    ]}
                  >
                    <VStack
                      alignment="center"
                      spacing={5}
                      modifiers={[frame({ width: 68, height: 46 })]}
                    >
                      <SwiftUIImage
                        systemName={item.systemImage}
                        size={19}
                        color={selected ? undefined : 'secondary'}
                      />
                      <SwiftText
                        size={11}
                        weight={selected ? 'semibold' : 'regular'}
                        color={selected ? undefined : 'secondary'}
                      >
                        {item.label}
                      </SwiftText>
                    </VStack>
                  </Button>
                );
              })}
            </HStack>
          </VStack>
          <Form modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]} scrollEnabled>
            {tab === 0 ? (
              <>
                <Section title="Offline mail">
                  <SettingsRow
                    title="Initial mail download"
                    description={`Download up to ${downloadLimit.toLocaleString()} inbox emails per account. New mail syncs automatically afterwards.`}
                    symbol="arrow.down.circle"
                  >
                    <Button
                      controlSize="regular"
                      disabled={!downloadEnabled || isDownloading}
                      onPress={onDownloadMail}
                      variant="glassProminent"
                      color={tint}
                      systemImage="arrow.down"
                    >
                      {isDownloading ? 'Downloading…' : 'Download all'}
                    </Button>
                  </SettingsRow>
                  {isDownloading ? (
                    <VStack
                      alignment="leading"
                      spacing={10}
                      modifiers={[frame({ maxWidth: Infinity }), padding({ top: 8, bottom: 8 })]}
                    >
                      <SwiftText color="secondary" size={12}>
                        {downloadStatus}
                      </SwiftText>
                      <LinearProgress progress={downloadFraction ?? null} color={tint} />
                    </VStack>
                  ) : null}
                </Section>
                <Section title="Mailboxes">
                  {accounts.map((account) => (
                    <SettingsRow
                      key={account.id}
                      title={account.email}
                      description={
                        isDownloading && downloadingAccountId === account.id
                          ? downloadStatus
                          : 'Download inbox mail for this account.'
                      }
                      symbol="tray"
                    >
                      <Button
                        controlSize="regular"
                        disabled={isDownloading}
                        onPress={() => onDownloadMailbox(account)}
                        variant="glass"
                        systemImage="arrow.down"
                        modifiers={[accessibilityLabel(`Download mail for ${account.email}`)]}
                      >
                        {isDownloading && downloadingAccountId === account.id
                          ? 'Downloading…'
                          : 'Download'}
                      </Button>
                    </SettingsRow>
                  ))}
                  {!accounts.length ? (
                    <SettingsRow
                      title="No mailboxes connected"
                      description="Add a Gmail account in Accounts to start downloading mail."
                      symbol="tray"
                    />
                  ) : null}
                </Section>
              </>
            ) : null}

            {tab === 1 ? (
              <Section title="Inbox appearance">
                <SettingsRow
                  title="Show message previews"
                  description="Include a short excerpt below each email’s subject."
                  symbol="text.alignleft"
                >
                  <Switch
                    onValueChange={onChangeShowPreviews}
                    value={preferences.showPreviews}
                    color={tint}
                    modifiers={[accessibilityLabel('Show message previews'), frame({ width: 40 })]}
                  />
                </SettingsRow>
              </Section>
            ) : null}

            {tab === 2 ? (
              <>
                <Section title="New mail">
                  <SettingsRow
                    title="Notify about new mail"
                    description={
                      notificationsSupported
                        ? 'Show a system notification when new mail arrives. The first prompt registers Miwa in System Settings \u2013 Notifications.'
                        : 'Notifications need a macOS build of Miwa.'
                    }
                    symbol="bell.badge"
                  >
                    <Switch
                      onValueChange={onChangeNotificationsEnabled}
                      value={preferences.notificationsEnabled}
                      color={tint}
                      modifiers={[
                        accessibilityLabel('Notify about new mail'),
                        frame({ width: 40 }),
                      ]}
                    />
                  </SettingsRow>
                  {preferences.notificationsEnabled &&
                  notificationsSupported &&
                  notificationPermission === 'denied' ? (
                    <SettingsRow
                      title="Notifications are blocked"
                      description="Allow Miwa in System Settings \u2013 Notifications to receive new-mail alerts."
                      symbol="exclamationmark.triangle"
                    >
                      <Button
                        controlSize="regular"
                        onPress={onOpenSystemNotificationSettings}
                        variant="glassProminent"
                        color={tint}
                        systemImage="gear"
                      >
                        Open Settings
                      </Button>
                    </SettingsRow>
                  ) : null}
                </Section>
                <Section title="Alerts">
                  <SettingsRow
                    title="Play a sound"
                    description="Ping when a new-mail notification arrives."
                    symbol="speaker.wave.2"
                  >
                    <Switch
                      onValueChange={onChangeNotificationsSound}
                      value={preferences.notificationsSound}
                      color={tint}
                      modifiers={[accessibilityLabel('Play a sound'), frame({ width: 40 })]}
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Show unread badge"
                    description="Mirror the unread count on the Dock icon."
                    symbol="app.badge"
                  >
                    <Switch
                      onValueChange={onChangeNotificationsBadge}
                      value={preferences.notificationsBadge}
                      color={tint}
                      modifiers={[accessibilityLabel('Show unread badge'), frame({ width: 40 })]}
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Show sender and subject"
                    description="Turn off to keep notifications generic."
                    symbol="envelope.open"
                  >
                    <Switch
                      onValueChange={onChangeNotificationsPreview}
                      value={preferences.notificationsShowPreview}
                      color={tint}
                      modifiers={[
                        accessibilityLabel('Show sender and subject'),
                        frame({ width: 40 }),
                      ]}
                    />
                  </SettingsRow>
                </Section>
                <Section title="Mailboxes">
                  {accounts.map((account) => (
                    <SettingsRow
                      key={account.id}
                      title={account.email}
                      description="Notify about new mail in this inbox."
                      symbol="tray"
                    >
                      <Switch
                        onValueChange={(value) => onToggleAccountNotifications(account, value)}
                        value={preferences.notifiedAccountIds[account.id] ?? true}
                        color={tint}
                        modifiers={[
                          accessibilityLabel(`Notify about ${account.email}`),
                          frame({ width: 40 }),
                        ]}
                      />
                    </SettingsRow>
                  ))}
                  {!accounts.length ? (
                    <SettingsRow
                      title="No mailboxes connected"
                      description="Add a Gmail account in Accounts to choose which inboxes notify."
                      symbol="tray"
                    />
                  ) : null}
                </Section>
                <Section title="Quiet hours">
                  <SettingsRow
                    title="Silence at night"
                    description="Hold notifications during the hours below."
                    symbol="moon"
                  >
                    <Switch
                      onValueChange={onChangeDndEnabled}
                      value={preferences.notificationsDndEnabled}
                      color={tint}
                      modifiers={[accessibilityLabel('Silence at night'), frame({ width: 40 })]}
                    />
                  </SettingsRow>
                  <DndHourStepper
                    hour={preferences.notificationsDndStartHour}
                    label="Quiet from"
                    disabled={!preferences.notificationsDndEnabled}
                    onChange={onChangeDndStartHour}
                  />
                  <DndHourStepper
                    hour={preferences.notificationsDndEndHour}
                    label="Quiet until"
                    disabled={!preferences.notificationsDndEnabled}
                    onChange={onChangeDndEndHour}
                  />
                </Section>
              </>
            ) : null}

            {tab === 3 ? (
              <Section title="Connected accounts">
                {accounts.map((account) => (
                  <SettingsRow
                    key={account.id}
                    title={account.displayName || 'Gmail'}
                    description={account.email}
                    symbol="person.crop.circle"
                  >
                    <Button
                      controlSize="regular"
                      disabled={isDownloading}
                      onPress={() => onDisconnectAccount(account)}
                      role="destructive"
                      variant="glass"
                      systemImage="minus.circle"
                      modifiers={[accessibilityLabel(`Remove ${account.email}`)]}
                    >
                      Remove
                    </Button>
                  </SettingsRow>
                ))}
                {!accounts.length ? (
                  <SettingsRow
                    title="Connect your first account"
                    description="Add a Gmail account to bring its inbox into Miwa."
                    symbol="person.crop.circle.badge.plus"
                  />
                ) : null}
                <SettingsRow title="Add a Gmail account" symbol="person.crop.circle.badge.plus">
                  <Button
                    controlSize="regular"
                    onPress={onConnectAccount}
                    variant="glassProminent"
                    color={tint}
                    systemImage="plus"
                  >
                    Add account
                  </Button>
                </SettingsRow>
                {connectError ? (
                  <SwiftText color="red" size={12} modifiers={[padding({ top: 8, bottom: 8 })]}>
                    {connectError}
                  </SwiftText>
                ) : null}
              </Section>
            ) : null}

            {tab === 4 ? (
              <>
                <Section title="Storage">
                  <SettingsRow
                    title="Clear local data"
                    description="Remove downloaded messages, attachments and sync history, and reset preferences. Your Gmail accounts remain connected."
                    symbol="internaldrive"
                  >
                    <Button
                      controlSize="regular"
                      disabled={!clearEnabled || isClearingData}
                      onPress={onClearDatabase}
                      role="destructive"
                      variant="glass"
                      systemImage="trash"
                    >
                      {isClearingData ? 'Clearing…' : 'Clear data…'}
                    </Button>
                  </SettingsRow>
                </Section>
                <Section title="About">
                  <SettingsRow
                    title="Miwa"
                    description="Your Gmail inboxes, together on your Mac."
                    symbol="envelope"
                  >
                    <SwiftText color="secondary" size={12}>
                      Version 0.0.1
                    </SwiftText>
                  </SettingsRow>
                </Section>
              </>
            ) : null}
          </Form>
        </VStack>
      </Host>
    </View>
  );
}
