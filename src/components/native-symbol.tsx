import { PlatformColor, StyleSheet, Text, View } from 'react-native';

export type NativeSymbolProps = {
  fallback: string;
  systemName: string;
};

export function NativeSymbol({ fallback }: NativeSymbolProps) {
  return (
    <View style={styles.container}>
      <Text selectable style={styles.fallback}>{fallback}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: '#E86E5A',
  },
  fallback: {
    color: PlatformColor('selectedMenuItemTextColor'),
    fontSize: 13,
    fontWeight: '700',
  },
});
