import {
  Button,
  ContentUnavailableView,
  Divider,
  Host,
  Image as SwiftUIImage,
  VStack,
  type ButtonProps,
  type ImageProps,
} from '@expo/ui/swift-ui';
import { accessibilityLabel as accessibilityLabelModifier } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Image, StyleSheet, Switch, Text, View } from 'react-native';

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

/** A real SwiftUI button. Icon buttons render compactly; text buttons size to their label. */
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
  );
}

export function NativeTabButton({
  count,
  label,
  onPress,
  selected,
}: {
  count: number;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const title = `${label}  ${count.toLocaleString()}`;
  const width = Math.max(84, title.length * 7 + 30);

  return (
    <Host style={{ width, height: 38 }}>
      <Button
        color={accent}
        controlSize="regular"
        modifiers={[accessibilityLabelModifier(`${label}, ${count.toLocaleString()} emails`)]}
        onPress={onPress}
        variant={selected ? 'glassProminent' : 'plain'}
      >
        {title}
      </Button>
    </Host>
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
    <Switch
      accessibilityLabel={label}
      onTintColor={accent}
      onValueChange={onValueChange}
      style={{ width: 38, height: 22 }}
      value={value}
    />
  );
}

type NativeSectionLabelProps = {
  label: string;
  systemImage?: SFSymbol;
};

/** A small gray section heading, optionally preceded by an SF Symbol. */
export function NativeSectionLabel({ label, systemImage }: NativeSectionLabelProps) {
  return (
    <View style={styles.sectionLabel}>
      {systemImage ? (
        <Host style={styles.sectionIcon}>
          <SwiftUIImage color="secondary" size={12} systemName={systemImage} />
        </Host>
      ) : null}
      <Text style={styles.sectionText}>{label}</Text>
    </View>
  );
}

export function NativeEmptyState({
  actionLabel,
  description,
  onAction,
  systemImage = 'tray',
  title,
}: {
  actionLabel?: string;
  description: string;
  onAction?: () => void;
  systemImage?: ImageProps['systemName'];
  title: string;
}) {
  return (
    <View style={styles.emptyContainer}>
      <Host style={styles.emptyHost}>
        <VStack alignment="center" spacing={14}>
          <ContentUnavailableView description={description} systemImage={systemImage} title={title} />
          {actionLabel && onAction ? (
            <Button color={accent} onPress={onAction} variant="borderedProminent">{actionLabel}</Button>
          ) : null}
        </VStack>
      </Host>
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
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionIcon: { width: 14, height: 14 },
  sectionText: { color: '#6E6E73', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyHost: { width: 460, height: 220 },
});
