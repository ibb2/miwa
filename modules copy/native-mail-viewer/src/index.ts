import { Platform } from 'react-native';

export { NativeMailViewer } from './NativeMailViewer';
export type { NativeMailViewerProps } from './NativeMailViewer.types';

export type AttachmentExport = {
  filename: string;
  dataBase64: string;
};

type NativeMailViewerModule = {
  saveAttachment(attachment: AttachmentExport): Promise<string | null>;
  saveAttachments(attachments: AttachmentExport[]): Promise<string | null>;
};

let nativeModule: NativeMailViewerModule | undefined;

function getNativeModule(): NativeMailViewerModule {
  if (Platform.OS !== 'macos') throw new Error('Saving attachments is only available on macOS.');
  if (!nativeModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo') as {
      requireNativeModule<T>(name: string): T;
    };
    nativeModule = requireNativeModule<NativeMailViewerModule>('NativeMailViewer');
  }
  return nativeModule;
}

export async function saveAttachment(attachment: AttachmentExport): Promise<string | undefined> {
  return (await getNativeModule().saveAttachment(attachment)) ?? undefined;
}

export async function saveAttachments(
  attachments: AttachmentExport[],
): Promise<string | undefined> {
  return (await getNativeModule().saveAttachments(attachments)) ?? undefined;
}
