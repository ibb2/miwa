import { Text } from 'react-native';

import type { NativeMailViewerProps } from './NativeMailViewer.types';

export function NativeMailViewer({ plainText, style }: NativeMailViewerProps) {
  return <Text style={style}>{plainText}</Text>;
}
