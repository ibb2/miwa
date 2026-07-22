import { requireNativeView } from 'expo';
import { forwardRef, type ComponentType, type RefAttributes } from 'react';

import type {
  NativeWindowToolbarProps,
  NativeWindowToolbarRef,
} from './NativeWindowToolbar.types';

const NativeView = requireNativeView<NativeWindowToolbarProps>(
  'NativeWindowToolbar',
  'NativeWindowToolbar'
) as ComponentType<
  NativeWindowToolbarProps & RefAttributes<NativeWindowToolbarRef>
>;

export const NativeWindowToolbar = forwardRef<
  NativeWindowToolbarRef,
  NativeWindowToolbarProps
>(function NativeWindowToolbar(props, ref) {
  return <NativeView {...props} ref={ref} />;
});
