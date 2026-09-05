import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { gmailAccountAuth, loadAccountAvatars } from './accounts';
import type { ConnectedAccount } from './types';
import { messageFor } from './async';

export function useAccounts(onDisconnected: (accountId: string) => void) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>();
  const [avatarData, setAvatarData] = useState<Record<string, string>>({});
  const [connectError, setConnectError] = useState<string>();

  useEffect(() => {
    let active = true;
    gmailAccountAuth
      .listAccounts()
      .then((connected) => {
        if (active) setAccounts(connected);
      })
      .catch((error) => {
        if (active) {
          setAccounts([]);
          Alert.alert('Unable to load Gmail accounts', messageFor(error));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!accounts?.length) return;
    let active = true;
    void loadAccountAvatars(accounts).then((loaded) => {
      if (active) setAvatarData((current) => ({ ...current, ...loaded }));
    });
    return () => {
      active = false;
    };
  }, [accounts]);

  const connectAccount = useCallback(async () => {
    setConnectError(undefined);
    try {
      const account = await gmailAccountAuth.connectAccount();
      setAccounts((current) =>
        [...(current ?? []).filter((item) => item.id !== account.id), account].sort(
          (a, b) => a.order - b.order,
        ),
      );
      return account;
    } catch (error) {
      const message = messageFor(error);
      setConnectError(message);
      Alert.alert('Could not connect Gmail', message);
    }
  }, []);

  const disconnectAccount = useCallback(
    (account: ConnectedAccount) => {
      Alert.alert(
        'Remove Gmail account?',
        `${account.email} will be removed from Miwa. Your Gmail data will not be deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void gmailAccountAuth
                .disconnectAccount(account.id)
                .then(() => {
                  setAccounts((current) => current?.filter((item) => item.id !== account.id));
                  onDisconnected(account.id);
                })
                .catch((error) => Alert.alert('Could not disconnect Gmail', messageFor(error)));
            },
          },
        ],
      );
    },
    [onDisconnected],
  );

  return { accounts, avatarData, connectError, connectAccount, disconnectAccount };
}
