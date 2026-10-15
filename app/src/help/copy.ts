/**
 * Words on the Help screen (`/help`).
 *
 * Most answers are built from lines that already exist, so they cannot drift from the rest of the app:
 *  - the monthly allowances come from the plan table (src/scan/planTiers.ts), the same numbers as
 *    the Terms page and the Plans screen;
 *  - the AI line is ASK_FORKY_COPY.aiNotice, word for word (compliance register item 17, rule 9);
 *  - the cancel line is the approved renewal line's ending, "Cancel any time in Account, Manage
 *    subscription." (src/plans/pricing.ts), and Manage subscription's hint is LIVE (src/plans/copy.ts);
 *  - "Deleting your account also cancels your MealPlanatic plan and stops future charges." is from
 *    ACCOUNT_DELETE_COPY.whatIsDeleted (itself pending sign-off there);
 *  - the support address is SUPPORT_EMAIL (LIVE).
 * tests/help-copy.test.ts checks each of these. Everything else (the questions, the joining
 * sentences, the page title and buttons) is NEW and needs a compliance look before launch.
 */
import { ACCOUNT_DELETE_COPY, ACCOUNT_SCREEN_COPY, SUPPORT_EMAIL } from '../account/copy';
import { LEGAL_LINKS } from '../auth/copy';
import { ASK_FORKY_COPY } from '../forky/copy';
import { PLANS_COPY } from '../plans/copy';
import { PLAN_TIERS, TIER_LIMITS, TIER_NAMES, type TierLimits } from '../scan/planTiers';

export { SUPPORT_EMAIL };

/** The approved renewal line's ending (src/plans/pricing.ts), rebuilt from the same words. */
export const CANCEL_LINE = `Cancel any time in ${ACCOUNT_SCREEN_COPY.title}, ${PLANS_COPY.manage}.`;

/** The line in whatIsDeleted that says deleting also cancels the plan (reused, not reworded). */
export const DELETE_CANCELS_LINE = 'Deleting your account also cancels your MealPlanatic plan and stops future charges.';

export const HELP_LINKS = {
  terms: LEGAL_LINKS.terms,
  privacy: LEGAL_LINKS.privacy,
  /** NEW page (app/public/accessibility.html). */
  accessibility: 'https://mealplanatic.app/accessibility.html',
  contact: `mailto:${SUPPORT_EMAIL}`,
} as const;

/** "Free 3, MealPlanatic Plus 15, MealPlanatic Pro 25, MealPlanatic Family 50" for one allowance. */
export function perPlanList(field: keyof TierLimits): string {
  return PLAN_TIERS.map((tier) => `${TIER_NAMES[tier]} ${TIER_LIMITS[tier][field]}`).join(', ');
}

const REFILL = 'They start again on the 1st of each month.';

export type HelpQuestion = { id: string; q: string; a: string };

export const HELP_FAQ: readonly HelpQuestion[] = [
  {
    id: 'scan',
    q: 'How do I add food by scanning?',
    a:
      'On the Pantry tab, tap Scan and take a photo of a pantry shelf, your fridge, a spice rack or a receipt. ' +
      'You check the list of what was found before anything is added to your pantry. ' +
      `Each plan includes a number of scans a month (${perPlanList('scans')}), and shelf, fridge, spice rack and receipt photos share them. ${REFILL}`,
  },
  {
    id: 'import',
    q: 'How do I import a recipe?',
    a:
      'On the Recipes tab, tap Import a recipe. Paste a link or the recipe text, take a photo of a cookbook page, or upload a saved video. ' +
      'You can check and fix the recipe before you save it. ' +
      `Imports a month: ${perPlanList('imports')}. ${REFILL}`,
  },
  {
    id: 'forky',
    q: 'What is Ask Forky?',
    a:
      'Type a question in the box at the top of Home, or tap Forky in the top bar, to ask what to cook, how to use something up, or what to swap. ' +
      `${ASK_FORKY_COPY.aiNotice} ` +
      `Questions a month: ${perPlanList('forkyQuestions')}. ${REFILL}`,
  },
  {
    id: 'cancel',
    q: 'How do I change or cancel my subscription?',
    a:
      `${CANCEL_LINE} ${PLANS_COPY.manageHint} ` +
      `To see or change plans, open ${ACCOUNT_SCREEN_COPY.title}, then ${ACCOUNT_SCREEN_COPY.plansLink}.`,
  },
  {
    id: 'delete',
    q: 'How do I delete my account?',
    a: `Open ${ACCOUNT_SCREEN_COPY.title}, then ${ACCOUNT_DELETE_COPY.deleteButton}. ${DELETE_CANCELS_LINE}`,
  },
  {
    id: 'contact',
    q: 'How do I contact you?',
    a: `Email ${SUPPORT_EMAIL} or tap Contact us below. Write from the address on your account so we can find it.`,
  },
];

export const HELP_COPY = {
  /** NEW */
  title: 'Help',
  /** Same link text as the other screens' Close. */
  close: PLANS_COPY.close,
  /** NEW */
  faqTitle: 'Questions',
  /** NEW */
  contactTitle: 'Contact us',
  /** NEW */
  contactBody: `Questions, problems or ideas: email us at ${SUPPORT_EMAIL}.`,
  /** NEW: the button that opens an email to support. */
  contactButton: 'Contact us',
  /** NEW */
  legalTitle: 'Policies',
  /** Same link text as the sign-in screen (LIVE, AUTH_SCREEN_COPY.termsLink / privacyLink). */
  termsLink: 'Read the Terms',
  privacyLink: 'Read the Privacy Policy',
  /** NEW */
  accessibilityLink: 'Accessibility statement',
  /** NEW: the row on the Account screen that opens this screen. */
  accountLink: 'Help and contact',
} as const;
