import { Host, Label } from '@expo/ui/swift-ui';

import type { NativeSectionLabelProps } from './native-section-label';

export function NativeSectionLabel({
  label,
  systemImage,
}: NativeSectionLabelProps) {
  return (
    <Host style={{ width: 180, height: 18 }}>
      <Label
        color="gray"
        systemImage={systemImage as never}
        title={label}
      />
    </Host>
  );
}
