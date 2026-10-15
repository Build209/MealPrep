import Feather from '@expo/vector-icons/Feather';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { makeQueryClient } from '../lib/queryClient';
import { useAppOpenEvent } from '../lib/useAppOpenEvent';
import { CheckoutReturnNotice } from '../plans/CheckoutReturnNotice';
import { enableSafeAreaViewport } from '../lib/viewport';
import { colors, fonts } from '../theme/tokens';
import { useReducedMotion } from '../ui/useReducedMotion';

// Web: let Safari report the iPhone safe area (home indicator, notch) before the first render.
enableSafeAreaViewport();

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  const [fontsLoaded, fontError] = useFonts({
    [fonts.display]: require('../../assets/fonts/BagelFatOne-Latin.ttf'),
    [fonts.body]: require('../../assets/fonts/AtkinsonHyperlegibleNext-Variable-Latin.ttf'),
    // Tab bar icons, loaded with the app fonts so they never flash as empty boxes.
    ...Feather.font,
  });

  // Fall back to system fonts rather than a blank screen if a font fails to load.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
          <UsageLog />
          {/* Web: the message after coming back from Stripe checkout (live app wording). */}
          <CheckoutReturnNotice />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Usage log: app_open once per app start for a signed-in account (src/lib/events.ts). */
function UsageLog() {
  useAppOpenEvent();
  return null;
}

/**
 * Screens above the tabs (recipe, account, plans, ...) have no banana top bar, so the stack keeps
 * them inside the safe area. The tabs, sign-in, reset-password and Forky draw their own banana bar
 * with the top inset (src/ui/TopBar.tsx, ForkyChatScreen.tsx) and get no extra padding.
 * Transition: a quick fade on phones (none with reduced motion). The web stack does not animate,
 * so the web build fades screens in through src/ui/Screen.tsx instead.
 */
function RootStack() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const ownBar = { contentStyle: { backgroundColor: colors.paper } };
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'fade',
        animationDuration: 180,
        contentStyle: { backgroundColor: colors.paper, paddingTop: insets.top, paddingBottom: insets.bottom },
      }}
    >
      <Stack.Screen name="(tabs)" options={ownBar} />
      <Stack.Screen name="sign-in" options={ownBar} />
      <Stack.Screen name="reset-password" options={ownBar} />
      <Stack.Screen name="forky" options={ownBar} />
    </Stack>
  );
}
