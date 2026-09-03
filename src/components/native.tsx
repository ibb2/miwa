import {
  Button,
  Divider,
  Host,
  Image as SwiftUIImage,
  Switch,
  type ButtonProps,
  type ImageProps,
} from '@expo/ui/swift-ui';
import { accessibilityLabel as accessibilityLabelModifier } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Image, StyleSheet, Text, View } from 'react-native';

import { accent } from '../theme';

type NativeActionButtonProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  role?: ButtonProps['role'];
  systemImage?: ButtonProps['systemImage'];
  variant?: ButtonProps['variant'];
};

/** A real SwiftUI button. Icon buttons render as circles, text buttons size to their label. */
export function NativeActionButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  role = 'default',
  systemImage,
  variant = 'glass',
}: NativeActionButtonProps) {
  const width = systemImage ? 34 : Math.max(80, Math.min(184, label.length * 7 + 34));

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      onAccessibilityTap={onPress}
      style={{ width, height: 34 }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Host style={{ width, height: 34 }}>
          <Button
            color={role === 'destructive' ? 'red' : accent}
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

type NativeSymbolProps = {
  color?: string;
  fallback: string;
  imageUri?: string;
  preferFallback?: boolean;
  systemName: ImageProps['systemName'];
};

/** A round avatar: profile image, initials, or an SF Symbol in a tinted circle. */
export function NativeSymbol({
  color = accent,
  fallback,
  imageUri,
  preferFallback = false,
  systemName,
}: NativeSymbolProps) {
  if (imageUri) {
    return (
      <Image accessibilityIgnoresInvertColors source={{ uri: imageUri }} style={styles.avatar} />
    );
  }
  return (
    <View style={[styles.avatar, { backgroundColor: color }]}>
      {preferFallback ? (
        <Text style={styles.initials}>{fallback}</Text>
      ) : (
        <Host style={styles.iconHost}>
          <SwiftUIImage color="white" size={16} systemName={systemName} />
        </Host>
      )}
    </View>
  );
}

/** A hairline row separator, inset past a leading icon. */
export function NativeDivider() {
  return (
    <Host style={{ height: 1, marginLeft: 16 }}>
      <Divider />
    </Host>
  );
}

type NativeSwitchProps = {
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
};

export function NativeSwitch({ label, onValueChange, value }: NativeSwitchProps) {
  return (
    <Host style={{ width: 44, height: 24 }}>
      <Switch color={accent} label={label} onValueChange={onValueChange} value={value} variant="switch" />
    </Host>
  );
}

type NativeSectionLabelProps = {
  label: string;
  systemImage?: SFSymbol;
};

/** A small gray section heading, optionally preceded by an SF Symbol. */
export function NativeSectionLabel({ label, systemImage }: NativeSectionLabelProps) {
  const labelWidth = Math.max(72, Math.min(240, label.length * 7 + 24));

  return (
    <View style={styles.sectionLabel}>
      {systemImage ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Host style={{ width: 24, height: 34 }}>
            <Button color="gray" controlSize="mini" systemImage={systemImage} variant="plain">
            </Button>
          </Host>
        </View>
      ) : null}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Host matchContents>
          <Text style={{ fontSize: 10}}>{label}</Text>
        </Host>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  iconHost: { width: 18, height: 18 },
  initials: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  sectionLabel: { height: 34, flexDirection: 'row', alignItems: 'center'},
});
