import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, View, type ViewStyle } from 'react-native';
import { placeholderFor } from '../recipes/placeholder';
import { colors, radius } from '../theme/tokens';

/**
 * A recipe's photo, or, when it has none, an illustrated food-category tile (recipes/placeholder.ts).
 * A real image always wins. Both are decorative: hidden from screen readers (the recipe name sits beside them).
 */
export function RecipePhoto({
  uri,
  tags,
  title,
  width,
  height,
  aspectRatio,
  iconSize,
  borderRadius = radius.control,
}: {
  uri: string | null;
  tags?: string | readonly string[] | null;
  title?: string | null;
  width: number | `${number}%`;
  height?: number;
  aspectRatio?: number;
  iconSize?: number;
  borderRadius?: number;
}) {
  const box: ViewStyle = { width, height, aspectRatio, borderRadius, overflow: 'hidden', backgroundColor: colors.sand };
  if (uri) {
    return (
      <View style={box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  const p = placeholderFor(tags, title);
  const size = iconSize ?? Math.round((height ?? (typeof width === 'number' ? width : 96)) * 0.5);
  return (
    <View
      testID="recipe-placeholder"
      nativeID={`recipe-placeholder-${p.category}`}
      style={[box, { backgroundColor: p.tint, alignItems: 'center', justifyContent: 'center' }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <MaterialCommunityIcons name={p.glyph as never} size={size} color={colors.ink} style={{ opacity: 0.85 }} />
    </View>
  );
}
