import { Switch } from 'react-native';

export type NativePreferenceSwitchProps = {
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
};

export function NativePreferenceSwitch({
  label,
  onValueChange,
  value,
}: NativePreferenceSwitchProps) {
  return (
    <Switch
      accessibilityLabel={label}
      onValueChange={onValueChange}
      value={value}
    />
  );
}
