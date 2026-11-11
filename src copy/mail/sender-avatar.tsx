import { useState } from 'react';
import { Image, Text, View } from 'react-native';

const avatarColors = ['#5B7CFA', '#8B5CF6', '#D05B9C', '#E66A4E', '#C58A20', '#3A9B72', '#338BA8'];

export function senderIdentity(sender: string) {
  const bracket = sender.lastIndexOf('<');
  const email = (bracket >= 0 ? sender.slice(bracket + 1).replace(/>.*$/, '') : sender)
    .trim()
    .toLowerCase();
  const name =
    bracket > 0
      ? sender
          .slice(0, bracket)
          .trim()
          .replace(/^['"]|['"]$/g, '')
      : '';
  const parts = (name || email.split('@')[0]).split(/[\s._-]+/).filter(Boolean);
  const initials =
    `${parts[0]?.[0] ?? '?'}${parts.length > 1 ? parts.at(-1)![0] : ''}`.toUpperCase();
  let hash = 0;
  for (const character of email) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return { email, initials, color: avatarColors[Math.abs(hash) % avatarColors.length] };
}

export function SenderAvatar({ sender, imageUri }: { sender: string; imageUri?: string }) {
  const [failedImage, setFailedImage] = useState<string>();
  const identity = senderIdentity(sender);
  return (
    <View
      accessible={false}
      className="w-[32px] h-[32px] rounded-[16px] overflow-hidden items-center justify-center"
      style={{ backgroundColor: identity.color }}
    >
      {imageUri && imageUri !== failedImage ? (
        <Image
          source={{ uri: imageUri }}
          onError={() => setFailedImage(imageUri)}
          className="w-[32px] h-[32px]"
        />
      ) : (
        <Text className="text-white text-[12px] font-semibold">{identity.initials}</Text>
      )}
    </View>
  );
}
