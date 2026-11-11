import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  getNotificationPermission,
  openSystemNotificationSettings,
  requestNotificationPermission,
  supportsLocalNotifications,
  type NotificationPermissionStatus,
} from '../../modules/native-local-notifications/src';
import { useAccounts } from '../mail/use-accounts';
import { useInboxDownload } from '../mail/use-inbox-download';
import { DEFAULT_INBOX_DOWNLOAD_LIMIT } from '../mail/download-inbox';
import { clearLocalDatabase } from '../db/db';
import { messageFor } from '../mail/async';
import type { ConnectedAccount } from '../mail/types';
import {
  loadMailPreferences,
  saveAccountNotified,
  saveNotificationPreferences,
  saveShowPreviews,
} from './preferences';
import { emitSettingsChanged } from './settings-events';
import { SettingsScreen } from './settings-screen';

/**
 * Standalone root for the separate native macOS settings window
 * (registered as `MiwaSettings`). Mounted fresh on every open, with state
 * shared back to the main window through sqlite plus settings events.
 */
export function SettingsApp() {
  const [preferences, setPreferences] = useState(loadMailPreferences);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionStatus>('notDetermined');
  const [clearing, setClearing] = useState(false);

  const { accounts, connectError, connectAccount, disconnectAccount } = useAccounts(() => {
    emitSettingsChanged({ kind: 'accounts' });
  });
  const { download, downloadAccounts } = useInboxDownload();

  useEffect(() => {
    if (!supportsLocalNotifications()) return;
    void getNotificationPermission().then(setNotificationPermission, () =>
      setNotificationPermission('denied'),
    );
  }, []);

  const refreshPreferences = useCallback(() => {
    setPreferences(loadMailPreferences());
    emitSettingsChanged({ kind: 'preferences' });
  }, []);

  const connectAndNotify = useCallback(async () => {
    const account = await connectAccount();
    if (account) emitSettingsChanged({ kind: 'accounts' });
  }, [connectAccount]);

  const changeShowPreviews = useCallback(
    (value: boolean) => {
      saveShowPreviews(value);
      refreshPreferences();
    },
    [refreshPreferences],
  );

  const changeNotificationsEnabled = useCallback(
    async (value: boolean) => {
      saveNotificationPreferences({ notificationsEnabled: value });
      refreshPreferences();
      if (value && supportsLocalNotifications()) {
        const status = await requestNotificationPermission();
        setNotificationPermission(status);
      }
    },
    [refreshPreferences],
  );

  const patchNotifications = useCallback(
    (patch: Parameters<typeof saveNotificationPreferences>[0]) => {
      saveNotificationPreferences(patch);
      refreshPreferences();
    },
    [refreshPreferences],
  );

  const toggleAccountNotifications = useCallback(
    (account: ConnectedAccount, value: boolean) => {
      saveAccountNotified(account.id, value);
      refreshPreferences();
    },
    [refreshPreferences],
  );

  const openNotificationSettings = useCallback(() => {
    void openSystemNotificationSettings();
  }, []);

  const clearDatabase = useCallback(() => {
    Alert.alert(
      'Clear all local data?',
      'Every downloaded message and attachment, cached account record, sync cursor, and preference ' +
        'will be removed from Miwa. Your Gmail accounts and Gmail messages will not be changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: () => {
            setClearing(true);
            try {
              clearLocalDatabase();
              setPreferences(loadMailPreferences());
              emitSettingsChanged({ kind: 'database-cleared' });
              Alert.alert('Local data cleared', 'Miwa is ready for a fresh download.');
            } catch (error) {
              Alert.alert('Could not clear local data', messageFor(error));
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  }, []);

  return (
    <View className="flex-1 bg-transparent">
      <SettingsScreen
        accounts={accounts ?? []}
        clearEnabled={!download && !clearing}
        connectError={connectError}
        downloadEnabled={(accounts ?? []).length > 0}
        downloadFraction={download?.fraction}
        downloadLimit={DEFAULT_INBOX_DOWNLOAD_LIMIT}
        downloadStatus={download?.label ?? ''}
        downloadingAccountId={download?.accountId}
        isClearingData={clearing}
        isDownloading={download !== undefined}
        onChangeShowPreviews={changeShowPreviews}
        onChangeNotificationsEnabled={(value) => void changeNotificationsEnabled(value)}
        onChangeNotificationsSound={(value) => patchNotifications({ notificationsSound: value })}
        onChangeNotificationsBadge={(value) => patchNotifications({ notificationsBadge: value })}
        onChangeNotificationsPreview={(value) =>
          patchNotifications({ notificationsShowPreview: value })
        }
        onChangeDndEnabled={(value) => patchNotifications({ notificationsDndEnabled: value })}
        onChangeDndStartHour={(value) => patchNotifications({ notificationsDndStartHour: value })}
        onChangeDndEndHour={(value) => patchNotifications({ notificationsDndEndHour: value })}
        onToggleAccountNotifications={toggleAccountNotifications}
        onOpenSystemNotificationSettings={openNotificationSettings}
        onClearDatabase={clearDatabase}
        onConnectAccount={() => void connectAndNotify()}
        onDownloadMail={() => void downloadAccounts(accounts ?? [])}
        onDownloadMailbox={(account) => void downloadAccounts([account])}
        onDisconnectAccount={disconnectAccount}
        preferences={preferences}
        notificationPermission={notificationPermission}
        notificationsSupported={supportsLocalNotifications()}
      />
    </View>
  );
}
