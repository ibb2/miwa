import { requireNativeView } from 'expo';
import { forwardRef, type ComponentType, type RefAttributes } from 'react';

import type { NativeSplitViewProps, NativeSplitViewRef } from './NativeSplitView.types';

const NativeView = requireNativeView<NativeSplitViewProps>(
  'NativeSplitView',
  'NativeSplitView'
) as ComponentType<NativeSplitViewProps & RefAttributes<NativeSplitViewRef>>;

export const NativeSplitView = forwardRef<NativeSplitViewRef, NativeSplitViewProps>(
  function NativeSplitView(
    { orientation = 'horizontal', style, ...props },
    ref
  ) {
    return (
      <NativeView
        {...props}
        orientation={orientation}
        ref={ref}
        style={[
          {
            flex: 1,
            flexDirection: orientation === 'horizontal' ? 'row' : 'column',
          },
          style,
        ]}
      />
    );
  }
);
