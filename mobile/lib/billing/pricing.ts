import { TIER_NAMES, type PaidTier } from '../../config/planTiers';
import { TIER_PRICING, type BillingInterval } from '../../config/pricing';

/** 499 -> "$4.99", 2000 -> "$20". */
export function formatTierPrice(tier: PaidTier, interval: BillingInterval): string {
  const { unitAmount } = TIER_PRICING[tier][interval];
  const major = unitAmount / 100;
  return `$${Number.isInteger(major) ? String(major) : major.toFixed(2)}`;
}

function periodWords(interval: BillingInterval): { a: string; every: string } {
  return interval === 'year' ? { a: 'a year', every: 'every year' } : { a: 'a month', every: 'every month' };
}

/** "$53.88 a year" / "$4.99 a month" */
export function tierPriceLabel(tier: PaidTier, interval: BillingInterval): string {
  return `${formatTierPrice(tier, interval)} ${periodWords(interval).a}`;
}

/** The buy button says exactly what it does and what it costs. */
export function tierSubscribeLabel(tier: PaidTier, interval: BillingInterval): string {
  return `Subscribe for ${tierPriceLabel(tier, interval)}`;
}

/**
 * Renewal terms shown directly above the buy button: price, renewal period, how to cancel.
 * Must stay word-for-word the same as `renewalDisclosure` in
 * supabase/functions/_shared/billingText.ts (checked by scripts/plus-upgrade-ui-check.ts).
 */
export function tierRenewalDisclosure(tier: PaidTier, interval: BillingInterval): string {
  const period = periodWords(interval);
  return (
    `${TIER_NAMES[tier]} is ${formatTierPrice(tier, interval)} ${period.a}. ` +
    `It renews automatically ${period.every} until you cancel. ` +
    'Cancel any time in Account, Manage subscription.'
  );
}
