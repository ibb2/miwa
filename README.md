# Miwa

Miwa is a native macOS multi-inbox Gmail reader built with [Expo Exact](https://github.com/expo/exact).
The view is one Contract file; the data layer is TypeScript that talks to Gmail and keeps an offline
copy of each inbox in SQLite.

## Requirements

- An Exact checkout. `exact.mjs` finds it through `EXACT2`, defaulting to the path `exact new` recorded.
- Bun 1.4.2 (`exact.mjs` refuses older versions; set `BUN` to point at it)
- Xcode and a Rust toolchain, both of which Exact uses to build the macOS host

## Running

```sh
bun install
bun exact.mjs mac --run
```

`bun run check` compiles `app.contract` and type-checks `app.ts` and `src/` against the generated
`app.contract.d.ts`. `bun run format` and `bun run format:check` run Prettier.

To drive the built app without clicking through it, use Exact's agent, for example:

```sh
bun exact.mjs agent macos --chrome platform --size 1100x760 tree "screenshot shot.png window"
```

## Gmail setup

Sign-in uses `@exact/oauth` against Google's OAuth client for bundle identifier `com.ib.miwa`,
returning to the reversed client ID callback declared in `app.ts`'s grants. Enable the Gmail API,
add the `gmail.modify` scope, and set the Google Auth Platform **Branding** app name to `Miwa`.
Google requires OAuth verification before a public release that requests a restricted Gmail scope.

Every connected account and its OAuth session live in one Keychain secret, `miwa.gmail.accounts`.
Downloaded mail lives in `app:/data/miwa.db`.

## Finding your way around

```text
app.contract           Screens, title bars, the Settings sheet, dialogs, timers: the whole view
app.tamber             Miwa's colour tokens
app.ts                 Grants, the sources the contract calls, the optimistic overlay
strings/en.json        Permission purpose strings
modules/apple/         WindowZoom.swift: the title row's double-click zooms the window
src/
  view.ts              Answers for the inbox list, conversation, Gatekeeper and Settings
  actions.ts           Thread actions, sender decisions, accounts, settings, attachments
  accounts.ts          Google OAuth and the connected-account secret
  gmail.ts             Authenticated Gmail requests, retries, label changes
  gmail-content.ts     Decode message bodies, addresses and safe HTML
  download.ts          Initial inbox download and per-thread storage
  sync.ts              Poll Gmail history and recover expired cursors
  thread-store.ts      Read and update downloaded mail in SQLite
  message-images.ts    Inline and restore remote images in message HTML
  gatekeeper.ts        New-sender discovery and decisions
  notifications.ts     New-mail banners and the Dock badge
  preferences.ts       Settings stored in SQLite
  inbox-tabs.ts        Inbox and Pinned tabs
  search.ts            subject:, sender:, attachment: and body: search
  db.ts                Schema, the shared database handle, row helpers
```

A typical update follows one path. A button sends a mutation in `app.contract`. `app.ts` maps it to
a function in `src/actions.ts`, which updates Gmail and then SQLite. The mutation's `refreshes`
reloads the affected lists. While it is in flight, `overlay` in `app.ts` already shows the
change: a row marked read, done or pinned, or removed after archive or trash. Sync runs every
minute, uses the same download and storage code as the initial download, and then
posts notifications. Pins, Done and Gatekeeper decisions stay local to Miwa.

## Window layout

The app has no `routes`. The `screen` state picks the inbox, a conversation, Gatekeeper or a
reviewed email, so the window has no NSToolbar. Each screen draws its own bar in the window's
title row (`display_override: ["window-controls-overlay"]`), beside the traffic lights. The bar
matches the page whether or not the window is focused, and its controls sit in Liquid Glass
capsules, as the original Miwa's toolbar did. Its empty space drags the window, and a double
click there zooms it (or minimizes it, as System Settings says) through
`modules/apple/WindowZoom.swift`. The bar's own `press` keeps those clicks in the page;
controls in it take `dblclick=stay` so a double click on one is not a zoom.

Gatekeeper lays new senders out as a grid of cards. Each card is one size and shows the
sender's latest two emails, and pressing one opens all of their emails. Tab moves between cards
(the first has focus on opening), and the focused card takes the keys: ← blocks, → allows, ⇧← blocks and moves all of their emails to
Gmail Trash (`trashSender`), and Space opens all of their emails. Deciding a card focuses its
neighbour, and ⌘Z undoes the last allow or block. The bar's layout button switches to one card
at a time, with the same keys as shortcuts plus ↓ for later; below 720 points wide that is the
only layout. A decided card leaves the way it went. The hand button lists blocked senders,
where they can be unblocked.

A sender's emails screen (`screen == "sender"`, `loadSenderDetail`) stacks every email from
them with the conversation reader's `DetailBody` and `MessageCard`, each headed by its subject
and collapsible, with Delete All, Block and Allow in the bar.

A notification click opens its conversation from the notification's `data` path. Settings is a
sheet (`dialog id="settings"`). On the Mac it opens from Miwa ▸ Settings… (⌘,), a hidden
`-exact-menu="app"` button; elsewhere a gear in the inbox bar opens it. Exact warns
`lower-screen-by-state` about the screens; the warning is expected.

There are no tests. Use the contract build, Prettier and the running app to verify changes.
