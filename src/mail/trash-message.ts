import { trashGmailMessage, withGmailReauth } from './gmail';
import { removeTrashedMessage } from './thread-store';
import type { GatekeeperMessage } from './gatekeeper';

export async function trashMessage(message: GatekeeperMessage): Promise<void> {
  await withGmailReauth(message.accountId, () =>
    trashGmailMessage(message.accountId, message.providerMessageId),
  );
  try {
    await removeTrashedMessage(message.accountId, message.providerMessageId);
  } catch {
    throw new Error('The email moved to Gmail Trash, but its local copy could not update.');
  }
}
