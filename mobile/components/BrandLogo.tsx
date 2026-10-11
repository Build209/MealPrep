import { Image, Text, type ImageStyle, type StyleProp, View } from 'react-native';
import { APP_BRAND, APP_BRAND_IMAGES } from '../config/appBrand';
import { FORKINATOR_PINNED_WIDTH_PX } from '../lib/forkinator/pinnedDock';

type BrandLogoVariant = 'header' | 'auth';

type BrandLogoProps = {
  variant: BrandLogoVariant;
  style?: StyleProp<ImageStyle>;
};

export function BrandLogo({ variant, style }: BrandLogoProps) {
  const { authLogoWidth } = APP_BRAND.ui;

  if (variant === 'header') {
    // Forky himself stands here now (pinned by ForkinatorOverlay, owner's decision 2026-10-10),
    // in place of the round fork mark. This keeps his spot in the bar free and the wordmark beside him.
    return (
      <View
        className="shrink flex-row items-center gap-2.5"
        accessibilityRole="header"
        accessibilityLabel={APP_BRAND.name}
      >
        <View style={{ width: FORKINATOR_PINNED_WIDTH_PX, height: 36 }} />
        {/* Wordmark in the display face, one colour, on the banana bar. */}
        <Text className="shrink font-display text-[21px] text-on-banana" numberOfLines={1}>
          MealPlanatic
        </Text>
      </View>
    );
  }

  return (
    <View className="items-center py-2" accessibilityRole="image" accessibilityLabel={APP_BRAND.name}>
      <Image
        source={APP_BRAND_IMAGES.logoFullTransparent}
        style={[{ width: authLogoWidth, height: authLogoWidth * 0.38 }, style]}
        resizeMode="contain"
      />
    </View>
  );
}
