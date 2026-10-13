import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { TopBar } from '../../ui/TopBar';
import { colors, fonts, layout } from '../../theme/tokens';

/** Four tabs, as in DESIGN.md: Home, Pantry, Grocery, Stores. Icons come with the tab screens. */
export default function TabsLayout() {
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
