import { Alert } from 'react-native';
import { emitSettingsChanged } from '../settings/settings-events';
import { downloadInbox } from './download-inbox';
import { messageFor } from './async';
import type { ConnectedAccount } from './types';

export type DownloadState = {
  fraction: number;
  label: string;
  accountId: string;
};

let download: DownloadState | undefined;
const listeners = new Set<() => void>();

export function getInboxDownload(): DownloadState | undefined {
  return download;
}

export function subscribeInboxDownload(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(state: DownloadState | undefined): void {
  download = state;
  for (const listener of listeners) listener();
}

// Owned by the shared React host, independently of either window's mounted views.
export async function downloadAccounts(targets: readonly ConnectedAccount[]): Promise<void> {
  if (download || targets.length === 0) return;
  const accounts = [...new Map(targets.map((account) => [account.id, account])).values()];
  const totals = { selected: 0, messages: 0, attachments: 0 };
  publish({ fraction: 0, accountId: accounts[0].id, label: `Preparing ${accounts[0].email}…` });
  let failure: string | undefined;
  try {
    for (const [index, account] of accounts.entries()) {
      let lastProgressUpdate = 0;
      publish({
        fraction: index / accounts.length,
        accountId: account.id,
        label: `Scanning ${account.email} (${index + 1} of ${accounts.length})`,
      });
      const result = await downloadInbox(account.id, {
        onProgress: (progress) => {
          const now = Date.now();
          if (progress.phase !== 'complete' && now - lastProgressUpdate < 500) return;
          lastProgressUpdate = now;
          publish({
            fraction: (index + progress.fraction) / accounts.length,
            accountId: account.id,
            label:
              progress.phase === 'listing'
                ? `Scanning ${account.email} (${index + 1} of ${accounts.length})`
                : `Downloading ${account.email} (${index + 1} of ${accounts.length}): ` +
                  `${progress.threadsDownloaded.toLocaleString()} of ${progress.totalThreads.toLocaleString()} conversations`,
          });
        },
      });
      totals.selected += result.inboxEmailsSelected;
      totals.messages += result.messagesStored;
      totals.attachments += result.attachmentsStored;
    }
  } catch (error) {
    failure = messageFor(error);
  } finally {
    publish(undefined);
    // Refresh partial downloads too, including when the initiating window has closed.
    emitSettingsChanged({ kind: 'download-complete' });
  }
  if (failure !== undefined) {
    Alert.alert('Inbox download failed', failure);
  } else {
    Alert.alert(
      'Inbox download complete',
      `${totals.selected.toLocaleString()} INBOX emails selected across ${accounts.length.toLocaleString()} ` +
        `${accounts.length === 1 ? 'inbox' : 'inboxes'}. ${totals.messages.toLocaleString()} conversation messages ` +
        `and ${totals.attachments.toLocaleString()} attachments are available offline.`,
    );
  }
}
