import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { LEGAL_LINKS } from '../../config/account';
import { TIER_NAMES, TIER_SHORT_NAMES, tierLimitsLine, type PaidTier } from '../../config/planTiers';
import {
  PLAN_TIER_ORDER,
  PLUS_INTERVAL_ORDER,
  PLUS_UPGRADE_COPY,
  type BillingInterval,
} from '../../config/pricing';
import { useApp } from '../../context/AppContext';
import { BillingError, startPlanCheckout } from '../../lib/billing/client';
import { flushUsageLog, logUsageEvent } from '../../lib/usage/usageLog';
import { tierPriceLabel, tierRenewalDisclosure, tierSubscribeLabel } from '../../lib/billing/pricing';

type Props = {
  /** Shows a "Not now" link that calls this. */
  onNotNow?: () => void;
};

/** Plus is sold on the web only; store builds must not link out to another payment system. */
export function canBuyPlusHere(): boolean {
  return Platform.OS === 'web';
}

/**
 * Plan choice, renewal terms and the buy button (sticker aisle look, owner 2026-10-11):
 * a monthly or yearly switch, then one row per plan (Plus, Pro, Family) showing its price for that
 * period and its monthly limits, so the plans can be compared without tapping each one; the free
 * plan's limits for reference; then the chosen plan's limits and renewal terms, then the tomato
 * button. Tomato is kept for the button that starts a purchase.
 *
 * Rules (California automatic renewal law, compliance handoff 1): the price, renewal period and
 * how to cancel sit directly above the button in normal-size text; the monthly limits of the
 * chosen plan are stated beside the price; nothing is pre-ticked beyond the plan choice itself;
 * no countdowns, savings figures or pressure wording; the button states the price.
 */
export function PlusUpgradeOptions({ onNotNow }: Props) {
  const { isGuest, demoMode, openAuthSheet } = useApp();
  const [tier, setChosenTier] = useState<PaidTier>(PLAN_TIER_ORDER[0]);
  const [interval, setChosenInterval] = useState<BillingInterval>(PLUS_INTERVAL_ORDER[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe with the browser's Back button can bring this page back exactly as it
  // was left, button still switched off. Switch it on again so the purchase can be retried.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onPageShow = () => setBusy(false);
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  if (!canBuyPlusHere() || demoMode) return null;

  if (isGuest) {
    return (
      <View className="mt-3">
        <Text className="text-sm leading-5 text-ink">{PLUS_UPGRADE_COPY.signInHint}</Text>
        <Pressable
          onPress={openAuthSheet}
          accessibilityRole="button"
          className="mt-4 min-h-[56px] items-center justify-center rounded-2xl bg-primary px-5 py-3"
        >
          <Text className="text-center text-base font-extrabold text-on-primary">
            {PLUS_UPGRADE_COPY.signInToUpgrade}
          </Text>
        </Pressable>
        {onNotNow ? <NotNowLink onPress={onNotNow} /> : null}
      </View>
    );
  }

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Sent straight away: the browser is about to leave for Stripe.
      logUsageEvent('checkout_started', { plan: `${tier}_${interval}` });
      void flushUsageLog();
      await startPlanCheckout(tier, interval);
      // On success the browser leaves for Stripe; keep the button disabled meanwhile.
    } catch (err) {
      setError(err instanceof BillingError ? err.message : PLUS_UPGRADE_COPY.genericError);
      setBusy(false);
    }
  }

  return (
    <View className="mt-3">
      {/* Monthly or yearly first: the prices in the plan rows below follow it. */}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={PLUS_UPGRADE_COPY.intervalChoiceLabel}
        className="flex-row gap-2"
      >
        {PLUS_INTERVAL_ORDER.map((option) => {
          const selected = option === interval;
          return (
            <Pressable
              key={option}
              onPress={() => setChosenInterval(option)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              accessibilityLabel={PLUS_UPGRADE_COPY.intervalLabels[option]}
              className={`min-h-[48px] flex-1 items-center justify-center rounded-[14px] border-2 px-3 ${
                selected ? 'border-primary bg-primary' : 'border-border bg-card'
              }`}
            >
              <Text className={`text-base font-extrabold ${selected ? 'text-on-primary' : 'text-ink'}`}>
                {PLUS_UPGRADE_COPY.intervalLabels[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Every plan on screen at once, each with its price and its monthly limits, so they can be compared. */}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={PLUS_UPGRADE_COPY.tierChoiceLabel}
        className="mt-3 gap-2.5"
      >
        {PLAN_TIER_ORDER.map((option) => {
          const selected = option === tier;
          return (
            <Pressable
              key={option}
              onPress={() => setChosenTier(option)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              accessibilityLabel={`${TIER_NAMES[option]}, ${tierPriceLabel(option, interval)}: ${tierLimitsLine(option)}`}
              className={`min-h-[84px] flex-row items-center rounded-2xl border-2 bg-card px-3.5 py-2.5 ${
                selected ? 'border-primary' : 'border-border'
              }`}
            >
              <View
                className={`mr-3 h-[22px] w-[22px] items-center justify-center rounded-full border-2 ${
                  selected ? 'border-primary' : 'border-muted'
                }`}
              >
                {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-baseline justify-between gap-2">
                  <Text className="font-display text-[22px] leading-[26px] text-ink">{TIER_SHORT_NAMES[option]}</Text>
                  <Text className="text-[17px] font-extrabold text-ink">{tierPriceLabel(option, interval)}</Text>
                </View>
                <Text className="mt-0.5 text-sm leading-5 text-muted">{tierLimitsLine(option)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text className="mt-3 text-sm leading-5 text-muted">
        {PLUS_UPGRADE_COPY.freePlanLead} {tierLimitsLine('free')}.
      </Text>

      {/* What is being agreed to, in one place above the button: the chosen plan's limits, then its renewal terms. */}
      <Text className="mt-3 text-sm leading-5 text-ink">
        {TIER_NAMES[tier]}: {tierLimitsLine(tier)}.
      </Text>

      <Text className="mt-3 text-sm leading-5 text-ink">
        {tierRenewalDisclosure(tier, interval)}{' '}
        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openURL(LEGAL_LINKS.terms)}
          className="text-sm font-bold text-primary underline"
        >
          {PLUS_UPGRADE_COPY.termsLinkLabel}
        </Text>
      </Text>

      <Pressable
        onPress={() => void subscribe()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        className={`mt-4 min-h-[60px] items-center justify-center rounded-2xl bg-tomato px-5 py-3 ${
          busy ? 'opacity-60' : ''
        }`}
      >
        <Text className="text-center text-[17px] font-extrabold text-on-tomato">
          {busy ? PLUS_UPGRADE_COPY.starting : tierSubscribeLabel(tier, interval)}
        </Text>
      </Pressable>

      {error ? (
        <Text accessibilityRole="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </Text>
      ) : null}

      {onNotNow ? <NotNowLink onPress={onNotNow} disabled={busy} /> : null}
    </View>
  );
}

function NotNowLink({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="mt-1 min-h-[44px] items-center justify-center px-4"
    >
      <Text className="text-[15px] font-bold text-muted">{PLUS_UPGRADE_COPY.notNow}</Text>
    </Pressable>
  );
}
