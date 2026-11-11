const { getDefaultConfig } = require('@expo/metro-config');
const { makeMetroConfig } = require('@rnx-kit/metro-config');

const { withUniwindConfig } = require('uniwind/metro');

const config = makeMetroConfig(getDefaultConfig(__dirname));
config.resolver.platforms = ['ios', 'android', 'macos', 'windows', 'web'];
config.resolver.unstable_conditionsByPlatform = {
  ...config.resolver.unstable_conditionsByPlatform,
  macos: ['react-native'],
};
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
