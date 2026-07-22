import { requireNativeModule } from 'expo';
import {
  deleteItem,
  getItem,
  hasItem,
  setItem,
  type SensitiveInfoOptions,
} from 'react-native-sensitive-info';

import type { ConnectedAccount } from './types';

export type AccessToken = {
  accessToken: string;
  expiresAt: number;
};

type NativeConnectedAccount = ConnectedAccount & { credential: string };
type NativeAccessToken = AccessToken & { credential?: string };

type NativeGmailAccountAuthModule = {
  listAccounts(): Promise<ConnectedAccount[]>;
  connectAccount(): Promise<NativeConnectedAccount>;
  getAccessToken(accountId: string, credential: string, forceRefresh: boolean): Promise<NativeAccessToken>;
  reauthorizeAccount(accountId: string): Promise<NativeConnectedAccount>;
  disconnectAccount(accountId: string, credential?: string): Promise<void>;
  removeAccountMetadata(accountId: string): Promise<void>;
};

type GmailAccountAuth = {
  listAccounts(): Promise<ConnectedAccount[]>;
  connectAccount(): Promise<ConnectedAccount>;
  getAccessToken(accountId: string, forceRefresh?: boolean): Promise<AccessToken>;
  reauthorizeAccount(accountId: string): Promise<ConnectedAccount>;
  disconnectAccount(accountId: string): Promise<void>;
};

const credentialOptions: SensitiveInfoOptions = {
  service: 'com.ib.miwa.gmail-account.secure-v2',
  accessControl: 'none',
  iosSynchronizable: false,
};

let nativeModule: NativeGmailAccountAuthModule | undefined;

function getNativeModule(): NativeGmailAccountAuthModule {
  nativeModule ??= requireNativeModule<NativeGmailAccountAuthModule>('GmailAccountAuth');
  return nativeModule;
}

function publicAccount(account: NativeConnectedAccount): ConnectedAccount {
  const { credential: _credential, ...connectedAccount } = account;
  return connectedAccount;
}

async function saveCredential(account: NativeConnectedAccount): Promise<ConnectedAccount> {
  try {
    await setItem(account.id, account.credential, credentialOptions);
    return publicAccount(account);
  } catch {
    await getNativeModule().removeAccountMetadata(account.id);
    throw new Error('Unable to save Gmail authorization securely.');
  }
}

async function readCredential(accountId: string): Promise<string> {
  const item = await getItem(accountId, credentialOptions);
  if (!item?.value) {
    await getNativeModule().removeAccountMetadata(accountId);
    throw new Error('This Gmail account needs to be connected again.');
  }
  return item.value;
}

export const gmailAccountAuth: GmailAccountAuth = {
  listAccounts: async () => {
    const accounts = await getNativeModule().listAccounts();
    const resolved = await Promise.all(
      accounts.map(async (account) => ({
        account,
        hasCredential: await hasItem(account.id, credentialOptions),
      }))
    );
    await Promise.all(
      resolved
        .filter(({ hasCredential }) => !hasCredential)
        .map(({ account }) => getNativeModule().removeAccountMetadata(account.id))
    );
    return resolved.filter(({ hasCredential }) => hasCredential).map(({ account }) => account);
  },
  connectAccount: async () => saveCredential(await getNativeModule().connectAccount()),
  getAccessToken: async (accountId, forceRefresh = false) => {
    const credential = await readCredential(accountId);
    const result = await getNativeModule().getAccessToken(accountId, credential, forceRefresh);
    if (result.credential) {
      await setItem(accountId, result.credential, credentialOptions);
    }
    return { accessToken: result.accessToken, expiresAt: result.expiresAt };
  },
  reauthorizeAccount: async (accountId) =>
    saveCredential(await getNativeModule().reauthorizeAccount(accountId)),
  disconnectAccount: async (accountId) => {
    const item = await getItem(accountId, credentialOptions).catch(() => null);
    try {
      await getNativeModule().disconnectAccount(accountId, item?.value);
    } finally {
      await deleteItem(accountId, credentialOptions);
    }
  },
};
