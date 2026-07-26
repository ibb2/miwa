import { Pressable, StyleSheet, Text } from 'react-native';

export type NativeActionButtonProps = {
  accessibilityLabel?: string;
  label: string;
  onPress: () => void;
  role?: 'default' | 'destructive';
  systemImage?: string;
  variant?: 'bordered' | 'plain' | 'glass' | 'glassProminent';
};

export function NativeActionButton({
  accessibilityLabel,
  label,
  onPress,
  role = 'default',
  variant = 'bordered',
}: NativeActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'plain' && styles.plainButton,
        (variant === 'glass' || variant === 'glassProminent') && styles.glassButton,
        role === 'destructive' && styles.destructiveButton,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          role === 'destructive' && styles.destructiveLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(232, 110, 90, 0.11)',
  },
  plainButton: { backgroundColor: 'transparent' },
  glassButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.46)',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  destructiveButton: { backgroundColor: 'rgba(255, 59, 48, 0.09)' },
  label: { color: '#C95243', fontSize: 11, fontWeight: '600' },
  destructiveLabel: { color: '#C9342D' },
  pressed: { opacity: 0.58 },
});
