import { useState } from 'react';
import { Platform } from 'react-native';
import { useOwnSubscription } from '../data/billing';
import { useProfile } from '../data/profile';
import { tierForProfile, TIER_NAMES } from '../scan/planTiers';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { BillingError, openBillingPortal } from './billingClient';
import { includesLine, PLANS_COPY } from './copy';
import { planScreenState, subscriptionStatusLine, tierLimitsLine } from './pricing';

/** Plans are sold on the web only (as in the live app); phone builds must not link out to another payment system. */
export function canBuyHere(): boolean {
  return Platform.OS === 'web';
}

/**
 * The plan read shared by /plans and /account: the profile, the own subscription row, and what the
 * screen may show (planScreenState). One read, one set of rules, so both screens always agree on
 * who sees Manage subscription.
 */
export function useCurrentPlan() {
  const profile = useProfile();
  const subscription = useOwnSubscription();
  const loading = profile.isPending || subscription.isPending;
  const state = profile.data
    ? planScreenState({ plan: profile.data.plan, subscription: subscription.data ?? null, canBuyHere: canBuyHere() })
    : null;
  const statusLine =
    subscription.data && state?.showManage ? subscriptionStatusLine(subscription.data) : null;
  return { profile, subscription, loading, state, statusLine };
}

/** The account's current plan, from profiles.plan / plan_tier and billing_subscriptions, with Manage subscription. */
export function CurrentPlan({
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

/** An underlined text link, as on the plans screen. */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AppText bold accessibilityRole="link" onPress={onPress} style={{ textDecorationLine: 'underline', paddingVertical: 10 }}>
      {label}
    </AppText>
  );
}
