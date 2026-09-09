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

function withSettingsAppDelegate(config) {
  // NOTE: expo-desktop's withAppDelegate mod only targets AppDelegate.mm, never
  // AppDelegate.h, so the settingsWindow property is declared in a class
  // extension inside the .mm below rather than in the header.
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;
    contents = mergeOrThrow(contents, {
      tag: 'miwa-settings-window-observer',
      src: `  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(miwaCloseSettingsWindow:)
                                               name:@"MiwaCloseSettingsWindow"
                                             object:nil];`,
      anchor: /\[super applicationDidFinishLaunching:notification\];/,
      offset: 1,
      comment: '//',
    });

    contents = mergeOrThrow(contents, {
      tag: 'miwa-settings-window-extension',
      src: `@interface AppDelegate ()
@property (nonatomic, strong, nullable) NSWindow *settingsWindow;
@end
`,
      anchor: /@implementation AppDelegate/,
      offset: 0,
      comment: '//',
    });

    contents = mergeOrThrow(contents, {
      tag: 'miwa-settings-window-implementation',
      src: `- (IBAction)openSettingsWindow:(id)sender
{
  [NSApp activateIgnoringOtherApps:YES];
  if (self.settingsWindow == nil) {
    NSWindow *window = [[NSWindow alloc]
        initWithContentRect:NSMakeRect(0, 0, 720, 560)
                  styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                              | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                    backing:NSBackingStoreBuffered
                      defer:NO];
    window.title = @"Settings";
    window.contentMinSize = NSMakeSize(620, 420);
    window.releasedWhenClosed = NO;
    self.settingsWindow = window;
  }
  // Mount a fresh settings root on every open so the window never shows stale state.
  NSView *rootView = [self.rootViewFactory viewWithModuleName:@"MiwaSettings"
                                            initialProperties:@{}
                                                launchOptions:nil];
  // The root view needs an explicit frame, otherwise the window collapses to
  // just its title bar.
  rootView.frame = NSMakeRect(0, 0, 720, 560);
  rootView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  NSViewController *controller = [NSViewController new];
  controller.view = rootView;
  self.settingsWindow.contentViewController = controller;
  [self.settingsWindow setContentSize:NSMakeSize(720, 560)];
  [self.settingsWindow makeKeyAndOrderFront:sender];
  if (![self.settingsWindow setFrameUsingName:@"MiwaSettingsWindow"]) {
    [self.settingsWindow center];
  }
  // Ignore degenerate restored frames (e.g. saved while the content had no size).
  if (self.settingsWindow.frame.size.width < 600
      || self.settingsWindow.frame.size.height < 440) {
    [self.settingsWindow setContentSize:NSMakeSize(720, 560)];
    [self.settingsWindow center];
  }
  [self.settingsWindow setFrameAutosaveName:@"MiwaSettingsWindow"];
}

- (void)miwaCloseSettingsWindow:(NSNotification *)notification
{
  [self.settingsWindow close];
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

function withSettingsMainMenu(config) {
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
        const storyboard = path.join(macosDir, appDir, 'Base.lproj', 'Main.storyboard');
        if (!fs.existsSync(storyboard)) continue;
        const original = fs.readFileSync(storyboard, 'utf8');
        const contents = original.replaceAll('HelloWorld', 'Miwa');
        if (contents !== original) fs.writeFileSync(storyboard, contents);
        if (contents.includes('openSettingsWindow:')) continue;
        const anchor = '<menuItem title="Preferences…" keyEquivalent="," id="BOF-NM-1cW"/>';
        if (!contents.includes(anchor)) continue;
        fs.writeFileSync(
          storyboard,
          contents.replace(
            anchor,
            '<menuItem title="Preferences…" keyEquivalent="," id="BOF-NM-1cW">\n' +
              '                                            <connections>\n' +
              '                                                <action selector="openSettingsWindow:" target="Ady-hI-5gd" id="Miwa-Settings-Action"/>\n' +
              '                                            </connections>\n' +
              '                                        </menuItem>',
          ),
        );
      }
      return mod;
    },
  ]);
}

module.exports = function withSettingsWindow(config) {
  config = withSettingsAppDelegate(config);
  config = withSettingsMainMenu(config);
  return config;
};
