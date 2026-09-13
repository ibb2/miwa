import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';

import type { NativeThreadRowProps } from './NativeThreadRow.types';

export const NativeThreadRow = requireNativeView<NativeThreadRowProps>(
  'NativeThreadRow',
  'NativeThreadRow',
) as ComponentType<NativeThreadRowProps>;
