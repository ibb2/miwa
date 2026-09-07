import type { NativeToolbarItem, ToolbarSegment } from '../../modules/native-window-toolbar/src';

export type AppSurface = 'mail' | 'gatekeeper';

export type ToolbarInput = {
  surface: AppSurface;
  inboxTitle: string;
  gatekeeperMessage?: { busy: boolean };
  /** The open conversation, if any. `busy` disables its action buttons. */
  thread?: { unread: boolean; pinned: boolean; busy: boolean };
  accountSegments: ToolbarSegment[];
  selectedAccountIndex: number;
  syncing: boolean;
  syncLabel: string;
  /** Present while an inbox download is running. */
  download?: { fraction: number; label: string };
  gatekeeperPending: number;
  gatekeeperBlocked: number;
  gatekeeperTab: number;
  gatekeeperQuery: string;
  accounts: Array<{ id: string; email: string }>;
};

/** A stable identifier per screen so macOS can autosave each toolbar layout. */
export function toolbarIdentifier(input: ToolbarInput): string {
  if (input.surface === 'gatekeeper')
    return input.gatekeeperMessage ? 'MiwaGatekeeperMessageToolbar' : 'MiwaGatekeeperToolbar';
  if (input.thread) return 'MiwaMessageToolbar';
  return 'MiwaLeadingInboxToolbar';
}

/** Builds the native window toolbar items for the current screen. */
export function buildToolbarItems(input: ToolbarInput): NativeToolbarItem[] {
  const items: NativeToolbarItem[] = [];
  const onMailScreen = input.surface === 'mail';

  if (input.thread || !onMailScreen) {
    items.push({
      id: 'back',
      kind: 'button',
      label: input.gatekeeperMessage
        ? 'Back to senders'
        : onMailScreen
          ? `Back to ${input.inboxTitle}`
          : 'Back to inbox',
      systemImage: 'chevron.left',
      toolTip: input.gatekeeperMessage
        ? 'Back to senders'
        : onMailScreen
          ? `Back to ${input.inboxTitle}`
          : 'Back to inbox',
      immovable: true,
      navigational: true,
    });
  }

  if (onMailScreen) {
    items.push({
      id: 'accounts',
      kind: 'segmented',
      label: 'Inbox account',
      selectionMode: 'selectOne',
      selectedIndex: input.selectedAccountIndex,
      segments: input.accountSegments,
      immovable: true,
      navigational: true,
    });
  }

  if (input.surface === 'gatekeeper' && !input.gatekeeperMessage) {
    items.push({
      id: 'gatekeeper-tabs',
      kind: 'segmented',
      label: 'Sender status',
      selectionMode: 'selectOne',
      selectedIndex: input.gatekeeperTab,
      segments: [
        { id: 'new', label: `New (${input.gatekeeperPending})` },
        { id: 'blocked', label: `Blocked (${input.gatekeeperBlocked})` },
      ],
      immovable: true,
      navigational: true,
    });
  }

  items.push({ id: 'toolbar-spacer', kind: 'flexibleSpace' });

  if (input.surface === 'gatekeeper' && !input.gatekeeperMessage) {
    items.push({
      id: 'gatekeeper-search',
      kind: 'search',
      label: 'Search senders or emails',
      placeholder: 'Search senders or emails',
      value: input.gatekeeperQuery,
      immovable: true,
    });
  }

  if (input.thread) {
    items.push(
      {
        id: 'message-read-toggle',
        kind: 'button',
        label: input.thread.unread ? 'Mark as read' : 'Mark as unread',
        systemImage: input.thread.unread ? 'envelope.badge' : 'envelope.open',
        toolTip: input.thread.unread ? 'Mark as read' : 'Mark as unread',
        enabled: !input.thread.busy,
        immovable: true,
      },
      {
        id: 'message-archive',
        kind: 'button',
        label: 'Archive',
        systemImage: 'archivebox',
        toolTip: 'Archive conversation',
        enabled: !input.thread.busy,
        immovable: true,
      },
      {
        id: 'message-pin',
        kind: 'button',
        label: input.thread.pinned ? 'Unpin' : 'Pin',
        systemImage: input.thread.pinned ? 'pin.slash' : 'pin',
        toolTip: input.thread.pinned ? 'Unpin conversation' : 'Pin conversation',
        enabled: !input.thread.busy,
        immovable: true,
      },
    );
  }

  if (input.gatekeeperMessage) {
    items.push({
      id: 'gatekeeper-message-trash',
      kind: 'button',
      label: 'Move to Trash',
      systemImage: 'trash',
      toolTip: 'Move this email to Gmail Trash',
      enabled: !input.gatekeeperMessage.busy,
      immovable: true,
    });
  }

  if (input.syncing) {
    items.push({
      id: 'sync-inbox',
      kind: 'progress',
      label: 'Syncing Mail',
      toolTip: input.syncLabel,
      indeterminate: true,
      immovable: true,
    });
  }

  if (input.download) {
    items.push({
      id: 'download-progress',
      kind: 'progress',
      label: 'Download Progress',
      toolTip: input.download.label,
      progress: input.download.fraction,
      indeterminate: input.download.fraction <= 0,
      immovable: true,
    });
  }

  items.push({
    id: 'connect-account',
    kind: 'button',
    label: 'Connect Gmail',
    systemImage: 'plus',
    toolTip: 'Connect another Gmail account',
    enabled: !input.download,
    immovable: true,
  });

  if (onMailScreen) {
    items.push({
      id: 'gatekeeper',
      kind: 'button',
      label: 'Gatekeeper',
      systemImage: 'checkmark.shield',
      badgeCount: input.gatekeeperPending,
      toolTip: input.gatekeeperPending
        ? `Review ${input.gatekeeperPending} new ${input.gatekeeperPending === 1 ? 'sender' : 'senders'}`
        : 'No new senders to review',
      immovable: true,
    });
  }

  items.push({
    id: 'more',
    kind: 'menu',
    label: 'More',
    systemImage: 'ellipsis.circle',
    options: [
      ...input.accounts.map((account) => ({
        id: `disconnect:${account.id}`,
        label: `Disconnect ${account.email}`,
        enabled: !input.download,
      })),
      { id: 'customize', label: 'Customize Toolbar…' },
      { id: 'reset', label: 'Reset Toolbar' },
    ],
  });

  return items;
}
