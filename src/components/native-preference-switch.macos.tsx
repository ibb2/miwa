import { Host, Switch } from '@expo/ui/swift-ui';

import type { NativePreferenceSwitchProps } from './native-preference-switch';

export function NativePreferenceSwitch({
  label,
  onValueChange,
  value,
}: NativePreferenceSwitchProps) {
  return (
    <Host style={{ width: 44, height: 24 }}>
      <Switch
        color="#E86E5A"
        label={label}
        onValueChange={onValueChange}
        value={value}
        variant="switch"
      />
    </Host>
  );
}
