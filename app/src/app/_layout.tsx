import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { makeQueryClient } from '../lib/queryClient';
import { colors, fonts } from '../theme/tokens';

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  const [fontsLoaded, fontError] = useFonts({
    [fonts.display]: require('../../assets/fonts/BagelFatOne-Latin.ttf'),
    [fonts.body]: require('../../assets/fonts/AtkinsonHyperlegibleNext-Variable-Latin.ttf'),
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="reset-password" />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
