#!/bin/zsh

set -euo pipefail

VERSION=$(bun -e 'console.log(require("./app.json").expo.version)')
APP="macos/build/Build/Products/Release/Miwa.app"
DMG="macos/build/Miwa-$VERSION.dmg"
STAGING="macos/build/dmg-staging"
MOUNT="miwa-dmg-verify"

echo "Building Miwa Release..."
xcodebuild -workspace macos/Miwa.xcworkspace -scheme Miwa-macOS -configuration Release -derivedDataPath macos/build -allowProvisioningUpdates

rm -f "$DMG"
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

hdiutil create -volname "Miwa $VERSION" -srcfolder "$STAGING" -format UDZO -o "$DMG" >/dev/null
rm -rf "$STAGING"

hdiutil attach "$DMG" -readonly -nobrowse -mountpoint "/tmp/$MOUNT" >/dev/null
codesign -v "/tmp/$MOUNT/Miwa.app"
diskutil eject "/tmp/$MOUNT" >/dev/null

echo "Packaged $DMG"
