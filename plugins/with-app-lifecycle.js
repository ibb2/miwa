const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');
const { withAppDelegate } = require('expo-desktop-config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

function mergeOrThrow(contents, options) {
  const { src: newSrc, ...mergeOptions } = options;
  const result = mergeContents({
    src: contents,
    newSrc,
    ...mergeOptions,
  });
  if (!result.didMerge && !result.didClear) {
    throw new Error(`Unable to apply ${options.tag} to the macOS AppDelegate`);
  }
  return result.contents;
}

// Closing the last window must not quit Miwa: the red traffic light only
// hides the window while Gmail sync and notifications keep running. The Dock
// icon (and notification clicks via the MiwaShowMainWindow notification)
// bring the main window back.
function withAppLifecycleAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;
    contents = mergeOrThrow(contents, {
      tag: 'miwa-app-lifecycle-observer',
      src: `  self.window.releasedWhenClosed = NO;
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(miwaShowMainWindow:)
                                               name:@"MiwaShowMainWindow"
                                             object:nil];`,
      anchor: /\[super applicationDidFinishLaunching:notification\];/,
      offset: 1,
      comment: '//',
    });

    contents = mergeOrThrow(contents, {
      tag: 'miwa-app-lifecycle-implementation',
      src: `- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender
{
  (void)sender;
  return NO;
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag
{
  (void)sender;
  (void)flag;
  if (!self.window.isVisible) {
    [self miwaShowMainWindow:nil];
  }
  return YES;
}

- (void)miwaShowMainWindow:(NSNotification *)notification
{
  (void)notification;
  [NSApp activateIgnoringOtherApps:YES];
  [self.window makeKeyAndOrderFront:nil];
}
`,
      anchor: /- \(NSURL \*\)sourceURLForBridge:/,
      offset: 0,
      comment: '//',
    });

    mod.modResults.contents = contents;
    return mod;
  });
}

// A windowless-but-running Miwa must not be jettisoned by the OS while it
// watches mail in the background. Quitting via Cmd+Q still terminates.
function withAppLifecycleInfoPlist(config) {
  return withDangerousMod(config, [
    'macos',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const macosDir = path.join(projectRoot, 'macos');
      if (!fs.existsSync(macosDir)) return mod;
      const appDirs = fs
        .readdirSync(macosDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.endsWith('-macOS'))
        .map((entry) => entry.name);
      for (const appDir of appDirs) {
        const plistPath = path.join(macosDir, appDir, 'Info.plist');
        if (!fs.existsSync(plistPath)) continue;
        const original = fs.readFileSync(plistPath, 'utf8');
        const contents = original
          .replace(
            /(<key>NSSupportsAutomaticTermination<\/key>\s*)<true\/>/,
            '$1<false/>',
          )
          .replace(
            /(<key>NSSupportsSuddenTermination<\/key>\s*)<true\/>/,
            '$1<false/>',
          );
        if (contents !== original) fs.writeFileSync(plistPath, contents);
      }
      return mod;
    },
  ]);
}

module.exports = function withAppLifecycle(config) {
  config = withAppLifecycleAppDelegate(config);
  config = withAppLifecycleInfoPlist(config);
  return config;
};
