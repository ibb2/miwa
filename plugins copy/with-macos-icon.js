const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');
const {
  MacOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require('expo-desktop-config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const ICON_FILE_TYPE = 'folder.iconcomposer.icon';

function getIconPath(config) {
  const icon = config.macos?.icon;
  if (typeof icon === 'string' && path.extname(icon) === '.icon') {
    return icon;
  }
  return null;
}

function iconFileName(iconPath) {
  return path.basename(iconPath);
}

function iconAssetName(iconPath) {
  return path.basename(iconPath, '.icon');
}

function withMacosIconCopy(config) {
  return withDangerousMod(config, [
    'macos',
    async (mod) => {
      const icon = getIconPath(mod);
      if (!icon) return mod;

      const projectRoot = mod.modRequest.projectRoot;
      const source = path.join(projectRoot, icon);
      if (!fs.existsSync(source)) {
        console.warn(`macos: icon: Icon Composer file not found at path: ${icon}`);
        return mod;
      }

      const projectName = MacOSConfig.XcodeUtils.getProjectName(projectRoot, 'macos');
      const dest = path.join(projectRoot, 'macos', projectName, iconFileName(icon));
      await fs.promises.rm(dest, { recursive: true, force: true });
      await fs.promises.cp(source, dest, { recursive: true });
      return mod;
    },
  ]);
}

function withMacosIconXcode(config) {
  return withXcodeProject(config, (mod) => {
    const icon = getIconPath(mod);
    if (!icon) return mod;

    const iconName = iconAssetName(icon);
    const iconFile = iconFileName(icon);
    const projectName = MacOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot, 'macos');
    const nativeTargets = mod.modResults.pbxNativeTargetSection();

    for (const [key, target] of Object.entries(nativeTargets)) {
      if (
        key.endsWith('_comment') ||
        !target.buildConfigurationList ||
        !target.name?.includes('-macOS')
      ) {
        continue;
      }
      const configurations = MacOSConfig.XcodeUtils.getBuildConfigurationsForListId(
        mod.modResults,
        target.buildConfigurationList,
      );
      for (const [, configuration] of configurations) {
        if (configuration.buildSettings) {
          configuration.buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = iconName;
        }
      }
      mod.modResults = MacOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: iconFile,
        groupName: projectName,
        project: mod.modResults,
        isBuildFile: true,
        verbose: true,
        targetUuid: key,
      });
    }

    const fileRefs = mod.modResults.pbxFileReferenceSection();
    for (const ref of Object.values(fileRefs)) {
      if (!ref || typeof ref !== 'object' || !ref.path) continue;
      const refPath = String(ref.path).replaceAll('"', '');
      if (path.basename(refPath) !== iconFile) continue;
      ref.path = iconFile;
      ref.sourceTree = '"<group>"';
      ref.lastKnownFileType = ICON_FILE_TYPE;
      delete ref.explicitFileType;
      delete ref.fileEncoding;
    }

    return mod;
  });
}

function withMacosIconPlist(config) {
  return withInfoPlist(config, (mod) => {
    const icon = getIconPath(mod);
    if (!icon) return mod;
    mod.modResults.CFBundleIconName = iconAssetName(icon);
    return mod;
  });
}

function withMacosDevIcon(config) {
  return withAppDelegate(config, (mod) => {
    if (!getIconPath(mod)) return mod;
    mod.modResults.contents = mergeContents({
      src: mod.modResults.contents,
      newSrc: `#if DEBUG
  // Development launches can retain the generic Dock icon despite a valid asset catalog.
  NSString *iconName = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleIconName"];
  NSString *iconPath = [[NSBundle mainBundle] pathForResource:iconName ofType:@"icns"];
  NSImage *icon = iconPath ? [[NSImage alloc] initWithContentsOfFile:iconPath] : nil;
  if (icon != nil) {
    [NSApp setApplicationIconImage:icon];
  }
#endif`,
      tag: 'miwa-dev-dock-icon',
      anchor: /\[super applicationDidFinishLaunching:notification\];/,
      offset: 1,
      comment: '//',
    }).contents;
    return mod;
  });
}

module.exports = function withMacosIcon(config) {
  config = withMacosIconCopy(config);
  config = withMacosIconXcode(config);
  config = withMacosIconPlist(config);
  config = withMacosDevIcon(config);
  return config;
};
