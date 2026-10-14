import { Image, View, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme/tokens';

/** A photo (recipe image or video thumbnail), or a plain sand block when there is none. Decorative. */
export function PhotoThumb({ uri, width, height, style }: { uri: string | null; width: number | `${number}%`; height?: number; style?: ViewStyle }) {
  const box: ViewStyle = {
    width,
    height,
    aspectRatio: height === undefined ? 16 / 9 : undefined,
    borderRadius: radius.control,
    backgroundColor: colors.sand,
    overflow: 'hidden',
  };
  return (
    <View style={[box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}
