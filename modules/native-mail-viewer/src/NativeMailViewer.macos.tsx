import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';

import type { NativeMailViewerProps } from './NativeMailViewer.types';

export const NativeMailViewer = requireNativeView<NativeMailViewerProps>(
  'NativeMailViewer',
  'NativeMailViewer',
) as ComponentType<NativeMailViewerProps>;
