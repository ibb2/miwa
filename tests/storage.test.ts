import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';

test('SQLite replacement preserves pins, cascades children, and rolls back failed writes', () => {
  // Keep the real database separate from the mailbox hook's mocked services.
  execFileSync(process.execPath, ['run', new URL('./check-storage.ts', import.meta.url).pathname]);
});
