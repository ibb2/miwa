const {
  MacOSConfig,
  withAppDelegate,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("expo-desktop-config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

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

function withGoogleAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;

    contents = mergeOrThrow(contents, {
      tag: "miwa-google-sign-in-import",
      src: "#import <GoogleSignIn/GoogleSignIn.h>",
      anchor: /#import <ReactAppDependencyProvider\/RCTAppDependencyProvider\.h>/,
      offset: 1,
      comment: "//",
    });

    contents = mergeOrThrow(contents, {
      tag: "miwa-google-sign-in-registration",
      src: `  [[NSAppleEventManager sharedAppleEventManager]
      setEventHandler:self
           andSelector:@selector(handleGetURLEvent:withReplyEvent:)
         forEventClass:kInternetEventClass
            andEventID:kAEGetURL];`,
      anchor: /\[super applicationDidFinishLaunching:notification\];/,
      offset: 1,
      comment: "//",
    });

    contents = mergeOrThrow(contents, {
      tag: "miwa-google-sign-in-handler",
      src: `- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event
            withReplyEvent:(NSAppleEventDescriptor *)replyEvent
{
  NSString *URLString = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
  if (URLString != nil) {
    [[GIDSignIn sharedInstance] handleURL:[NSURL URLWithString:URLString]];
  }
}
`,
      anchor: /- \(NSURL \*\)sourceURLForBridge:/,
      offset: 0,
      comment: "//",
    });

    mod.modResults.contents = contents;
    return mod;
  });
}

function withGoogleInfoPlist(config) {
  return withInfoPlist(config, (mod) => {
    const urlTypes = (mod.modResults.CFBundleURLTypes ?? []).filter(
      (entry) => entry.CFBundleURLName !== "Google Sign-In",
    );
    const hasAppScheme = urlTypes.some((entry) =>
      entry.CFBundleURLSchemes?.includes("com.ib.miwa"),
    );
    if (!hasAppScheme) {
      urlTypes.push({ CFBundleURLSchemes: ["com.ib.miwa"] });
    }
    urlTypes.push({
      CFBundleURLName: "Google Sign-In",
      CFBundleURLSchemes: ["$(GOOGLE_REVERSED_CLIENT_ID)"],
    });

    mod.modResults.GIDClientID = "$(GOOGLE_CLIENT_ID)";
    mod.modResults.CFBundleURLTypes = urlTypes;
    return mod;
  });
}

function withGoogleEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    Object.assign(mod.modResults, {
      "com.apple.security.app-sandbox": true,
      "com.apple.security.files.user-selected.read-only": true,
      "com.apple.security.network.client": true,
      "keychain-access-groups": ["$(AppIdentifierPrefix)$(CFBundleIdentifier)"],
    });
    return mod;
  });
}

function withGoogleBuildSettings(config, { clientId, reversedClientId }) {
  return withXcodeProject(config, (mod) => {
    const nativeTargets = mod.modResults.pbxNativeTargetSection();
    for (const [key, target] of Object.entries(nativeTargets)) {
      if (
        key.endsWith("_comment") ||
        !target.buildConfigurationList ||
        !target.name?.includes("-macOS")
      ) {
        continue;
      }
      const configurations = MacOSConfig.XcodeUtils.getBuildConfigurationsForListId(
        mod.modResults,
        target.buildConfigurationList,
      );
      for (const [, configuration] of configurations) {
        configuration.buildSettings.GOOGLE_CLIENT_ID = JSON.stringify(clientId);
        configuration.buildSettings.GOOGLE_REVERSED_CLIENT_ID = JSON.stringify(reversedClientId);
      }
    }
    return mod;
  });
}

module.exports = function withGoogleSignIn(config, options) {
  if (!options?.clientId || !options?.reversedClientId) {
    throw new Error("Google Sign-In requires clientId and reversedClientId");
  }
  config = withGoogleAppDelegate(config);
  config = withGoogleInfoPlist(config);
  config = withGoogleEntitlements(config);
  config = withGoogleBuildSettings(config, options);
  return config;
};
