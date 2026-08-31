import { Host, Image } from '@expo/ui/swift-ui';
import { Image as NativeImage, StyleSheet, Text, View } from 'react-native';

import type { NativeSymbolProps } from './native-symbol';

export function NativeSymbol({
  color = '#E86E5A',
  fallback,
  imageUri,
  preferFallback = false,
  systemName,
}: NativeSymbolProps) {
  if (imageUri) {
    return (
      <NativeImage
        accessibilityIgnoresInvertColors
        source={{ uri: imageUri }}
        style={styles.avatarImage}
      />
    );
  }
  return (
    <View style={[styles.container, { backgroundColor: color }]}>
      {preferFallback ? (
        <Text style={styles.initials}>{fallback}</Text>
      ) : (
        <Host style={styles.iconHost}>
          <Image color="white" size={16} systemName={systemName as never} />
        </Host>
      )}
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
  iconHost: { width: 18, height: 18 },
  initials: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  avatarImage: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
});
