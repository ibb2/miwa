import { Pressable, Text, View } from 'react-native';

import type { NativeThreadRowProps } from './NativeThreadRow.types';

export function NativeThreadRow({
  sender,
  subject,
  dateText,
  style,
  onRowPress,
}: NativeThreadRowProps) {
  return (
    <Pressable
      accessibilityLabel={`${sender}, ${subject || 'No subject'}`}
      accessibilityRole="button"
      onPress={() => onRowPress?.({ nativeEvent: {} })}
      style={[{ width: '100%', height: 58, flexDirection: 'row', alignItems: 'center' }, style]}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13 }}>
          {sender}
        </Text>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
          {subject}
        </Text>
        <Text style={{ fontSize: 12 }}>{dateText}</Text>
      </View>
    </Pressable>
  );
}
