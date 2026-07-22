import type { ViewProps } from 'react-native';

export type NativeMailViewerProps = ViewProps & {
  html?: string;
  plainText: string;
};
