import {
  Button,
  ContentUnavailableView,
  Divider,
  Host as SwiftUIHost,
  Image as SwiftUIImage,
  VStack,
  type ButtonProps,
  type ImageProps,
} from '@expo/ui/swift-ui';
import { withUniwind } from 'uniwind';

import { accent } from './native-colors';
import { accessibilityLabel as accessibilityLabelModifier } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Image, Text, View } from 'react-native';

const Host = withUniwind(SwiftUIHost);

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
    <Host className="h-[34px]" style={{ width }}>
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
    <Host className="h-[38px]" style={{ width }}>
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
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: imageUri }}
        className="w-[32px] h-[32px] items-center justify-center rounded-[16px] border-continuous overflow-hidden"
      />
    );
  }
  return (
    <View
      className="w-[32px] h-[32px] items-center justify-center rounded-[16px] border-continuous overflow-hidden"
      style={{ backgroundColor: color }}
    >
      {preferFallback ? (
        <Text className="text-[#FFFFFF] text-[12px] font-bold">{fallback}</Text>
      ) : (
        <Host className="w-[18px] h-[18px]">
          <SwiftUIImage color="white" size={16} systemName={systemName} />
        </Host>
      )}
    </View>
  );
}

/** A hairline row separator, inset past a leading icon. */
export function NativeDivider() {
  return (
    <Host className="h-[1px] ml-[16px]">
      <Divider />
    </Host>
  );
}

type NativeSectionLabelProps = {
  label: string;
  systemImage?: SFSymbol;
};

/** A small gray section heading, optionally preceded by an SF Symbol. */
export function NativeSectionLabel({ label, systemImage }: NativeSectionLabelProps) {
  return (
    <View className="flex-row items-center gap-[6px]">
      {systemImage ? (
        <Host className="w-[14px] h-[14px]">
          <SwiftUIImage color="secondary" size={12} systemName={systemImage} />
        </Host>
      ) : null}
      <Text className="text-[#6E6E73] text-[10px] font-semibold tracking-[0.5px]">{label}</Text>
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
    <View className="flex-1 items-center justify-center">
      <Host className="w-[460px] h-[220px]">
        <VStack alignment="center" spacing={14}>
          <ContentUnavailableView
            description={description}
            systemImage={systemImage}
            title={title}
          />
          {actionLabel && onAction ? (
            <Button color={accent} onPress={onAction} variant="borderedProminent">
              {actionLabel}
            </Button>
          ) : null}
        </VStack>
      </Host>
    </View>
  );
}
