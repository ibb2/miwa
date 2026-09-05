import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { GatekeeperOverview, GatekeeperSender } from '../mail/gatekeeper';
import { accentDark, colors, shared } from '../theme';
import { NativeActionButton, NativeSymbol } from './native';

type GatekeeperViewProps = {
  actionEmail?: string;
  error?: string;
  loading: boolean;
  onApprove: (email: string) => void;
  onBlock: (email: string) => void;
  onRetry: () => void;
  onUnblock: (email: string) => void;
  overview?: GatekeeperOverview;
};

function senderTitle(sender: GatekeeperSender): string {
  return sender.displayName || sender.email;
}

function formatMessageDate(milliseconds: number): string {
  return new Date(milliseconds).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** A pending sender with a message preview and Approve/Block actions. */
function SenderReviewCard({
  actionEmail,
  onApprove,
  onBlock,
  sender,
}: {
  actionEmail?: string;
  onApprove: (email: string) => void;
  onBlock: (email: string) => void;
  sender: GatekeeperSender;
}) {
  const [expanded, setExpanded] = useState(false);
  const messages = expanded ? sender.messages : sender.messages.slice(0, 1);
  const busy = actionEmail === sender.email;

  return (
    <View style={[shared.card, styles.senderCard]}>
      <Pressable
        accessibilityHint="Shows or hides this sender's messages"
        accessibilityLabel={`${senderTitle(sender)}, ${sender.messageCount} ${
          sender.messageCount === 1 ? 'email' : 'emails'
        }`}
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.senderHeader, pressed && shared.pressed]}
      >
        <NativeSymbol
          fallback={senderTitle(sender).slice(0, 1).toUpperCase()}
          systemName="person.crop.circle"
        />
        <View style={styles.senderIdentity}>
          <Text numberOfLines={1} selectable style={styles.senderName}>
            {senderTitle(sender)}
          </Text>
          {sender.displayName ? (
            <Text numberOfLines={1} selectable style={styles.senderEmail}>
              {sender.email}
            </Text>
          ) : null}
        </View>
        <View style={styles.senderMeta}>
          <Text selectable style={styles.metaText}>
            {sender.messageCount.toLocaleString()}{' '}
            {sender.messageCount === 1 ? 'email' : 'emails'}
          </Text>
          <Text accessibilityElementsHidden style={styles.disclosure}>
            {expanded ? '⌃' : '⌄'}
          </Text>
        </View>
      </Pressable>

      {messages.length ? (
        <View style={styles.messageList}>
          {messages.map((message, index) => (
            <View key={message.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.messageRow}>
                <View style={styles.messageCopy}>
                  <Text numberOfLines={1} selectable style={styles.messageSubject}>
                    {message.subject || '(No subject)'}
                  </Text>
                  {message.snippet ? (
                    <Text numberOfLines={2} selectable style={styles.messageSnippet}>
                      {message.snippet}
                    </Text>
                  ) : null}
                </View>
                <Text selectable style={styles.messageDate}>
                  {formatMessageDate(message.sentAt)}
                </Text>
              </View>
            </View>
          ))}
          {!expanded && sender.messages.length > 1 ? (
            <View style={styles.showAllButton}>
              <NativeActionButton
                label={`Show all ${sender.messages.length.toLocaleString()} emails`}
                onPress={() => setExpanded(true)}
                variant="link"
              />
            </View>
          ) : null}
        </View>
      ) : (
        <Text selectable style={styles.unavailableMessage}>
          These emails are no longer available in the local mailbox.
        </Text>
      )}

      <View style={styles.actionRow}>
        <Text selectable style={styles.actionHint}>
          Approve keeps these emails in the inbox. Block hides them.
        </Text>
        <NativeActionButton
          disabled={busy}
          label={busy ? 'Working…' : 'Block'}
          onPress={() => onBlock(sender.email)}
          role="destructive"
          variant="glass"
        />
        <NativeActionButton
          disabled={busy}
          label={busy ? 'Working…' : 'Approve'}
          onPress={() => onApprove(sender.email)}
          variant="glassProminent"
        />
      </View>
    </View>
  );
}

/** One blocked sender with an undo action. */
function BlockedSenderRow({
  actionEmail,
  onUnblock,
  sender,
}: {
  actionEmail?: string;
  onUnblock: (email: string) => void;
  sender: GatekeeperSender;
}) {
  const busy = actionEmail === sender.email;

  return (
    <View style={styles.blockedRow}>
      <NativeSymbol
        fallback={senderTitle(sender).slice(0, 1).toUpperCase()}
        systemName="nosign"
      />
      <View style={styles.senderIdentity}>
        <Text numberOfLines={1} selectable style={styles.senderName}>
          {senderTitle(sender)}
        </Text>
        <Text numberOfLines={1} selectable style={styles.senderEmail}>
          {sender.email}
        </Text>
      </View>
      <Text selectable style={styles.blockedCount}>
        {sender.messageCount.toLocaleString()}{' '}
        {sender.messageCount === 1 ? 'email hidden' : 'emails hidden'}
      </Text>
      <NativeActionButton
        disabled={busy}
        label={busy ? 'Restoring…' : 'Undo block'}
        onPress={() => onUnblock(sender.email)}
        variant="glass"
      />
    </View>
  );
}

export function GatekeeperView({
  actionEmail,
  error,
  loading,
  onApprove,
  onBlock,
  onRetry,
  onUnblock,
  overview,
}: GatekeeperViewProps) {
  const [showBlocked, setShowBlocked] = useState(false);

  useEffect(() => {
    if (!overview?.blocked.length) setShowBlocked(false);
  }, [overview?.blocked.length]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={shared.screenScroll}
    >
      <View style={styles.titleRow}>
        <View style={styles.shieldMark}>
          <NativeSymbol fallback="G" systemName="checkmark.shield.fill" />
        </View>
        <View style={styles.titleCopy}>
          <Text selectable style={shared.eyebrow}>GATEKEEPER</Text>
          <Text selectable style={shared.screenTitle}>New senders</Text>
          <Text selectable style={shared.screenSubtitle}>
            Review each new email address once. Approve keeps its mail in your
            inbox; Block hides its conversations until you undo it.
          </Text>
        </View>
        {overview ? (
          <View
            accessibilityLabel={`${overview.pending.length} new senders`}
            style={styles.queueCount}
          >
            <Text selectable style={styles.queueNumber}>
              {overview.pending.length.toLocaleString()}
            </Text>
            <Text selectable style={styles.queueLabel}>TO REVIEW</Text>
          </View>
        ) : null}
      </View>

      {loading && !overview ? (
        <Text selectable style={shared.stateText}>Checking new senders…</Text>
      ) : null}

      {error ? (
        <View style={[shared.card, styles.errorCard]}>
          <Text selectable style={styles.errorTitle}>Gatekeeper could not open.</Text>
          <Text selectable style={styles.errorCopy}>{error}</Text>
          <NativeActionButton label="Try again" onPress={onRetry} variant="glassProminent" />
        </View>
      ) : null}

      {overview && !error ? (
        <>
          <View style={styles.queue}>
            {overview.pending.map((sender) => (
              <SenderReviewCard
                key={sender.email}
                actionEmail={actionEmail}
                onApprove={onApprove}
                onBlock={onBlock}
                sender={sender}
              />
            ))}
            {!overview.pending.length ? (
              <View style={[shared.card, styles.emptyCard]}>
                <NativeSymbol fallback="✓" systemName="checkmark.shield.fill" />
                <View style={styles.emptyCopy}>
                  <Text selectable style={styles.emptyTitle}>You’re caught up.</Text>
                  <Text selectable style={styles.emptyDescription}>
                    New sender addresses will collect here as mail arrives.
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {overview.blocked.length ? (
            <View style={styles.blockedSection}>
              <View style={styles.blockedDisclosure}>
                <NativeActionButton
                  accessibilityLabel={`${showBlocked ? 'Hide' : 'Show'} ${overview.blocked.length} blocked senders`}
                  label={`${showBlocked ? 'Hide' : 'Show'} ${overview.blocked.length.toLocaleString()} blocked senders`}
                  onPress={() => setShowBlocked((current) => !current)}
                  variant="plain"
                />
              </View>
              {showBlocked ? (
                <View style={[shared.card, styles.blockedList]}>
                  {overview.blocked.map((sender, index) => (
                    <View key={sender.email}>
                      {index > 0 ? <View style={styles.blockedDivider} /> : null}
                      <BlockedSenderRow
                        actionEmail={actionEmail}
                        onUnblock={onUnblock}
                        sender={sender}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <Text selectable style={styles.activationNote}>
            Watching for new senders since {new Date(overview.activatedAt).toLocaleString()}.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
    paddingHorizontal: 34,
    paddingTop: 38,
    paddingBottom: 64,
    gap: 22,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: 8,
    gap: 14,
  },
  shieldMark: { paddingTop: 3 },
  titleCopy: { flex: 1, minWidth: 0, gap: 4 },
  queueCount: { minWidth: 70, alignItems: 'flex-end', paddingTop: 2, gap: 1 },
  queueNumber: {
    color: accentDark,
    fontSize: 25,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  queueLabel: {
    color: colors.tertiaryLabel,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  queue: { gap: 12 },
  senderCard: { overflow: 'hidden', boxShadow: '0 6px 18px rgba(0, 0, 0, 0.045)' },
  senderHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 11,
  },
  senderIdentity: { flex: 1, minWidth: 0, gap: 2 },
  senderName: { color: colors.label, fontSize: 13, fontWeight: '600' },
  senderEmail: { color: colors.secondaryLabel, fontSize: 10 },
  senderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: {
    color: colors.secondaryLabel,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  disclosure: {
    width: 14,
    color: colors.tertiaryLabel,
    fontSize: 12,
    textAlign: 'center',
  },
  messageList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingHorizontal: 16,
  },
  messageRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    gap: 18,
  },
  messageCopy: { flex: 1, minWidth: 0, gap: 3 },
  messageSubject: { color: colors.label, fontSize: 12, fontWeight: '600' },
  messageSnippet: { color: colors.secondaryLabel, fontSize: 10, lineHeight: 14 },
  messageDate: {
    width: 132,
    color: colors.tertiaryLabel,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  showAllButton: { alignSelf: 'flex-start', paddingTop: 2, paddingBottom: 10 },
  showAllLabel: { color: accentDark, fontSize: 10, fontWeight: '600' },
  unavailableMessage: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: colors.secondaryLabel,
    fontSize: 10,
  },
  actionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    backgroundColor: colors.underPage,
  },
  actionHint: { flex: 1, color: colors.tertiaryLabel, fontSize: 9 },
  emptyCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
  },
  emptyCopy: { flex: 1, gap: 2 },
  emptyTitle: { color: colors.label, fontSize: 14, fontWeight: '600' },
  emptyDescription: { color: colors.secondaryLabel, fontSize: 11 },
  blockedSection: { gap: 7, paddingTop: 2 },
  blockedDisclosure: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    gap: 7,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  blockedDisclosureLabel: { color: colors.secondaryLabel, fontSize: 11, fontWeight: '600' },
  blockedList: { overflow: 'hidden', borderRadius: 12 },
  blockedRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 11,
  },
  blockedCount: {
    color: colors.tertiaryLabel,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  blockedDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 57,
    backgroundColor: colors.separator,
  },
  activationNote: {
    alignSelf: 'center',
    color: colors.tertiaryLabel,
    fontSize: 9,
    paddingTop: 5,
  },
  errorCard: { alignItems: 'center', padding: 20, gap: 7 },
  errorTitle: { color: colors.label, fontSize: 14, fontWeight: '600' },
  errorCopy: { color: colors.red, fontSize: 10, paddingBottom: 4 },
});
