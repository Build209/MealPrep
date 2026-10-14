import Feather from '@expo/vector-icons/Feather';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Platform, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import { TopBar } from '../../ui/TopBar';
import { useReducedMotion } from '../../ui/useReducedMotion';
import { colors, fonts, layout } from '../../theme/tokens';

type IconName = ComponentProps<typeof Feather>['name'];
type IconColor = ComponentProps<typeof Feather>['color'];

/**
 * A line icon above the tab's label. Ink when active, muted when not (never tomato). Hidden from
 * screen readers: the tab is already named by its label, so the icon must not be announced twice.
 */
function tabIcon(name: IconName, route: string) {
  return function TabIcon({ color }: { color: ColorValue; focused: boolean; size: number }) {
    return (
      <Feather
        name={name}
        size={22}
        color={color as IconColor}
        testID={`tab-icon-${route}`}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  };
}

/**
 * Four tabs, as in DESIGN.md: Home, Pantry, Grocery, Stores, each a line icon over its label.
 * The tabs need a session (no guest mode): signed out, or a build without server settings, goes to sign-in.
 *
 * - Safe area: the bar is its base height plus the bottom inset (iPhone home indicator; on the web
 *   that needs viewport-fit=cover, set in src/lib/viewport.ts), so labels never sit under it.
 * - Home, Pantry and Grocery mount right after sign-in (lazy: false), so switching is instant and
 *   their lists are already loaded (TanStack Query dedupes; staleTime in src/lib/queryClient.ts).
 *   Stores stays lazy: it may locate the device on open, which must wait until the person opens it.
 * - A short cross-fade between tabs (150 ms) on phones, off with reduced motion. The web build
 *   switches tabs instantly (each tab screen fades in once when it first mounts, src/ui/Screen.tsx).
 */
export default function TabsLayout() {
  const { ready, session } = useAuth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;

  const bottom = Math.max(0, insets.bottom);
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <TopBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          lazy: false,
          // Not on the web: there the fade keeps the other tabs in the page at opacity 0, where screen
          // readers and keyboards still reach them. Without it, hidden tabs are display: none.
          animation: reduceMotion || Platform.OS === 'web' ? 'none' : 'fade',
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            height: layout.tabBarHeight + bottom,
            paddingBottom: 8 + bottom,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'index') }} />
        <Tabs.Screen name="pantry" options={{ title: 'Pantry', tabBarIcon: tabIcon('package', 'pantry') }} />
        <Tabs.Screen name="grocery" options={{ title: 'Grocery', tabBarIcon: tabIcon('shopping-cart', 'grocery') }} />
        <Tabs.Screen name="stores" options={{ title: 'Stores', lazy: true, tabBarIcon: tabIcon('map-pin', 'stores') }} />
      </Tabs>
    </View>
  );
}
