# Miwa

Miwa is a native macOS multi-inbox Gmail reader built with Expo, React Native macOS, and AppKit.

## Gmail setup

The macOS target is configured with the Google OAuth client for bundle identifier `com.ib.miwa`. Enable the Gmail API, add the restricted `gmail.readonly` scope, and set the Google Auth Platform **Branding** app name to `Miwa`. Google displays that branding name—not the native bundle display name—during consent.

Set these two user-defined build settings on the `Miwa-macOS` target, or pass them to `xcodebuild`:

```text
GOOGLE_CLIENT_ID=611007919856-aj6ui4cnma1qojqi0iggbo1g8emg8p66.apps.googleusercontent.com
GOOGLE_REVERSED_CLIENT_ID=com.googleusercontent.apps.611007919856-aj6ui4cnma1qojqi0iggbo1g8emg8p66
```

The reversed value is the client ID with its dot-separated components reversed. The app reports a configuration error before opening a browser when these values are missing.

Google Sign-In on macOS also requires an Apple-signed app for Keychain access. Open `macos/Miwa.xcworkspace`, select the `Miwa-macOS` target, then under **Signing & Capabilities** enable automatic signing and choose your Development Team. An unsigned or ad-hoc build shows this prerequisite in the app instead of starting an OAuth flow that cannot save credentials.

For local development:

```sh
bun install
cd macos && pod install && cd ..
bun run macos
```

Google requires OAuth verification before a public release that requests `gmail.readonly`. Connected-account credentials are archived separately in the signed app's macOS Keychain; only profile metadata is stored in user defaults.
