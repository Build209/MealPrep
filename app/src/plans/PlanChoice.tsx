import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { LEGAL_LINKS } from '../auth/copy';
import { colors, radius, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { BillingError, startPlanCheckout } from './billingClient';
import { PLANS_COPY } from './copy';
import {
  INTERVAL_LABELS,
  INTERVAL_ORDER,
  PLAN_TIER_ORDER,
  TIER_SHORT_NAMES,
  tierLimitsLine,
  tierLimitsSentence,
  tierPriceLabel,
  tierRenewalDisclosure,
  tierRowLabel,
  tierSubscribeLabel,
  type BillingInterval,
} from './pricing';
import type { PaidTier } from '../scan/planTiers';

export function openLegal(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * Plan choice, renewal terms and the buy button, as on the live app (PlusUpgradeOptions):
 * a monthly or yearly switch, one row per paid plan with its price for that period and its monthly
 * limits, the free plan's limits for reference, then the chosen plan's limits and its renewal terms
 * directly above the one tomato button, which states the price.
 *
 * Rules (compliance rules 1 and 11, Handoff 1): price, renewal period and how to cancel sit
 * directly above the button in normal-size text; nothing is pre-ticked beyond the plan choice; no
 * countdowns, savings figures or pressure wording. The live app has no tick box of its own: the
 * required unticked renewal consent box is on Stripe's checkout page (stripe-checkout sets it).
 */
export function PlanChoice() {
  const [tier, setTier] = useState<PaidTier>(PLAN_TIER_ORDER[0] ?? 'plus');
  const [interval, setChosenInterval] = useState<BillingInterval>(INTERVAL_ORDER[0] ?? 'year');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe with the browser's Back button can restore this page with the button
  // still switched off; switch it on again so the purchase can be retried (as the live app does).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onPageShow = () => setBusy(false);
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await startPlanCheckout(tier, interval);
      // On success the browser leaves for Stripe; the button stays off meanwhile.
    } catch (err) {
      setError(err instanceof BillingError ? err.message : PLANS_COPY.genericError);
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={PLANS_COPY.intervalChoiceLabel} style={{ flexDirection: 'row', gap: 8 }}>
        {INTERVAL_ORDER.map((option) => {
          const selected = option === interval;
          return (
            <Pressable
              key={option}
              onPress={() => setChosenInterval(option)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityLabel={INTERVAL_LABELS[option]}
              accessibilityState={{ checked: selected, disabled: busy }}
              aria-checked={selected}
              style={{
                flex: 1,
                minHeight: touch.min,
                borderRadius: radius.pill,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.ink : colors.border,
                backgroundColor: selected ? colors.sand : colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
              }}
            >
              <AppText variant="secondary" bold={selected}>
                {INTERVAL_LABELS[option]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={PLANS_COPY.tierChoiceLabel} style={{ gap: 10 }}>
        {PLAN_TIER_ORDER.map((option) => {
          const selected = option === tier;
          return (
            <Pressable
              key={option}
              onPress={() => setTier(option)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityLabel={tierRowLabel(option, interval)}
              accessibilityState={{ checked: selected, disabled: busy }}
              aria-checked={selected}
              style={{
                minHeight: 72,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderRadius: radius.card,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.ink : colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: selected ? colors.ink : colors.muted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <AppText variant="sectionTitle" display>
                    {TIER_SHORT_NAMES[option]}
                  </AppText>
                  <AppText bold>{tierPriceLabel(option, interval)}</AppText>
                </View>
                <AppText variant="secondary" color="muted">
                  {tierLimitsLine(option)}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* The free plan's limits, for comparison (same sentence pattern as the chosen plan's line). */}
      <AppText variant="secondary" color="muted">
        {tierLimitsSentence('free')}
      </AppText>

      {/* What is being agreed to, in one place directly above the button. */}
      <AppText>{tierLimitsSentence(tier)}</AppText>
      <View testID="purchase-block" style={{ gap: 12 }}>
        <AppText testID="renewal-disclosure">
          {tierRenewalDisclosure(tier, interval)}{' '}
          <AppText bold accessibilityRole="link" onPress={() => openLegal(LEGAL_LINKS.terms)} style={{ textDecorationLine: 'underline' }}>
            {PLANS_COPY.termsLinkLabel}
          </AppText>
        </AppText>
        <Button
          testID="buy-button"
          kind="purchase"
          main
          label={busy ? PLANS_COPY.starting : tierSubscribeLabel(tier, interval)}
          disabled={busy}
          onPress={() => void subscribe()}
        />
      </View>
      {error ? (
        <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
