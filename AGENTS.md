# Miwa is an Expo Exact app

Exact is not React Native. Before writing code, read the Exact checkout's `docs/start-here.md` and
`docs/contract-for-agents.md`. Look up a contract word with `bun exact.mjs contract vocab <name>`.
`bun exact.mjs agent --help` lists the driver's operations.

- `bun exact.mjs contract build app.contract --json --errors-only` is the type check. It compiles the
  contract and checks `app.ts` and `src/` against the generated `app.contract.d.ts`.
- Data code runs under Hermes with Exact's rules: no `Date.now()`, no `new Date()` without an
  argument, no `Math.random()`, no `setInterval`. The contract passes the time in
  (`time.epochAtZero + performanceNow()`). Long loops `await scheduler.yield()`.
- Open SQLite only through `withDb` in `src/db.ts`. Each storage operation queues behind the last,
  and an open database locks its file.
- Verify on the Mac with `bun exact.mjs mac`, then
  `bun exact.mjs agent macos --chrome platform …`. Without `--chrome platform` the agent paints
  headers in the page instead of the toolbar.

# Project preferences

- Never add tests. Use type checking, formatting checks, and manual app verification as appropriate.
- Keep page switches and global buttons/actions in the header or native toolbar. Keep contextual actions beside the item they affect, using icon buttons where clear.
