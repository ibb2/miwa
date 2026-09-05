import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { clearLocalDatabase } from '../db/db';
import { messageFor } from './async';
import {
  loadGatekeeperOverview,
  setGatekeeperSenderStatus,
  type GatekeeperOverview,
  type GatekeeperStatus,
} from './gatekeeper';
import { archiveGmailThread, setGmailThreadReadState, withGmailReauth } from './gmail';
import {
  loadThreadDetail,
  loadThreads,
  removeInboxThread,
  setThreadPinnedState,
  setThreadReadState,
} from './thread-store';
import { startInboxSync, type SyncController } from './sync';
import type { MailThreadDetail, MailThreadSummary } from './types';

export function useMailbox() {
  const syncRef = useRef<SyncController>(null);
  const [threads, setThreads] = useState<MailThreadSummary[]>();
  const [threadsError, setThreadsError] = useState<string>();
  const [selectedThread, setSelectedThread] = useState<MailThreadSummary>();
  const [detail, setDetail] = useState<MailThreadDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [gatekeeper, setGatekeeper] = useState<GatekeeperOverview>();
  const [gatekeeperLoading, setGatekeeperLoading] = useState(true);
  const [gatekeeperError, setGatekeeperError] = useState<string>();
  const [gatekeeperActionEmail, setGatekeeperActionEmail] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState('Check Gmail for new mail');
  const [syncRevision, setSyncRevision] = useState(0);
  const [busyAction, setBusyAction] = useState<string>();

  const refreshGatekeeper = useCallback(async (showLoading = true) => {
    if (showLoading) setGatekeeperLoading(true);
    setGatekeeperError(undefined);
    try {
      setGatekeeper(await loadGatekeeperOverview());
    } catch (error) {
      setGatekeeperError(messageFor(error));
    } finally {
      setGatekeeperLoading(false);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    setThreadsError(undefined);
    try {
      setThreads(await loadThreads());
      await refreshGatekeeper(false);
    } catch (error) {
      setThreads([]);
      setThreadsError(messageFor(error));
    }
  }, [refreshGatekeeper]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const accountId = selectedThread?.accountId;
  const threadId = selectedThread?.threadId;
  useEffect(() => {
    if (!accountId || !threadId) {
      setDetail(undefined);
      setDetailError(undefined);
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetail(undefined);
    setDetailError(undefined);
    setDetailLoading(true);
    loadThreadDetail(accountId, threadId)
      .then((loaded) => {
        if (active) setDetail(loaded);
      })
      .catch((error) => {
        if (active) setDetailError(messageFor(error));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, threadId]);

  // Poll Gmail for changes; refresh the list whenever a sync cycle changed mail.
  useEffect(() => {
    const sync = startInboxSync({
      onCycleStart: () => {
        setSyncing(true);
        setSyncLabel('Checking Gmail for new mail…');
      },
      onCycleComplete: (cycle) => {
        const changed = cycle.accounts.some(
          (account) => account.threadsUpserted > 0 || account.threadsRemoved > 0,
        );
        if (changed) void refreshThreads();
        setSyncLabel(
          cycle.failures.length > 0
            ? 'Mail sync finished with errors'
            : changed
              ? 'Mail updated'
              : 'Mail is up to date',
        );
      },
      onError: () => setSyncLabel('Mail sync failed'),
      onCycleEnd: () => setSyncing(false),
    });
    syncRef.current = sync;
    return () => {
      if (syncRef.current === sync) syncRef.current = null;
      sync.stop();
    };
  }, [refreshThreads, syncRevision]);

  const decideGatekeeperSender = useCallback(
    async (email: string, status: GatekeeperStatus) => {
      setGatekeeperActionEmail(email);
      setGatekeeperError(undefined);
      try {
        await setGatekeeperSenderStatus(email, status);
        await refreshThreads();
      } catch (error) {
        setGatekeeperError(messageFor(error));
        Alert.alert('Could not update Gatekeeper', messageFor(error));
      } finally {
        setGatekeeperActionEmail(undefined);
      }
    },
    [refreshThreads],
  );

  // Update the list immediately, restoring it if Gmail rejects the action.

  const patchThread = useCallback(
    (thread: MailThreadSummary, patch: Partial<MailThreadSummary>) => {
      const matches = (item: MailThreadSummary) =>
        item.accountId === thread.accountId && item.threadId === thread.threadId;
      setThreads((current) =>
        current?.map((item) => (matches(item) ? { ...item, ...patch } : item)),
      );
      setSelectedThread((current) =>
        current && matches(current) ? { ...current, ...patch } : current,
      );
    },
    [],
  );

  const toggleRead = useCallback(
    async (thread: MailThreadSummary) => {
      const key = `read:${thread.accountId}:${thread.threadId}`;
      if (busyAction === key) return;
      const unread = !thread.unread;

      setBusyAction(key);
      patchThread(thread, { unread });
      let gmailUpdated = false;
      try {
        await withGmailReauth(thread.accountId, () =>
          setGmailThreadReadState(thread.accountId, thread.threadId, unread),
        );
        gmailUpdated = true;
        await setThreadReadState(thread.accountId, thread.threadId, unread);
        syncRef.current?.runNow();
      } catch (error) {
        if (!gmailUpdated) patchThread(thread, { unread: thread.unread });
        else syncRef.current?.runNow();
        Alert.alert(
          gmailUpdated ? 'Gmail updated, but Miwa could not refresh' : 'Could not update Gmail',
          messageFor(error),
        );
      } finally {
        setBusyAction((current) => (current === key ? undefined : current));
      }
    },
    [busyAction, patchThread],
  );

  const archiveThread = useCallback(
    async (thread: MailThreadSummary) => {
      const key = `archive:${thread.accountId}:${thread.threadId}`;
      if (busyAction === key) return;

      setBusyAction(key);
      setThreads((current) =>
        current?.filter(
          (item) => item.accountId !== thread.accountId || item.threadId !== thread.threadId,
        ),
      );
      let gmailUpdated = false;
      try {
        await withGmailReauth(thread.accountId, () =>
          archiveGmailThread(thread.accountId, thread.threadId),
        );
        gmailUpdated = true;
        await removeInboxThread(thread.accountId, thread.threadId);
        void refreshGatekeeper(false);
        syncRef.current?.runNow();
      } catch (error) {
        await refreshThreads();
        if (gmailUpdated) syncRef.current?.runNow();
        Alert.alert(
          gmailUpdated
            ? 'Gmail archived the conversation, but Miwa could not refresh'
            : 'Could not archive conversation',
          messageFor(error),
        );
      } finally {
        setBusyAction((current) => (current === key ? undefined : current));
      }
    },
    [busyAction, refreshGatekeeper, refreshThreads],
  );

  const setPinned = useCallback(
    async (thread: MailThreadSummary, pinned: boolean) => {
      const key = `pin:${thread.accountId}:${thread.threadId}`;
      if (busyAction === key) return;

      setBusyAction(key);
      patchThread(thread, { pinned });
      try {
        await setThreadPinnedState(thread.accountId, thread.threadId, pinned);
      } catch (error) {
        patchThread(thread, { pinned: thread.pinned });
        Alert.alert('Could not update pin', messageFor(error));
      } finally {
        setBusyAction((current) => (current === key ? undefined : current));
      }
    },
    [busyAction, patchThread],
  );

  const resetMailbox = useCallback(() => {
    syncRef.current?.stop();
    syncRef.current = null;
    try {
      clearLocalDatabase();
      setThreads([]);
      setThreadsError(undefined);
      setSelectedThread(undefined);
      setDetail(undefined);
      setDetailError(undefined);
      setSyncing(false);
      setSyncLabel('No downloaded mail to sync');
      void refreshGatekeeper();
    } finally {
      setSyncRevision((current) => current + 1);
    }
  }, [refreshGatekeeper]);

  return {
    threads,
    threadsError,
    refreshThreads,
    selectedThread,
    setSelectedThread,
    detail,
    detailLoading,
    detailError,
    busyAction,
    toggleRead,
    archiveThread,
    setPinned,
    gatekeeper,
    gatekeeperLoading,
    gatekeeperError,
    gatekeeperActionEmail,
    refreshGatekeeper,
    decideGatekeeperSender,
    syncing,
    syncLabel,
    resetMailbox,
  };
}
