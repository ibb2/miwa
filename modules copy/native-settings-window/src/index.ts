import { Platform } from 'react-native';

type NativeSettingsWindowModule = {
  openSettings(): Promise<void>;
  closeSettings(): Promise<void>;
};

let nativeModule: NativeSettingsWindowModule | undefined;

function getNativeModule(): NativeSettingsWindowModule | undefined {
  if (Platform.OS !== 'macos') return undefined;
  try {
    if (!nativeModule) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { requireNativeModule } = require('expo') as {
        requireNativeModule<T>(name: string): T;
      };
      nativeModule = requireNativeModule<NativeSettingsWindowModule>('NativeSettingsWindow');
    }
    return nativeModule;
  } catch {
    return undefined;
  }
}

/** Opens the native macOS settings window. No-op off macOS. */
export async function openSettingsWindow(): Promise<void> {
  await getNativeModule()?.openSettings();
}

/** Closes the native macOS settings window. No-op off macOS. */
export async function closeSettingsWindow(): Promise<void> {
  await getNativeModule()?.closeSettings();
}
