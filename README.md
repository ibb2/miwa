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

Google Sign-In on macOS requires an Apple-signed app for Keychain access. After prebuilding, open `macos/Miwa.xcworkspace`, enable automatic signing for the `Miwa-macOS` target, and select the configured development team if Xcode requests it.

Google requires OAuth verification before a public release that requests `gmail.readonly`. Connected-account credentials are stored in the signed app's macOS Keychain; only profile metadata is stored in user defaults.
