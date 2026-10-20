import { View } from 'react-native';
import { COOKWARE_H, COOKWARE_W, cookwareParts } from './cookwareParts';
import type { GearCategory } from './gear';

/** One cookware drawing (76 x 100). Decorative: the name is always shown next to it. */
export function CookwareDrawing({ slug, category }: { slug: string; category: GearCategory }) {
  const parts = cookwareParts(slug, category);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: COOKWARE_W, height: COOKWARE_H }}
      testID={`cookware-drawing-${slug}`}
    >
      {parts.map((style, index) => (
        <View key={index} style={style} />
      ))}
    </View>
  );
}
