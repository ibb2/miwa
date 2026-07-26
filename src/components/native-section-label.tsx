import { PlatformColor, StyleSheet, Text } from 'react-native';

export type NativeSectionLabelProps = {
  label: string;
  systemImage?: string;
};

export function NativeSectionLabel({ label }: NativeSectionLabelProps) {
  return <Text selectable style={styles.label}>{label}</Text>;
}

const styles = StyleSheet.create({
  label: {
    color: PlatformColor('secondaryLabelColor'),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
