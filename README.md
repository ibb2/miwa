# Miwa

Miwa is a native macOS multi-inbox Gmail reader built with Expo Desktop, React Native macOS, and AppKit.

## Requirements

- Node.js 26 (the project includes an `.nvmrc`)
- Bun
- Xcode with CocoaPods

## Setup

```sh
bun install
bun run prebuild:macos:clean
bun run macos
```

The prebuild script loads Node 26 through nvm itself, including when the current shell only has Bun on `PATH`. Expo Desktop uses `npm` internally to download its native template.

The macOS project is generated and ignored by Git. Native changes must be implemented in Expo config, a config plugin, or a local Expo module so a clean prebuild remains reproducible.

## Expo UI on macOS

Dependency installation applies the Expo Desktop project's recommended macOS compatibility patches for `@expo/ui@0.2.0-beta.9` and `expo-modules-core@3.0.30` with `patch-package`. The former `modules/expo-ui-macos` workaround has been removed. Keep the package versions and patch filenames aligned when upgrading Expo UI.

Miwa uses compact SwiftUI hosts for native buttons, switches, symbols, dividers, stacks, and empty states. React Native remains responsible for scrolling and complex mail-row composition where Expo UI does not yet provide a safe macOS host for React Native children.

## Gmail setup

The generated macOS target is configured with the Google OAuth client for bundle identifier `com.ib.miwa`. Enable the Gmail API, add the restricted `gmail.readonly` scope, and set the Google Auth Platform **Branding** app name to `Miwa`. Google displays that branding name during consent.

`plugins/with-google-sign-in.js` configures the Google client IDs, callback URL scheme, AppDelegate handler, sandbox permissions, and Keychain access during prebuild.

Google Sign-In on macOS requires an Apple-signed app for Keychain access. After prebuilding, open `macos/Miwa.xcworkspace`, enable automatic signing for the `Miwa-macOS` target, and select the configured development team if Xcode requests it. `bun run macos` allows Xcode to create or refresh the development provisioning profile using your signed-in Apple account. A local `react-native-macos` patch adds this option to its CLI.

Google requires OAuth verification before a public release that requests `gmail.readonly`. Connected-account credentials are stored in the signed app's macOS Keychain; only profile metadata is stored in user defaults.

## Finding your way around

Start with `App.tsx`. It chooses the current screen and connects toolbar events to
three hooks. There is no global context provider or generic state-management layer.

```text
App.tsx                      Screen selection, toolbar events, settings actions
src/
  mail/
    use-accounts.ts          Connected account state and connect/disconnect actions
    use-mailbox.ts           Local mail, selection, sync lifecycle, message actions
    use-inbox-download.ts    Download progress and completion messages
    thread-list.tsx          Inbox tabs and conversation rows
    thread-detail.tsx        The open conversation
    gatekeeper-screen.tsx    New and blocked senders
    sender-review-card.tsx   Expandable message preview and sender decisions
    inbox-tabs.ts            Tab definitions, category matching, counts
    thread-store.ts          Read and update downloaded mail in SQLite
    download-inbox.ts        Select and coordinate an initial inbox download
    download-thread.ts       Download, save, and reconcile one Gmail conversation
    sync.ts                  Poll Gmail history and recover expired cursors
    gmail.ts                 Authenticated Gmail requests, retries, label changes
    gmail-content.ts         Decode message bodies, addresses, and safe HTML
    accounts.ts              Keychain credentials and native Google sign-in bridge
    types.ts                 Mail data shown by the UI
  settings/
    settings-screen.tsx      Settings UI
    preferences.ts           Load and save the message-preview preference
  components/
    native-controls.tsx      Shared SwiftUI buttons, avatars, and empty states
    native-colors.ts         Adaptive AppKit colors
    mail-toolbar.ts          Toolbar items for each screen
  db/
    db.ts                    Open and clear the database
    schema.ts                Tables and the row types used by mail code
    migrations.ts            Preserve and upgrade existing installations
modules/
  gmail-account-auth/        Native Google sign-in
  native-mail-viewer/        Native email HTML viewer
  native-window-toolbar/     AppKit window toolbar and its bridge records
```

A typical update follows one path: a screen calls a hook action, the action updates
Gmail and/or SQLite, and the hook updates the data passed back to the screen. Sync
uses the same conversation download and storage code as the initial inbox download.
Message actions update the list immediately and restore it if Gmail rejects them.
Pins and Gatekeeper decisions remain local to Miwa.

## Styling and checks

Layouts, spacing, typography, borders, and interaction states use Uniwind classes
beside the JSX. `global.css` contains the accent colors and hairline utilities;
`metro.config.js` enables Uniwind. AppKit's `PlatformColor` values and calculated
avatar/button values remain inline so native appearance settings keep working.
Native hosts and libraries that need a `style` prop use `withUniwind` or
`useResolveClassNames` at their call site. See the [Uniwind setup guide](https://docs.uniwind.dev/quickstart).

```sh
bun run typecheck
bun run format:check
bun run format
bun run styles:generate  # Regenerate Uniwind's type declarations after theme changes
```

Use the macOS app to verify native appearance, toolbar customization, and real Gmail access.
There is no separate lint configuration. Formatting and TypeScript checks are the
available static checks.

Older preference columns remain in the database migrations for compatibility, but
the app only reads and writes the preview preference that is present in Settings.
