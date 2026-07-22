const { getDefaultConfig } = require("@expo/metro-config");
const { makeMetroConfig } = require("@rnx-kit/metro-config");

const config = makeMetroConfig(getDefaultConfig(__dirname));
config.resolver.platforms = [...new Set([...config.resolver.platforms, "macos"])];
config.resolver.unstable_conditionsByPlatform = {
  ...config.resolver.unstable_conditionsByPlatform,
  macos: ["react-native"],
};

module.exports = config;
