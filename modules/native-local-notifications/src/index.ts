import { Platform } from 'react-native';

export type NotificationPermissionStatus = 'notDetermined' | 'denied' | 'authorized';

export type NotificationResponse = { accountId?: string; threadId?: string };

type NativeLocalNotificationsModule = {
  getPermissionStatus(): Promise<NotificationPermissionStatus>;
  requestPermissions(): Promise<NotificationPermissionStatus>;
  postNewMail(
    identifier: string,
    title: string,
    body: string,
    sound: boolean,
    accountId: string,
    threadId: string,
  ): Promise<void>;
  setBadgeCount(count: number): Promise<void>;
  clearDelivered(): Promise<void>;
  openSystemNotificationSettings(): Promise<void>;
};

type EventSubscription = { remove: () => void };

let nativeModule: NativeLocalNotificationsModule | undefined;
let responseEmitter:
  | {
      addListener: (
        event: string,
        listener: (event: NotificationResponse) => void,
      ) => EventSubscription;
    }
  | undefined;
let emitterResolved = false;

function getNativeModule(): NativeLocalNotificationsModule | undefined {
  if (Platform.OS !== 'macos') return undefined;
  try {
    if (!nativeModule) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { requireNativeModule } = require('expo') as {
        requireNativeModule<T>(name: string): T;
      };
      nativeModule = requireNativeModule<NativeLocalNotificationsModule>(
        'NativeLocalNotifications',
      );
    }
    return nativeModule;
  } catch {
    return undefined;
  }
}

function getResponseEmitter() {
  if (emitterResolved) return responseEmitter;
  emitterResolved = true;
  try {
    const module = getNativeModule();
    if (!module) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require('expo-modules-core') as {
      EventEmitter: new (module: unknown) => {
        addListener: (
          event: string,
          listener: (event: NotificationResponse) => void,
        ) => EventSubscription;
      };
    };
    responseEmitter = new EventEmitter(module);
  } catch {
    responseEmitter = undefined;
  }
  return responseEmitter;
}

/** True on macOS builds that ship the native notifications module. */
export function supportsLocalNotifications(): boolean {
  return getNativeModule() !== undefined;
}

export async function getNotificationPermission(): Promise<NotificationPermissionStatus> {
  const status = await getNativeModule()?.getPermissionStatus();
  return status ?? 'denied';
}

/** Prompts once; the first prompt registers Miwa in System Settings > Notifications. */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const status = await getNativeModule()?.requestPermissions();
  return status ?? 'denied';
}

export async function postNewMailNotification(options: {
  identifier: string;
  title: string;
  body: string;
  sound: boolean;
  accountId: string;
  threadId: string;
}): Promise<void> {
  await getNativeModule()?.postNewMail(
    options.identifier,
    options.title,
    options.body,
    options.sound,
    options.accountId,
    options.threadId,
  );
}

export async function setAppBadgeCount(count: number): Promise<void> {
  await getNativeModule()?.setBadgeCount(Math.max(0, Math.floor(count)));
}

export async function clearDeliveredNotifications(): Promise<void> {
  await getNativeModule()?.clearDelivered();
}

export async function openSystemNotificationSettings(): Promise<void> {
  await getNativeModule()?.openSystemNotificationSettings();
}

/** Fires when the user clicks a mail notification. No-op off macOS. */
export function addNotificationResponseListener(
  listener: (response: NotificationResponse) => void,
): EventSubscription {
  const emitter = getResponseEmitter();
  if (!emitter) return { remove: () => undefined };
  return emitter.addListener('onNotificationResponse', listener);
}
