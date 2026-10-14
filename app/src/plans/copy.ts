/**
 * Words on the plans and usage screens.
 *
 * MONEY WORDING: every line below marked LIVE is copied word for word from the live app, which
 * went through compliance with the tier build (#252, terms version 2026-10-11, disclosure version
 * 2026-10-11.1). Source files (old app): mobile/config/pricing.ts (PLUS_UPGRADE_COPY),
 * mobile/config/account.ts (ACCOUNT_UPGRADE_COPY), mobile/components/account/AccountPlanSection.tsx
 * and mobile/lib/billing/pricing.ts. tests/plans-pricing.test.ts checks each LIVE line still
 * appears in those files. Do not reword a LIVE line here: change it in the live app with
 * compliance first (compliance rule 11), then copy it again.
 *
 * Lines marked NEW are written for the rebuild, are not about price, renewal or cancelling, and
 * have not been through compliance yet. Money wording with no approved text must not be written
 * here: use the placeholder '[wording needs compliance]' instead. None is needed today.
 */

export const PLANS_COPY = {
  /** NEW: neutral page title. The live screen's title "Pick a plan" is itself marked "compliance to confirm". */
  title: 'Plans',
  /** LIVE: PLUS_UPGRADE_COPY.benefit */
  benefit:
    'Scan your fridge, pantry and receipts with your camera, import recipes from links and videos, and ask Forky what to cook. A paid plan gives you more of each every month.',
  /** LIVE: PLUS_UPGRADE_COPY.tierChoiceLabel (screen reader label of the plan choice) */
  tierChoiceLabel: 'Choose a plan',
  /** LIVE: PLUS_UPGRADE_COPY.intervalChoiceLabel */
  intervalChoiceLabel: 'Pay monthly or yearly',
  /** LIVE: PLUS_UPGRADE_COPY.payYearly / payMonthly */
  payYearly: 'Pay yearly',
  payMonthly: 'Pay monthly',
  /** LIVE: PLUS_UPGRADE_COPY.termsLinkLabel, right after the renewal terms */
  termsLinkLabel: 'See Terms.',
  /** LIVE: PLUS_UPGRADE_COPY.starting */
  starting: 'Opening secure checkout…',
  /** LIVE: PLUS_UPGRADE_COPY.manage / managing / manageHint */
  manage: 'Manage subscription',
  managing: 'Opening billing…',
  manageHint: 'Cancel, update your card or see invoices.',
  /** LIVE: PLUS_UPGRADE_COPY error lines */
  genericError: 'Could not start checkout. Please try again.',
  manageError: 'Could not open billing. Please try again.',
  alreadySubscribed: 'You already have a MealPlanatic plan. Use Manage subscription to make changes.',
  notConfigured: 'This plan is not available to buy yet. Please check back soon.',
  /** LIVE: PLUS_UPGRADE_COPY.signInHint (shown when the session has ended) */
  signInHint: 'Create a free account or sign in first, so your plan stays with you on every device.',
  /** LIVE: PLUS_UPGRADE_COPY.compedBlurb */
  compedBlurb: 'This plan is on for your account. There is no subscription and nothing to pay.',
  /** LIVE: the "Plan" label of the account plan section */
  currentPlanLabel: 'Plan',
  /** LIVE: ACCOUNT_UPGRADE_COPY.freeBlurb / freeBlurbNativeNoBilling / paidBlurb */
  freeBlurb: 'Manual pantry and recipes are free. A paid plan includes more scans, imports and questions each month.',
  freeBlurbNativeNoBilling:
    'Manual pantry and recipes are free. Paid plans with more scans, imports and questions are not sold on this platform yet.',
  paidBlurb: 'Limits start again on the 1st of each month.',
  /** NEW: link labels (no money wording) */
  usageLink: 'Usage this month',
  termsLink: 'Terms',
  privacyLink: 'Privacy Policy',
  close: 'Close',
  loading: 'Loading your plan…',
} as const;

/** LIVE: AccountPlanSection's "Includes ..." line. */
export function includesLine(limitsLine: string): string {
  return `Includes ${limitsLine}.`;
}

/** LIVE: AccountPlanSection subscriptionStatusLine wording. */
export const SUBSCRIPTION_STATUS_COPY = {
  pastDue: 'Your last payment did not go through. Update your card in Manage subscription to keep your plan.',
  endsOn: (date: string) => `Your plan ends on ${date}. You will not be charged again.`,
  renewsOn: (date: string) => `Renews on ${date}.`,
} as const;

/** NEW: usage screen (counts only; no price, renewal or cancel wording). */
export const USAGE_COPY = {
  title: 'Usage',
  intro: 'What you have used this month, out of what your plan includes.',
  scans: 'Photo scans',
  scansNote: 'Shelf, fridge and receipt photos share them.',
  imports: 'Recipe imports',
  forky: 'Ask Forky questions',
  usedOf: (used: number, limit: number) => `${used} of ${limit} used`,
  usedNoLimit: (used: number) => `${used} used`,
  left: (remaining: number) => `${remaining} left this month`,
  plansLink: 'Plans',
  loadError: 'Could not load your usage. Please try again.',
  retry: 'Try again',
} as const;
