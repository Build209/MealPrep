import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { LEGAL_LINKS } from '../auth/copy';
import { colors } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { PLANS_COPY } from './copy';
import { CurrentPlan, TextLink, useCurrentPlan } from './CurrentPlan';
import { openLegal, PlanChoice } from './PlanChoice';

export { canBuyHere } from './CurrentPlan';

/** /plans: the four plans with prices and limits, the current plan, and the way to buy or manage one. */
export function PlansScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const { profile, subscription, loading, state, statusLine } = useCurrentPlan();

  if (ready && !session) return <Redirect href="/sign-in" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen title={PLANS_COPY.title}>
      <Button label={PLANS_COPY.close} kind="quiet" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <AppText>{PLANS_COPY.benefit}</AppText>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.ink} accessibilityLabel={PLANS_COPY.loading} />
        </View>
      ) : profile.error || !profile.data || !state ? (
        <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
          {profile.error instanceof Error ? profile.error.message : PLANS_COPY.genericError}
        </AppText>
      ) : (
        <>
          <CurrentPlan
            plan={profile.data.plan}
            planTier={profile.data.planTier}
            showManage={state.showManage}
            showComped={state.showComped}
            statusLine={statusLine}
          />
          {/* Buying only for a free account with no live subscription, on the web (live app rule). */}
          {subscription.error ? (
            <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
              {subscription.error instanceof Error ? subscription.error.message : PLANS_COPY.genericError}
            </AppText>
          ) : state.showBuy ? (
            <PlanChoice />
          ) : null}
        </>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 }}>
        <TextLink label={PLANS_COPY.usageLink} onPress={() => router.push('/usage')} />
        <TextLink label={PLANS_COPY.termsLink} onPress={() => openLegal(LEGAL_LINKS.terms)} />
        <TextLink label={PLANS_COPY.privacyLink} onPress={() => openLegal(LEGAL_LINKS.privacy)} />
      </View>
    </Screen>
  );
}
