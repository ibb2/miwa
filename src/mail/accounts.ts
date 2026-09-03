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

async function saveCredential(account: NativeConnectedAccount): Promise<ConnectedAccount> {
  try {
    await setItem(account.id, account.credential, credentialOptions);
  } catch {
    await getNativeModule().removeAccountMetadata(account.id);
    throw new Error('Unable to save Gmail authorization securely.');
  }
  const { credential: _credential, ...publicAccount } = account;
  return publicAccount;
}

async function readCredential(accountId: string): Promise<string> {
  const item = await getItem(accountId, credentialOptions);
  if (!item?.value) {
    await getNativeModule().removeAccountMetadata(accountId);
    throw new Error('This Gmail account needs to be connected again.');
  }
  return item.value;
}

/**
 * Connected Gmail accounts. Credentials live in the Keychain via Sensitive
 * Info; the native module keeps only non-secret account metadata.
 */
export const gmailAccountAuth = {
  async listAccounts(): Promise<ConnectedAccount[]> {
    const accounts = await getNativeModule().listAccounts();
    const resolved = await Promise.all(
      accounts.map(async (account) => ({
        account,
        hasCredential: await hasItem(account.id, credentialOptions),
      })),
    );
    await Promise.all(
      resolved
        .filter(({ hasCredential }) => !hasCredential)
        .map(({ account }) => getNativeModule().removeAccountMetadata(account.id)),
    );
    return resolved.filter(({ hasCredential }) => hasCredential).map(({ account }) => account);
  },

  connectAccount: async (): Promise<ConnectedAccount> =>
    saveCredential(await getNativeModule().connectAccount()),

  async getAccessToken(accountId: string, forceRefresh = false): Promise<AccessToken> {
    const credential = await readCredential(accountId);
    const result = await getNativeModule().getAccessToken(accountId, credential, forceRefresh);
    if (result.credential) {
      await setItem(accountId, result.credential, credentialOptions);
    }
    return { accessToken: result.accessToken, expiresAt: result.expiresAt };
  },

  reauthorizeAccount: async (accountId: string): Promise<ConnectedAccount> =>
    saveCredential(await getNativeModule().reauthorizeAccount(accountId)),

  async disconnectAccount(accountId: string): Promise<void> {
    const item = await getItem(accountId, credentialOptions).catch(() => null);
    try {
      await getNativeModule().disconnectAccount(accountId, item?.value);
    } finally {
      await deleteItem(accountId, credentialOptions);
    }
  },
};

/** Up to two uppercase letters used when an account has no profile image. */
export function accountInitials(account: ConnectedAccount): string {
  return (account.displayName || account.email)
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function fetchBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      if (request.status >= 200 && request.status < 300 && request.response instanceof ArrayBuffer) {
        const bytes = new Uint8Array(request.response);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        }
        resolve(globalThis.btoa(binary));
      } else {
        reject(new Error(`Avatar request failed (${request.status})`));
      }
    };
    request.onerror = () => reject(new Error('Avatar request failed.'));
    request.send();
  });
}

/**
 * Downloads account profile images as base64 for the toolbar. Accounts whose
 * image cannot be loaded are skipped; the toolbar falls back to initials.
 */
export async function loadAccountAvatars(
  accounts: readonly ConnectedAccount[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    accounts.map(async (account) => {
      if (!account.avatarUrl) return undefined;
      try {
        return [account.id, await fetchBase64(account.avatarUrl)] as const;
      } catch {
        return undefined;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}
