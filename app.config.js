const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  const appConfig = require('./app.json').expo;

  // Remove push notification capabilities for personal development team
  const plugins = appConfig.plugins || [];

  // Filter out expo-notifications plugin for iOS personal team builds
  const filteredPlugins = plugins.filter(plugin => {
    if (Array.isArray(plugin)) {
      return plugin[0] !== 'expo-notifications';
    }
    return plugin !== 'expo-notifications';
  });

  return {
    ...appConfig,
    plugins: filteredPlugins,
    ios: {
      ...appConfig.ios,
      // Remove push notification entitlements for personal team
      entitlements: {
        // Empty entitlements - no push notifications
      }
    }
  };
};
