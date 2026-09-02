import { Host, Image as SwiftUIImage, type ImageProps } from '@expo/ui/swift-ui';
import { Image, StyleSheet, Text, View } from 'react-native';

export type NativeSymbolProps = {
  color?: string;
  fallback: string;
  imageUri?: string;
  preferFallback?: boolean;
  systemName: ImageProps['systemName'];
};

export function NativeSymbol({
  color = '#E86E5A',
  fallback,
  imageUri,
  preferFallback = false,
  systemName,
}: NativeSymbolProps) {
  if (imageUri) {
    return <Image accessibilityIgnoresInvertColors source={{ uri: imageUri }} style={styles.avatar} />;
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
});
