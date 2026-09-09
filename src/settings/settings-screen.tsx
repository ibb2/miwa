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
  onChangeShowPreviews: (value: boolean) => void;
  onClearDatabase: () => void;
  onConnectAccount: () => void;
  onDownloadMail: () => void;
  onDownloadMailbox: (account: ConnectedAccount) => void;
  onDisconnectAccount: (account: ConnectedAccount) => void;
};

const TABS = [
  { id: 'offline', label: 'Offline', systemImage: 'arrow.down.circle' },
  { id: 'inbox', label: 'Inbox', systemImage: 'tray.full' },
  { id: 'accounts', label: 'Accounts', systemImage: 'person.crop.circle' },
  { id: 'data', label: 'Data', systemImage: 'internaldrive' },
] as const;

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
  onChangeShowPreviews,
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

            {tab === 3 ? (
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
