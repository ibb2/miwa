import { Divider, Host } from '@expo/ui/swift-ui';

export function NativeDivider() {
  return (
    <Host style={{ height: 1, marginLeft: 16 }}>
      <Divider />
    </Host>
  );
}
