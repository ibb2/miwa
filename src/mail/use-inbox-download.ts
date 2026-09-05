import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { downloadInbox } from './download-inbox';
import type { ConnectedAccount } from './types';
import { messageFor } from './async';

/** Download progress; undefined while no download is running. */
type DownloadState = {
  fraction: number;
  label: string;
  accountId?: string;
};

export function useInboxDownload(refreshThreads: () => Promise<void>) {
  const downloadActiveRef = useRef(false);
  const lastProgressUpdateRef = useRef(0);
  const [download, setDownload] = useState<DownloadState>();

  const downloadAccounts = useCallback(
    async (targets: readonly ConnectedAccount[]) => {
      if (downloadActiveRef.current || targets.length === 0) return;
      downloadActiveRef.current = true;
      lastProgressUpdateRef.current = 0;
      const totals = { selected: 0, messages: 0, attachments: 0 };

      try {
        for (const [index, account] of targets.entries()) {
          const result = await downloadInbox(account.id, {
            onProgress: (progress) => {
              const now = Date.now();
              if (progress.phase !== 'complete' && now - lastProgressUpdateRef.current < 500) {
                return;
              }
              lastProgressUpdateRef.current = now;
              const position = Math.min(index + 1, targets.length);
              setDownload({
                fraction: (index + progress.fraction) / targets.length,
                accountId: account.id,
                label:
                  progress.phase === 'downloading'
                    ? `Downloading ${account.email} (${position} of ${targets.length}): ` +
                      `${progress.threadsDownloaded.toLocaleString()} of ${progress.totalThreads.toLocaleString()} conversations`
                    : `Scanning ${account.email} (${position} of ${targets.length})`,
              });
            },
          });
          totals.selected += result.inboxEmailsSelected;
          totals.messages += result.messagesStored;
          totals.attachments += result.attachmentsStored;
        }

        await refreshThreads();
        setDownload(undefined);
        Alert.alert(
          'Inbox download complete',
          `${totals.selected.toLocaleString()} INBOX emails selected across ${targets.length.toLocaleString()} ` +
            `${targets.length === 1 ? 'inbox' : 'inboxes'}. ${totals.messages.toLocaleString()} conversation messages ` +
            `and ${totals.attachments.toLocaleString()} attachments are available offline.`,
        );
      } catch (error) {
        setDownload(undefined);
        Alert.alert('Inbox download failed', messageFor(error));
      } finally {
        downloadActiveRef.current = false;
      }
    },
    [refreshThreads],
  );

  return { download, downloadAccounts };
}
