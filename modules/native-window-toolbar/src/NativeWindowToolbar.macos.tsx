import { requireNativeView } from 'expo';
import { type ComponentType, type RefAttributes } from 'react';

import type { NativeWindowToolbarProps, NativeWindowToolbarRef } from './NativeWindowToolbar.types';

export const NativeWindowToolbar = requireNativeView<NativeWindowToolbarProps>(
  'NativeWindowToolbar',
  'NativeWindowToolbar',
) as ComponentType<NativeWindowToolbarProps & RefAttributes<NativeWindowToolbarRef>>;
