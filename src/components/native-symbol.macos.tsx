import { Host, Image } from '@expo/ui/swift-ui';

import type { NativeSymbolProps } from './native-symbol';

export function NativeSymbol({ systemName }: NativeSymbolProps) {
  return (
    <Host style={{ width: 32, height: 32 }}>
      <Image color="#E86E5A" size={20} systemName={systemName as never} />
    </Host>
  );
}
