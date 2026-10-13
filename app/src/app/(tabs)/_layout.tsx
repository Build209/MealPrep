import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { TopBar } from '../../ui/TopBar';
import { colors, fonts, layout } from '../../theme/tokens';

/**
 * Four tabs, as in DESIGN.md: Home, Pantry, Grocery, Stores. Icons come with the tab screens.
 * The tabs need a session (no guest mode): signed out, or a build without server settings, goes to sign-in.
 */
export default function TabsLayout() {
  const { ready, session } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <TopBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            height: layout.tabBarHeight,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarIconStyle: { display: 'none' },
          tabBarLabelStyle: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="pantry" options={{ title: 'Pantry' }} />
        <Tabs.Screen name="grocery" options={{ title: 'Grocery' }} />
        <Tabs.Screen name="stores" options={{ title: 'Stores' }} />
      </Tabs>
    </View>
  );
}
