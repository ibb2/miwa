const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');
const { withAppDelegate } = require('expo-desktop-config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

function mergeGenerated(contents, options) {
  const { src: newSrc, ...mergeOptions } = options;
  // A missing anchor throws from mergeContents; an already up-to-date block is
  // reported as "no merge" and simply leaves the contents untouched.
  return mergeContents({
    src: contents,
    newSrc,
    ...mergeOptions,
  }).contents;
}

// Closing the last window must not quit Miwa: the red traffic light only
// hides the window while Gmail sync and notifications keep running. The Dock
// icon brings the main window back; notification clicks open disposable email windows.
function withAppLifecycleAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;
    contents = mergeGenerated(contents, {
      tag: 'miwa-notification-windows',
      src: `@interface AppDelegate ()
@property (nonatomic, strong) NSMutableArray<NSWindowController *> *notificationWindows;
@end`,
      anchor: /@implementation AppDelegate/,
      offset: 0,
      comment: '//',
    });
    contents = mergeGenerated(contents, {
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

    contents = mergeGenerated(contents, {
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
  NSString *accountId = notification.userInfo[@"accountId"];
  NSString *threadId = notification.userInfo[@"threadId"];
  if (accountId.length && threadId.length) {
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 900, 650)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable
        backing:NSBackingStoreBuffered defer:NO];
    window.title = @"Email";
    window.releasedWhenClosed = NO;
    window.restorable = NO;
    window.contentMinSize = NSMakeSize(500, 350);
    NSView *root = [self.rootViewFactory viewWithModuleName:@"MiwaNotificationEmail"
        initialProperties:@{@"accountId": accountId, @"threadId": threadId} launchOptions:nil];
    root.frame = NSMakeRect(0, 0, 900, 650);
    root.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    window.contentView = root;
    NSWindowController *controller = [[NSWindowController alloc] initWithWindow:window];
    if (!self.notificationWindows) self.notificationWindows = [NSMutableArray new];
    [self.notificationWindows addObject:controller];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(miwaDisposeEmail:)
        name:NSWindowWillCloseNotification object:window];
    [window center];
    [NSApp activateIgnoringOtherApps:YES];
    [controller showWindow:nil];
    return;
  }
  [NSApp activateIgnoringOtherApps:YES];
  [self.window makeKeyAndOrderFront:nil];
}

- (void)miwaDisposeEmail:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  [[NSNotificationCenter defaultCenter] removeObserver:self name:NSWindowWillCloseNotification object:window];
  window.contentView = nil;
  for (NSWindowController *controller in [self.notificationWindows copy]) {
    if (controller.window == window) [self.notificationWindows removeObject:controller];
  }
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
          .replace(/(<key>NSSupportsAutomaticTermination<\/key>\s*)<true\/>/, '$1<false/>')
          .replace(/(<key>NSSupportsSuddenTermination<\/key>\s*)<true\/>/, '$1<false/>');
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
