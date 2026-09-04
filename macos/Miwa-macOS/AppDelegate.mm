#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
// @generated begin miwa-google-sign-in-import - expo prebuild (DO NOT MODIFY) sync-8db6fd5483f737fa559093d880dfa37c799694af
#import <GoogleSignIn/GoogleSignIn.h>
// @generated end miwa-google-sign-in-import

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"main";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  self.dependencyProvider = [RCTAppDependencyProvider new];
  
  [super applicationDidFinishLaunching:notification];
// @generated begin expo-desktop-window-title - expo prebuild (DO NOT MODIFY) sync-c2a281b36b3f7a4b8a52c96610319725ba0ae5cc
  self.window.title = @"Miwa";
// @generated end expo-desktop-window-title
// @generated begin miwa-google-sign-in-registration - expo prebuild (DO NOT MODIFY) sync-9fea299ba178c2ff908bf007bd2286171c4e2b82
  [[NSAppleEventManager sharedAppleEventManager]
      setEventHandler:self
           andSelector:@selector(handleGetURLEvent:withReplyEvent:)
         forEventClass:kInternetEventClass
            andEventID:kAEGetURL];
// @generated end miwa-google-sign-in-registration
}

// @generated begin miwa-google-sign-in-handler - expo prebuild (DO NOT MODIFY) sync-9c3d8a7608cbdfa7b5832252485abe379d59dd61
- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event
            withReplyEvent:(NSAppleEventDescriptor *)replyEvent
{
  NSString *URLString = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
  if (URLString != nil) {
    [[GIDSignIn sharedInstance] handleURL:[NSURL URLWithString:URLString]];
  }
}

// @generated end miwa-google-sign-in-handler
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
