import { Alert, Linking } from 'react-native';
import { loadThreadDetail } from './thread-store';

export async function composeMessage(
  accountId: string,
  threadId: string,
  ownEmail: string | undefined,
  action: 'reply' | 'reply-all' | 'forward',
  messageId?: string,
) {
  try {
    const detail = await loadThreadDetail(accountId, threadId);
    const message = messageId
      ? detail.messages.find((item) => item.id === messageId)
      : detail.messages.at(-1);
    if (!message) throw new Error('This message is no longer available.');
    const replyTo = message.addresses.filter((item) => item.kind === 'replyTo');
    const sender = replyTo.length
      ? replyTo
      : message.addresses.filter((item) => item.kind === 'from');
    const addresses =
      action === 'forward'
        ? []
        : action === 'reply-all'
          ? [
              ...sender,
              ...message.addresses.filter((item) => item.kind === 'to' || item.kind === 'cc'),
            ]
          : sender;
    const to = [
      ...new Set(
        addresses.flatMap((item) =>
          item.address && item.address.toLowerCase() !== ownEmail?.toLowerCase()
            ? [item.address]
            : [],
        ),
      ),
    ];
    const prefix = action === 'forward' ? 'Fwd' : 'Re';
    const subject = new RegExp(`^${prefix}:`, 'i').test(message.subject)
      ? message.subject
      : `${prefix}: ${message.subject}`;
    const body = `\n\nOn ${new Date(message.sentAt).toLocaleString()}, ${message.sender} wrote:\n${message.plainText
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}`;
    await Linking.openURL(
      `mailto:${to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
  } catch (error) {
    Alert.alert(
      'Could not open draft',
      error instanceof Error ? error.message : 'Please try again.',
    );
  }
}
