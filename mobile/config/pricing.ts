/**
 * MealPlanatic paid plans: prices as shown in the app.
 *
 * These are display values. The amount actually charged comes from the Stripe prices with
 * lookup keys `plus_monthly`, `plus_yearly`, `pro_monthly`, `pro_yearly`, `family_monthly` and
 * `family_yearly`, and Stripe's checkout page repeats the real price and renewal terms. If a
 * Stripe price changes, change it here and on the terms page in the same pull request and tell
 * compliance first (subscription price changes need notice).
 */
import { PAID_TIERS, type PaidTier } from './planTiers';

export type BillingInterval = 'month' | 'year';

type Price = { unitAmount: number; currency: 'usd' };

/**
 * Owner's decision, 2026-10-11. Yearly is twelve months less 10% (Plus), 13% (Pro) and
 * 20% (Family): $4.49, $7.82 and $16 a month, paid once a year.
 */
export const TIER_PRICING: Record<PaidTier, Record<BillingInterval, Price>> = {
  plus: { month: { unitAmount: 499, currency: 'usd' }, year: { unitAmount: 5388, currency: 'usd' } },
  pro: { month: { unitAmount: 899, currency: 'usd' }, year: { unitAmount: 9384, currency: 'usd' } },
  family: { month: { unitAmount: 2000, currency: 'usd' }, year: { unitAmount: 19200, currency: 'usd' } },
};

/** Order of the tiers on the upgrade screen; the first is selected by default. */
export const PLAN_TIER_ORDER: readonly PaidTier[] = PAID_TIERS;

/** Order shown on the upgrade screen; the first is selected by default. */
export const PLUS_INTERVAL_ORDER: readonly BillingInterval[] = ['year', 'month'];

export const PLUS_UPGRADE_COPY = {
  heading: 'MealPlanatic Plus',
  benefit:
    'Scan your fridge, pantry and receipts with your camera, import recipes from links and videos, and ask Forky what to cook. A paid plan gives you more of each every month.',
  /** Title of the full-screen offer now that it sells three plans. New wording: compliance to confirm. */
  screenTitle: 'Pick a plan',
  tierChoiceLabel: 'Choose a plan',
  intervalChoiceLabel: 'Pay monthly or yearly',
  intervalLabels: { year: 'Pay yearly', month: 'Pay monthly' },
  /** Lead-in to the free plan's own limits. New wording: compliance to confirm. */
  freePlanLead: 'Free stays free:',
  close: 'Close',
  termsLinkLabel: 'See Terms.',
  notNow: 'Not now',
  signInToUpgrade: 'Sign in to upgrade',
  signInHint: 'Create a free account or sign in first, so your plan stays with you on every device.',
  starting: 'Opening secure checkout…',
  manage: 'Manage subscription',
  managing: 'Opening billing…',
  manageHint: 'Cancel, update your card or see invoices.',
  genericError: 'Could not start checkout. Please try again.',
  manageError: 'Could not open billing. Please try again.',
  alreadySubscribed: 'You already have a MealPlanatic plan. Use Manage subscription to make changes.',
  notConfigured: 'This plan is not available to buy yet. Please check back soon.',
  /** Shown when the plan came from us rather than a subscription. */
  compedBlurb: 'This plan is on for your account. There is no subscription and nothing to pay.',
} as const;

export const CHECKOUT_RETURN_COPY = {
  unlocked: "You're on a paid MealPlanatic plan. Your new monthly limits are ready.",
  pending: 'Payment received. Your plan will unlock in a moment; reopen the app if it does not.',
  cancelled: 'Checkout closed. You have not been charged.',
} as const;
