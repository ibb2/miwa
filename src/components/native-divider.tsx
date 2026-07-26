import { PlatformColor, StyleSheet, View } from 'react-native';

export function NativeDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PlatformColor('separatorColor'),
    marginLeft: 16,
  },
});
