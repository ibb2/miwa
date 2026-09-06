import type { ViewProps } from 'react-native';

export type NativeMailViewerProps = ViewProps & {
  onContentHeightChange?: (event: { nativeEvent: { height: number } }) => void;
  html?: string;
  plainText: string;
};
