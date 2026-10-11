import { usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { BrandLogo } from './BrandLogo';
import { HydrationSafeIonicon } from './HydrationSafeIonicon';
import { APP_ROUTES } from '../config/appRoutes';
import { THEME } from '../config/appConfig';
import { HOME_HUB_COPY } from '../config/homeHub';
import { readAccountKitchenCache } from '../lib/account/accountKitchenCache';
import { resolveAccountHeaderAccessibilityLabel } from '../lib/account/accountHeaderChrome';
import { hasLikelyStoredAuthSession } from '../lib/account/authBootstrap';
import { readLastAccountUserId } from '../lib/account/lastAccountUser';
import { useApp } from '../context/AppContext';
import { useHomeHubSheet } from '../context/HomeHubSheetContext';
import { useHydrated } from '../hooks/useHydrated';
import { useTutorialTarget } from '../hooks/useTutorial';
import { ProfileAvatar } from './account/ProfileAvatar';

export function AppHeader() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { profile, session, demoMode, authReady, openAuthSheet, openAccountSheet } = useApp();
  const { openHub } = useHomeHubSheet();
  // The first-time tour lights up the week-plan button.
  const tutorialWeekPlanRef = useTutorialTarget('home-week-plan');
  const storedSessionHint = hydrated && !authReady && hasLikelyStoredAuthSession();
  const signedIn = demoMode || session != null || storedSessionHint;
  const bootstrapProfile =
    storedSessionHint && !session
      ? readAccountKitchenCache(readLastAccountUserId() ?? '')?.profile
      : null;
  const avatarName = bootstrapProfile?.name ?? profile.name;
  const avatarPhoto = bootstrapProfile?.photoUrl ?? profile.photoUrl;
  const accountChromeReady = demoMode || authReady;
  const avatarAccessibilityLabel = resolveAccountHeaderAccessibilityLabel({
    demoMode,
    hydrated,
    authReady,
    signedIn,
  });
  const onHome = pathname === APP_ROUTES.home || pathname === '/index';

  // Sticker aisle look: 64px banana bar, Forky, the wordmark in ink, square-ish account button.
  return (
    <View className="h-16 justify-center bg-banana pl-5 pr-4">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1 flex-row items-center pr-2">
          <BrandLogo variant="header" />
        </View>
        <View className="shrink-0 flex-row items-center gap-1">
          {onHome ? (
            <Pressable
              ref={tutorialWeekPlanRef}
              onPress={() => openHub('weekPlan')}
              accessibilityRole="button"
              accessibilityLabel={HOME_HUB_COPY.openAccessibilityLabel}
              className="h-11 w-11 items-center justify-center rounded-full"
              style={({ pressed }) => ({
                backgroundColor: pressed ? 'rgba(27,31,59,0.12)' : 'transparent',
              })}
            >
              <HydrationSafeIonicon name="book-outline" size={22} color={THEME.onBanana} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={avatarAccessibilityLabel}
            onPress={signedIn ? openAccountSheet : openAuthSheet}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ borderWidth: 2, borderColor: THEME.onBanana }}
          >
            {hydrated && accountChromeReady ? (
              <ProfileAvatar name={avatarName} photoUrl={avatarPhoto} guest={!signedIn} size={36} onHeader />
            ) : (
              <View style={{ width: 36, height: 36, borderRadius: 18 }} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
