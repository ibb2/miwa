import { Image, PlatformColor, StyleSheet, Text, View } from 'react-native';

export type NativeSymbolProps = {
  color?: string;
  fallback: string;
  imageUri?: string;
  preferFallback?: boolean;
  systemName: string;
};

export function NativeSymbol({ color = '#E86E5A', fallback, imageUri }: NativeSymbolProps) {
  if (imageUri) {
    return <Image accessibilityIgnoresInvertColors source={{ uri: imageUri }} style={styles.image} />;
  }
  return (
    <View style={[styles.container, { backgroundColor: color }]}>
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
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  fallback: {
    color: PlatformColor('selectedMenuItemTextColor'),
    fontSize: 13,
    fontWeight: '700',
  },
  image: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
});
