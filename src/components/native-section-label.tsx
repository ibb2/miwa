import {
  Button,
  Host,
} from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';
import { View } from 'react-native';

export type NativeSectionLabelProps = {
  label: string;
  systemImage?: SFSymbol;
};

export function NativeSectionLabel({ label, systemImage }: NativeSectionLabelProps) {
  const labelWidth = Math.max(72, Math.min(240, label.length * 7 + 24));

  return (
    <View style={{ height: 34, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {systemImage ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Host style={{ width: 24, height: 34 }}>
            <Button
              color="gray"
              controlSize="mini"
              systemImage={systemImage}
              variant="plain"
            >
              {' '}
            </Button>
          </Host>
        </View>
      ) : null}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Host style={{ width: labelWidth, height: 34 }}>
          <Button
            color="gray"
            controlSize="mini"
            variant="plain"
          >
            {label}
          </Button>
        </Host>
      </View>
    </View>
  );
}
