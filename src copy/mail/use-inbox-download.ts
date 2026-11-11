import { useSyncExternalStore } from 'react';
import {
  downloadAccounts,
  getInboxDownload,
  subscribeInboxDownload,
} from './inbox-download-manager';

export function useInboxDownload() {
  const download = useSyncExternalStore(subscribeInboxDownload, getInboxDownload, getInboxDownload);
  return { download, downloadAccounts };
}
