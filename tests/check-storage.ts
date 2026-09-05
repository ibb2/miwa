import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrateDatabase } from '../src/db/migrations';

const sqlite = new Database(':memory:');
migrateDatabase({
  execSync: (sql: string) => sqlite.exec(sql),
  getFirstSync: <T>(sql: string) => sqlite.query(sql).get() as T,
});
mock.module('../src/db/db', () => ({ db: drizzle({ client: sqlite }) }));
mock.module('../src/mail/accounts', () => ({ gmailAccountAuth: {} }));
const { persistThread } = await import('../src/mail/download-thread');
const { removeInboxThread, setThreadDoneState, loadThreads } =
  await import('../src/mail/thread-store');

async function checkStorage() {
  sqlite.run(
    "INSERT INTO mail_accounts (id, provider, email, display_name) VALUES ('account', 'gmail', 'me@example.com', 'Me')",
  );
  const snapshot = (messageId: string): Parameters<typeof persistThread>[1] => ({
    providerThreadId: 'thread',
    subject: messageId,
    sender: 'Sender',
    snippet: '',
    lastMessageAt: 1,
    unread: true,
    messages: [
      {
        row: {
          id: messageId,
          threadId: 'account:thread',
          accountId: 'account',
          providerMessageId: messageId,
          sender: 'Sender',
          subject: messageId,
          sentAt: 1,
        },
        addresses: [{ messageId, kind: 'from', position: 0, rawValue: 'sender@example.com' }],
        attachments: [
          {
            id: `${messageId}:file`,
            messageId,
            mimeType: 'text/plain',
            downloadState: 'complete',
            data: new Uint8Array([1, 2]),
          },
        ],
      },
    ],
  });
  const ids = (table: string) => sqlite.query(`SELECT id FROM ${table}`).all();

  await persistThread('account', snapshot('old'));
  sqlite.run("UPDATE mail_threads SET pinned = 1 WHERE id = 'account:thread'");
  assert.equal((await loadThreads())[0].done, false);
  await setThreadDoneState('account', 'thread', true);
  await persistThread('account', snapshot('new'));
  assert.equal((await loadThreads())[0].done, true);
  await setThreadDoneState('account', 'thread', false);
  assert.equal((await loadThreads())[0].done, false);
  assert.deepEqual(ids('mail_messages'), [{ id: 'new' }]);
  assert.deepEqual(ids('mail_attachments'), [{ id: 'new:file' }]);
  assert.deepEqual(sqlite.query('SELECT message_id FROM mail_message_addresses').all(), [
    { message_id: 'new' },
  ]);
  assert.deepEqual(sqlite.query('SELECT pinned FROM mail_threads').get(), { pinned: 1 });

  const invalid = snapshot('invalid');
  invalid.messages[0].attachments[0].messageId = 'missing-parent';
  await assert.rejects(persistThread('account', invalid));
  assert.deepEqual(ids('mail_messages'), [{ id: 'new' }]);
  assert.deepEqual(ids('mail_attachments'), [{ id: 'new:file' }]);
  assert.deepEqual(sqlite.query('SELECT subject, pinned FROM mail_threads').get(), {
    subject: 'new',
    pinned: 1,
  });

  await removeInboxThread('account', 'thread');
  assert.deepEqual(ids('mail_threads'), []);
  assert.deepEqual(ids('mail_messages'), []);
  assert.deepEqual(ids('mail_message_addresses'), []);
  assert.deepEqual(ids('mail_attachments'), []);
  sqlite.close();
}

await checkStorage();
