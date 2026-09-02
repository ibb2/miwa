import { Button, Host, type ButtonProps } from '@expo/ui/swift-ui';
import { accessibilityLabel as accessibilityLabelModifier } from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';

export type NativeActionButtonProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  role?: ButtonProps['role'];
  systemImage?: ButtonProps['systemImage'];
  variant?: ButtonProps['variant'];
};

export function NativeActionButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  role = 'default',
  systemImage,
  variant = 'glass',
}: NativeActionButtonProps) {
  const buttonWidth = systemImage
    ? 34
    : Math.max(80, Math.min(184, label.length * 7 + 34));

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      onAccessibilityTap={onPress}
      style={{ width: buttonWidth, height: 34 }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Host style={{ width: buttonWidth, height: 34 }}>
          <Button
            color={role === 'destructive' ? 'red' : '#E86E5A'}
            controlSize="small"
            disabled={disabled}
            modifiers={[accessibilityLabelModifier(accessibilityLabel ?? label)]}
            onPress={onPress}
            role={role}
            systemImage={systemImage}
            variant={variant}
          >
            {systemImage ? ' ' : label}
          </Button>
        </Host>
      </View>
    </View>
  );
}
