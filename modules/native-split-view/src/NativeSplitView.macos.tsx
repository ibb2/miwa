import { requireNativeView } from 'expo';
import { forwardRef, type ComponentType, type RefAttributes } from 'react';

import type { NativeSplitViewProps, NativeSplitViewRef } from './NativeSplitView.types';

const NativeView = requireNativeView<NativeSplitViewProps>(
  'NativeSplitView',
  'NativeSplitView'
) as ComponentType<NativeSplitViewProps & RefAttributes<NativeSplitViewRef>>;

export const NativeSplitView = forwardRef<NativeSplitViewRef, NativeSplitViewProps>(
  function NativeSplitView(props, ref) {
    return <NativeView {...props} ref={ref} />;
  }
);
