import { describe, expect, mock, test } from 'bun:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { MailThreadDetail, MailThreadSummary } from './types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const thread: MailThreadSummary = {
  accountId: 'account',
  threadId: 'one',
  sender: 'Sender',
  subject: 'Subject',
  snippet: '',
  receivedAt: 1,
  unread: true,
  pinned: false,
  messageCount: 1,
  category: 'primary',
};
let storedThreads = [thread];
let failGmail = false;
let failLocalWrite = false;
let detailLoads = 0;
let gatekeeperLoads = 0;
let syncRuns = 0;
let syncStops = 0;
let detailRequest = async (accountId: string, threadId: string): Promise<MailThreadDetail> => ({
  accountId,
  threadId,
  subject: threadId,
  messages: [],
});

mock.module('react-native', () => ({ Alert: { alert() {} } }));
mock.module('../db/db', () => ({
  clearLocalDatabase() {
    storedThreads = [];
  },
}));
mock.module('./thread-store', () => ({
  loadThreads: async () => storedThreads,
  loadThreadDetail: (accountId: string, threadId: string) => {
    detailLoads++;
    return detailRequest(accountId, threadId);
  },
  setThreadReadState: async () => {
    if (failLocalWrite) throw new Error('Disk unavailable');
  },
  setThreadPinnedState: async () => {
    if (failLocalWrite) throw new Error('Disk unavailable');
  },
  removeInboxThread: async () => undefined,
}));
mock.module('./gmail', () => ({
  withGmailReauth: async (_accountId: string, action: () => Promise<void>) => action(),
  setGmailThreadReadState: async () => {
    if (failGmail) throw new Error('Gmail unavailable');
  },
  archiveGmailThread: async () => {
    if (failGmail) throw new Error('Gmail unavailable');
  },
}));
mock.module('./gatekeeper', () => ({
  loadGatekeeperOverview: async () => {
    gatekeeperLoads++;
    return { activatedAt: 1, pending: [], blocked: [] };
  },
  setGatekeeperSenderStatus: async () => undefined,
}));
mock.module('./sync', () => ({
  startInboxSync: () => ({
    runNow() {
      syncRuns++;
    },
    stop() {
      syncStops++;
    },
  }),
}));

const { useMailbox } = await import('./use-mailbox');

async function mountMailbox() {
  let mailbox!: ReturnType<typeof useMailbox>;
  let root!: ReactTestRenderer;
  function TestMailbox() {
    mailbox = useMailbox();
    return null;
  }
  await act(async () => {
    root = create(<TestMailbox />);
  });
  return {
    get current() {
      return mailbox;
    },
    unmount: () => act(async () => root.unmount()),
  };
}

describe('mailbox state', () => {
  test('restores rejected message actions and keeps Gmail-confirmed changes if the local write fails', async () => {
    const mailbox = await mountMailbox();
    try {
      await act(async () => mailbox.current.setSelectedThread(thread));
      const initialDetailLoads = detailLoads;
      failGmail = true;
      await act(async () => mailbox.current.toggleRead(thread));
      expect(mailbox.current.threads?.[0].unread).toBe(true);
      expect(mailbox.current.selectedThread?.unread).toBe(true);
      expect(mailbox.current.busyAction).toBe(undefined);
      await act(async () => mailbox.current.archiveThread(thread));
      expect(mailbox.current.threads).toEqual([thread]);

      failGmail = false;
      failLocalWrite = true;
      const initialSyncRuns = syncRuns;
      await act(async () => mailbox.current.toggleRead(thread));
      expect(mailbox.current.threads?.[0].unread).toBe(false);
      expect(mailbox.current.selectedThread?.unread).toBe(false);
      expect(syncRuns).toBe(initialSyncRuns + 1);
      await act(async () => mailbox.current.setPinned(thread, true));
      expect(mailbox.current.threads?.[0].pinned).toBe(false);
      expect(detailLoads).toBe(initialDetailLoads);
    } finally {
      failGmail = false;
      failLocalWrite = false;
      await mailbox.unmount();
    }
  });

  test('ignores an earlier conversation load when another conversation is selected', async () => {
    const previousRequest = detailRequest;
    let resolveFirst!: (detail: MailThreadDetail) => void;
    detailRequest = async (accountId, threadId) =>
      threadId === 'one'
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : { accountId, threadId, subject: threadId, messages: [] };
    const mailbox = await mountMailbox();
    try {
      await act(async () => mailbox.current.setSelectedThread(thread));
      await act(async () => mailbox.current.setSelectedThread({ ...thread, threadId: 'two' }));
      await act(async () =>
        resolveFirst({ accountId: 'account', threadId: 'one', subject: 'Old', messages: [] }),
      );
      expect(mailbox.current.detail?.threadId).toBe('two');
      await act(async () => mailbox.current.setSelectedThread(undefined));
      expect(mailbox.current.detail).toBe(undefined);
      expect(mailbox.current.detailLoading).toBe(false);
    } finally {
      detailRequest = previousRequest;
      await mailbox.unmount();
    }
  });

  test('refreshes Gatekeeper once per decision and stops syncing before clearing local mail', async () => {
    const mailbox = await mountMailbox();
    try {
      const initialGatekeeperLoads = gatekeeperLoads;
      await act(async () =>
        mailbox.current.decideGatekeeperSender('sender@example.com', 'blocked'),
      );
      expect(gatekeeperLoads).toBe(initialGatekeeperLoads + 1);
      expect(mailbox.current.gatekeeperActionEmail).toBe(undefined);
      await act(async () => mailbox.current.setSelectedThread(thread));
      const initialSyncStops = syncStops;
      await act(async () => mailbox.current.resetMailbox());
      expect(syncStops > initialSyncStops).toBe(true);
      expect(mailbox.current.threads).toEqual([]);
      expect(mailbox.current.selectedThread).toBe(undefined);
      expect(mailbox.current.detail).toBe(undefined);
      expect(mailbox.current.syncing).toBe(false);
    } finally {
      storedThreads = [thread];
      await mailbox.unmount();
    }
  });
});
