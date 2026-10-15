import { githubPagesLegalUrl } from './legalPages';

export const ACCOUNT_SHEET_COPY = {
  authTitle: 'Your account',
  accountTitle: 'Account',
  signInTab: 'Sign in',
  signUpTab: 'Create account',
  signOut: 'Sign out',
  deleteAccount: 'Delete account',
  deleteAccountConfirmTitle: 'Delete your account?',
  deleteAccountConfirmBody:
    'This permanently removes your pantry, recipes, grocery list, meal plan, and profile. If you have MealPlanatic Plus, it is cancelled now and you will not be charged again. Community store prices you shared may stay visible without your name. This cannot be undone.',
  deleteAccountConfirmAction: 'Yes, delete my account',
  deleteAccountCancel: 'Cancel',
  adminEntryLabel: 'Admin tools',
  postSignupTitle: 'Quick profile setup',
  postSignupSubtitle: 'Optional — you can change these anytime from your avatar.',
  postSignupSkip: 'Skip',
  postSignupSave: 'Save & continue',
  householdLabel: 'Household size',
  householdBlurb: 'Default servings when scaling recipes.',
  homeZipLabel: 'Home ZIP',
  homeZipBlurb: 'Optional — used for nearby stores and Smart Shop.',
  dietaryNotesLabel: 'Dietary notes',
  displayNameLabel: 'Display name',
  changePhoto: 'Change photo',
  removePhoto: 'Remove photo',
  guestAvatarLabel: 'Sign in or create account',
  resetForkyTipsLabel: 'Reset Forky tips',
  resetForkyTipsConfirmTitle: 'Reset Forky tips?',
  resetForkyTipsConfirmBody: 'Forky will show his greeting and tips again.',
  resetForkyTipsConfirmAction: 'Reset',
  resetForkyTipsDoneToast: "Forky's tips are reset.",
  forkyTipFrequencyLabel: "Forky's tips",
  forkyTipFrequencyBlurb:
    'How often Forky speaks up by himself. He also rests a tip for a while after you close it a couple of times.',
  forkyTipFrequencyOptions: { normal: 'Normal', less: 'Less often', off: 'Off' },
  forkyTipFrequencyOffNote: 'Off: Forky stays quiet. He still tells you when he adds something to your list.',
} as const;

export const LEGAL_LINKS = {
  privacy: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || githubPagesLegalUrl('privacy'),
  terms: process.env.EXPO_PUBLIC_TERMS_URL?.trim() || githubPagesLegalUrl('terms'),
} as const;

export const ACCOUNT_UPGRADE_COPY = {
  title: 'MealPlanatic Plus',
  freeBlurb: 'Manual pantry and recipes are free. A paid plan includes more scans, imports and questions each month.',
  freeBlurbNativeNoBilling:
    'Manual pantry and recipes are free. Paid plans with more scans, imports and questions are not sold on this platform yet.',
  paidBlurb: 'Limits start again on the 1st of each month.',
  learnMoreLabel: 'Learn about Plus',
} as const;

export const POST_SIGNUP_SETUP_STORAGE_KEY = 'mealprep.postSignupProfileSetupDone';

/** Post-auth email redirect path segment (home). */
export const AUTH_EMAIL_REDIRECT_ROUTE = '/' as const;

/** Min/max household members for profile setup. */
export const HOUSEHOLD_SIZE_LIMITS = { min: 1, max: 12 } as const;
