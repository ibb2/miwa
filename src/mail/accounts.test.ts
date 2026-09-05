import { describe, expect, mock, test } from 'bun:test';

import type { ConnectedAccount } from './types';

const account = (id: string): ConnectedAccount => ({
  id,
  provider: 'gmail',
  email: `${id}@example.com`,
  displayName: id,
  order: 0,
});

const secrets = new Map<string, string>([['stored', 'stored-credential']]);
const removedMetadata: string[] = [];

const nativeModule = {
  listAccounts: async () => [account('stored'), account('missing')],
  connectAccount: async () => ({ ...account('connected'), credential: 'connected-credential' }),
  reauthorizeAccount: async (id: string) => ({
    ...account(id),
    credential: 'reauthorized-credential',
  }),
  getAccessToken: async () => ({
    accessToken: 'short-lived-token',
    expiresAt: 123,
    credential: 'refreshed-credential',
  }),
  disconnectAccount: async () => undefined,
  removeAccountMetadata: async (id: string) => {
    removedMetadata.push(id);
  },
};

mock.module('expo', () => ({ requireNativeModule: () => nativeModule }));
mock.module('react-native-sensitive-info', () => ({
  setItem: async (key: string, value: string) => {
    secrets.set(key, value);
    return { metadata: {} };
  },
  getItem: async (key: string) => {
    const value = secrets.get(key);
    return value ? { key, service: 'test', value, metadata: {} } : null;
  },
  hasItem: async (key: string) => secrets.has(key),
  deleteItem: async (key: string) => secrets.delete(key),
}));

const { gmailAccountAuth } = await import('./accounts');

describe('Gmail credential storage', () => {
  test('stores, refreshes, reconciles, and deletes credentials through Sensitive Info', async () => {
    expect((await gmailAccountAuth.listAccounts()).map(({ id }) => id)).toEqual(['stored']);
    expect(removedMetadata).toEqual(['missing']);

    const connected = await gmailAccountAuth.connectAccount();
    expect(connected.id).toBe('connected');
    expect(secrets.get('connected')).toBe('connected-credential');

    expect(await gmailAccountAuth.getAccessToken('connected')).toEqual({
      accessToken: 'short-lived-token',
      expiresAt: 123,
    });
    expect(secrets.get('connected')).toBe('refreshed-credential');

    await gmailAccountAuth.disconnectAccount('connected');
    expect(secrets.has('connected')).toBe(false);
  });
});
