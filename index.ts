import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import { NotificationEmail } from './src/mail/notification-email';
import { SettingsApp } from './src/settings/settings-app';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Second surface for the separate native macOS settings window.
// AppDelegate.openSettingsWindow mounts this root in its own NSWindow.
AppRegistry.registerComponent('MiwaSettings', () => SettingsApp);
AppRegistry.registerComponent('MiwaNotificationEmail', () => NotificationEmail);
