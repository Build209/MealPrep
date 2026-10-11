import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { APP_BRAND } from '../config/appBrand';
import { APP_ROUTES } from '../config/appRoutes';

/**
 * Shown for an address that is not a page. Without this file the router's built-in developer
 * screen was shown to customers: a black "Unmatched Route" page with a "Sitemap" link.
 */
export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-paper px-6">
      <Text accessibilityRole="header" className="text-center text-2xl font-extrabold text-ink">
        We can't find that page
      </Text>
      <Text className="mt-3 text-center text-base leading-6 text-muted">
        The link may be old or mistyped. Everything in {APP_BRAND.name} starts from Home.
      </Text>
      <Pressable
        onPress={() => router.replace(APP_ROUTES.home)}
        accessibilityRole="link"
        className="mt-6 min-h-[48px] items-center justify-center rounded-full bg-primary px-6 active:opacity-90"
      >
        <Text className="text-base font-bold text-on-primary">Go to Home</Text>
      </Pressable>
    </View>
  );
}
