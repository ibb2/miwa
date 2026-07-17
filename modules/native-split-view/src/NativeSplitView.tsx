import { forwardRef } from 'react';
import { View } from 'react-native';

import type { NativeSplitViewProps, NativeSplitViewRef } from './NativeSplitView.types';

export const NativeSplitView = forwardRef<NativeSplitViewRef, NativeSplitViewProps>(
  function NativeSplitView(
    { children, orientation = 'horizontal', style, ...props },
    ref
  ) {
    return (
      <View
        {...props}
        ref={ref as never}
        style={[
          {
            flex: 1,
            flexDirection: orientation === 'horizontal' ? 'row' : 'column',
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
);
