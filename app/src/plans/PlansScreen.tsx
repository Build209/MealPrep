import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { LEGAL_LINKS } from '../auth/copy';
import { useOwnSubscription } from '../data/billing';
import { useProfile } from '../data/profile';
import { tierForProfile, TIER_NAMES } from '../scan/planTiers';
import { colors } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { BillingError, openBillingPortal } from './billingClient';
import { includesLine, PLANS_COPY } from './copy';
import { openLegal, PlanChoice } from './PlanChoice';
import { planScreenState, subscriptionStatusLine, tierLimitsLine } from './pricing';

/** Plans are sold on the web only (as in the live app); phone builds must not link out to another payment system. */
export function canBuyHere(): boolean {
  return Platform.OS === 'web';
}

/** The account's current plan, from profiles.plan / plan_tier and billing_subscriptions, with Manage subscription. */
function CurrentPlan({
  plan,
  planTier,
  showManage,
  showComped,
  statusLine,
}: {
  plan: string;
  planTier: string | null;
  showManage: boolean;
  showComped: boolean;
  statusLine: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tier = tierForProfile(plan, planTier);
  const isPaid = plan === 'paid';

  async function manage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof BillingError ? err.message : PLANS_COPY.manageError);
      setBusy(false);
    }
  }

  const blurb = isPaid
    ? showComped
      ? `${PLANS_COPY.paidBlurb} ${PLANS_COPY.compedBlurb}`
      : PLANS_COPY.paidBlurb
    : canBuyHere()
      ? PLANS_COPY.freeBlurb
      : PLANS_COPY.freeBlurbNativeNoBilling;

  return (
    <Card>
      <AppText variant="label" color="muted">
        {PLANS_COPY.currentPlanLabel}
      </AppText>
      <AppText bold testID="current-plan">
        {TIER_NAMES[tier]}
      </AppText>
      <AppText variant="secondary">{includesLine(tierLimitsLine(tier))}</AppText>
      <AppText variant="secondary" color="muted">
        {blurb}
      </AppText>
      {statusLine ? <AppText variant="secondary">{statusLine}</AppText> : null}
      {showManage ? (
        <>
          <Button
            kind="secondary"
            label={busy ? PLANS_COPY.managing : PLANS_COPY.manage}
            accessibilityHint={PLANS_COPY.manageHint}
            disabled={busy}
            onPress={() => void manage()}
          />
          <AppText variant="label" color="muted">
            {PLANS_COPY.manageHint}
          </AppText>
          {error ? (
            <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AppText bold accessibilityRole="link" onPress={onPress} style={{ textDecorationLine: 'underline', paddingVertical: 10 }}>
      {label}
    </AppText>
  );
}

/** /plans: the four plans with prices and limits, the current plan, and the way to buy or manage one. */
export function PlansScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const profile = useProfile();
  const subscription = useOwnSubscription();

  if (ready && !session) return <Redirect href="/sign-in" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const loading = profile.isPending || subscription.isPending;
  const state = profile.data
    ? planScreenState({ plan: profile.data.plan, subscription: subscription.data ?? null, canBuyHere: canBuyHere() })
    : null;
  const statusLine =
    subscription.data && state?.showManage ? subscriptionStatusLine(subscription.data) : null;

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
