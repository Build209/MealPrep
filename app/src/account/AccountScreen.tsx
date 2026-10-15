import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { SignOutCard } from '../auth/SignOutCard';
import { PLANS_COPY } from '../plans/copy';
import { CurrentPlan, TextLink, useCurrentPlan } from '../plans/CurrentPlan';
import { colors } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { ACCOUNT_SCREEN_COPY as COPY } from './copy';

/**
 * /account: who is signed in, the current plan with Manage subscription (the same card, plan read
 * and rules as /plans, from src/plans/CurrentPlan.tsx), then Plans & usage, Delete account and the
 * sign-out card. This is the "Account, Manage subscription" the approved renewal terms point to.
 * Manage subscription shows only for a live subscription, exactly as on /plans; a free account
 * reaches the plans through "Plans & usage". No tomato here (Manage subscription is the plans
 * screen's ink secondary button).
 */
export function AccountScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const { profile, loading, state, statusLine } = useCurrentPlan();

  if (ready && !session) return <Redirect href="/sign-in" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen title={COPY.title}>
      <Button label={COPY.close} kind="quiet" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      {/* The email alone here; the sign-out card at the bottom keeps its own "Signed in as" line. */}
      <AppText bold testID="account-email">
        {session?.user.email ?? ''}
      </AppText>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.ink} accessibilityLabel={PLANS_COPY.loading} />
        </View>
      ) : profile.error || !profile.data || !state ? (
        <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
          {profile.error instanceof Error ? profile.error.message : PLANS_COPY.loadError}
        </AppText>
      ) : (
        <CurrentPlan
          plan={profile.data.plan}
          planTier={profile.data.planTier}
          showManage={state.showManage}
          showComped={state.showComped}
          statusLine={statusLine}
        />
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <TextLink label={COPY.plansLink} onPress={() => router.push('/plans')} />
        <TextLink label={COPY.deleteLink} onPress={() => router.push('/delete-account')} />
      </View>

      <SignOutCard />
    </Screen>
  );
}
