import { DeviceEventEmitter } from 'react-native';

export const SETTINGS_CHANGED_EVENT = 'miwa-settings-changed';

export type SettingsChangeKind =
  'preferences' | 'accounts' | 'download-complete' | 'database-cleared';

export type SettingsChangedPayload = { kind: SettingsChangeKind };

/**
 * Cross-window bus between the main mail window and the separate native
 * settings window. Both windows mount surfaces on the same React host, so
 * these events reach every mounted root.
 */
export function emitSettingsChanged(payload: SettingsChangedPayload): void {
  DeviceEventEmitter.emit(SETTINGS_CHANGED_EVENT, payload);
}

export function subscribeSettingsChanged(listener: (payload: SettingsChangedPayload) => void): {
  remove: () => void;
} {
  const subscription = DeviceEventEmitter.addListener(SETTINGS_CHANGED_EVENT, listener);
  return { remove: () => subscription.remove() };
}
