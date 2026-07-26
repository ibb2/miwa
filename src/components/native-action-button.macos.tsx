import type { ComponentProps, ComponentType } from 'react';
import { Button, Host } from '@expo/ui/swift-ui';

import type { NativeActionButtonProps } from './native-action-button';

type PatchedButtonProps = ComponentProps<typeof Button> & {
  accessibilityLabel?: string;
};

const PatchedButton = Button as ComponentType<PatchedButtonProps>;

export function NativeActionButton({
  accessibilityLabel,
  label,
  onPress,
  role = 'default',
  systemImage,
  variant = 'glass',
}: NativeActionButtonProps) {
  const buttonWidth = systemImage
    ? 32
    : Math.max(76, Math.min(180, label.length * 7 + 30));

  return (
    <Host style={{ width: buttonWidth, height: 32 }}>
      <PatchedButton
        accessibilityLabel={accessibilityLabel ?? label}
        color={role === 'destructive' ? 'red' : '#E86E5A'}
        controlSize="small"
        onPress={onPress}
        role={role}
        systemImage={systemImage as never}
        variant={variant}
      >
        {systemImage ? undefined : label}
      </PatchedButton>
    </Host>
  );
}
