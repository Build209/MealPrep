import Feather from '@expo/vector-icons/Feather';
import { Image, View } from 'react-native';
import { env } from '../../lib/env';
import { colors } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { avatarUrl, initialFor, parseAvatarPath } from './avatar';

/**
 * The person's picture at any size: an uploaded photo, a preset tile (colour and emoji, drawn
 * here, no image files), or the first letter of their name. Decorative: the caller labels it.
 * A 'preset:' value never builds a storage address (avatarUrl returns null for it).
 */
export function Avatar({
  path,
  name = '',
  email = '',
  size,
  fallbackIcon,
  testID,
}: {
  path: string | null | undefined;
  name?: string;
  email?: string;
  size: number;
  /** Show the plain person icon instead of a letter when there is no picture (the top bar). */
  fallbackIcon?: boolean;
  testID?: string;
}) {
  const value = parseAvatarPath(path);
  const url = avatarUrl(path, env.supabaseUrl);
  const box = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const };
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  if (value.kind === 'photo' && url) {
    return (
      <View testID={testID} style={[box, { backgroundColor: colors.sand }]} {...hidden}>
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  if (value.kind === 'preset') {
    return (
      <View testID={testID} style={[box, { backgroundColor: value.preset.bg }]} {...hidden}>
        <AppText style={{ fontSize: size * 0.5, lineHeight: size * 0.62, textAlign: 'center' }}>{value.preset.emoji}</AppText>
      </View>
    );
  }
  if (fallbackIcon) {
    return <Feather name="user" size={size} color={colors.onBanana} aria-hidden {...hidden} />;
  }
  return (
    <View testID={testID} style={[box, { backgroundColor: colors.banana }]} {...hidden}>
      <AppText color="onBanana" bold style={{ fontSize: size * 0.45, lineHeight: size * 0.6, textAlign: 'center' }}>
        {initialFor(name, email)}
      </AppText>
    </View>
  );
}
