import Feather from '@expo/vector-icons/Feather';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { ActivityIndicator, View, useWindowDimensions, type ColorValue } from 'react-native';
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
 * - Tabs load on first open (the default). Not preloaded: on the web the tabs you are not on stay
 *   in the page and reachable, so mounting all of them at sign-in duplicated their content.
 * - A short cross-fade between tabs (150 ms), off when the person asks for reduced motion.
 * - Big screens (computers, 1024px wide and up): the tabs move to a sidebar on the left (owner,
 *   2026-10-15), icon beside the label. Phones and tablets keep the bar at the bottom.
 */
export default function TabsLayout() {
  const { ready, session } = useAuth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const sidebar = width >= layout.sidebarMinWidth;
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
          animation: reduceMotion ? 'none' : 'fade',
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.muted,
          tabBarPosition: sidebar ? 'left' : 'bottom',
          tabBarLabelPosition: sidebar ? 'beside-icon' : 'below-icon',
          tabBarStyle: sidebar
            ? {
                backgroundColor: colors.card,
                borderRightColor: colors.border,
                borderRightWidth: 1,
                width: layout.sidebarWidth,
                paddingTop: 12,
              }
            : {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                height: layout.tabBarHeight + bottom,
                paddingBottom: 8 + bottom,
                paddingTop: 8,
              },
          // Sidebar rows: full-width, left-aligned, at least the 44px tap height.
          tabBarItemStyle: sidebar ? { justifyContent: 'flex-start', paddingHorizontal: 16, minHeight: 52 } : undefined,
          tabBarLabelStyle: { fontSize: sidebar ? 16 : 14, fontFamily: fonts.body, fontWeight: '700' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'index') }} />
        <Tabs.Screen name="pantry" options={{ title: 'Pantry', tabBarIcon: tabIcon('package', 'pantry') }} />
        <Tabs.Screen name="grocery" options={{ title: 'Grocery', tabBarIcon: tabIcon('shopping-cart', 'grocery') }} />
        <Tabs.Screen name="stores" options={{ title: 'Stores', tabBarIcon: tabIcon('map-pin', 'stores') }} />
      </Tabs>
    </View>
  );
}
