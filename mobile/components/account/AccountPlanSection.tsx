import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ACCOUNT_UPGRADE_COPY } from '../../config/account';
import { planLabel, type UserPlan } from '../../config/plans';
import { tierForProfile, tierLimitsLine, type PaidTier } from '../../config/planTiers';
import { PLUS_UPGRADE_COPY } from '../../config/pricing';
import { useApp } from '../../context/AppContext';
import {
  BillingError,
  fetchOwnSubscription,
  isLiveSubscription,
  openBillingPortal,
  type OwnSubscription,
} from '../../lib/billing/client';
import { shouldShowUpgradeOffer } from '../../lib/platform/shouldShowUpgradeOffer';
import { getSupabase } from '../../lib/supabase';
import { canBuyPlusHere, PlusUpgradeOptions } from '../billing/PlusUpgradeOptions';

type Props = {
  plan: UserPlan;
  /** Which paid tier; ignored while the plan is free. */
  planTier?: PaidTier;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** One plain line on what happens next with the subscription. */
export function subscriptionStatusLine(subscription: OwnSubscription): string | null {
  const date = formatDate(subscription.currentPeriodEnd);
  if (subscription.status === 'past_due') {
    return 'Your last payment did not go through. Update your card in Manage subscription to keep your plan.';
  }
  if (!date) return null;
  return subscription.cancelAtPeriodEnd ? `Your plan ends on ${date}. You will not be charged again.` : `Renews on ${date}.`;
}

export function AccountPlanSection({ plan, planTier }: Props) {
  const { session, isGuest, demoMode } = useApp();
  const userId = session?.user.id ?? null;
  const isPaid = plan === 'paid';
  const [subscription, setSubscription] = useState<OwnSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSubscription(null);
    if (!userId || demoMode || !canBuyPlusHere()) return undefined;
    const client = getSupabase();
    if (!client) return undefined;
    void fetchOwnSubscription(client).then((row) => {
      if (!cancelled) setSubscription(row);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, demoMode, plan]);

  const hasLiveSubscription = isLiveSubscription(subscription);
  const showBuy = !isPaid && !hasLiveSubscription && canBuyPlusHere() && !demoMode;
  const statusLine = subscription && hasLiveSubscription ? subscriptionStatusLine(subscription) : null;

  async function manage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof BillingError ? err.message : PLUS_UPGRADE_COPY.manageError);
      setBusy(false);
    }
  }

  return (
    <View className="rounded-2xl border border-border bg-card px-4 py-3">
      <Text className="text-xs font-bold uppercase text-muted">Plan</Text>
      <Text className="mt-1 text-base font-bold text-ink">{planLabel(plan, planTier)}</Text>
      <Text className="mt-1 text-sm leading-5 text-ink">
        {`Includes ${tierLimitsLine(tierForProfile(plan, planTier))}.`}
      </Text>
      <Text className="mt-2 text-sm leading-5 text-muted">
        {isPaid
          ? hasLiveSubscription || !canBuyPlusHere() || isGuest
            ? ACCOUNT_UPGRADE_COPY.paidBlurb
            : `${ACCOUNT_UPGRADE_COPY.paidBlurb} ${PLUS_UPGRADE_COPY.compedBlurb}`
          : shouldShowUpgradeOffer()
            ? ACCOUNT_UPGRADE_COPY.freeBlurb
            : ACCOUNT_UPGRADE_COPY.freeBlurbNativeNoBilling}
      </Text>

      {statusLine ? <Text className="mt-2 text-sm leading-5 text-ink">{statusLine}</Text> : null}

      {hasLiveSubscription ? (
        <>
          <Pressable
            onPress={() => void manage()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityHint={PLUS_UPGRADE_COPY.manageHint}
            className={`mt-3 min-h-[44px] items-center justify-center rounded-full border border-primary bg-card px-4 py-3 ${
              busy ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-center font-bold text-primary">
              {busy ? PLUS_UPGRADE_COPY.managing : PLUS_UPGRADE_COPY.manage}
            </Text>
          </Pressable>
          <Text className="mt-1 text-xs text-muted">{PLUS_UPGRADE_COPY.manageHint}</Text>
          {error ? (
            <Text accessibilityRole="alert" className="mt-2 text-sm font-semibold text-danger">
              {error}
            </Text>
          ) : null}
        </>
      ) : null}

      {showBuy ? <PlusUpgradeOptions /> : null}
    </View>
  );
}
