import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ThreadDetail } from './thread-detail';
import { loadThreadDetail } from './thread-store';
import type { MailThreadDetail } from './types';

export function NotificationEmail({
  accountId,
  threadId,
}: {
  accountId: string;
  threadId: string;
}) {
  const [detail, setDetail] = useState<MailThreadDetail>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void loadThreadDetail(accountId, threadId).then(
      (value) => {
        if (active) setDetail(value);
      },
      (reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Could not open this email.');
      },
    );
    return () => {
      active = false;
    };
  }, [accountId, threadId]);
  return (
    <View style={{ flex: 1 }}>
      <ThreadDetail detail={detail} loading={!detail && !error} error={error} />
    </View>
  );
}
