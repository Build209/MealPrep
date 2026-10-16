/**
 * Words for deleting an account (`/delete-account`).
 *
 * LIVE lines are copied word for word from the live app, which compliance has seen:
 *  - mobile/config/account.ts (ACCOUNT_SHEET_COPY: the button and the confirm step)
 *  - mobile/app/delete-account.tsx (the page: title, what is deleted, signed-out line, help line)
 *  - mobile/lib/account/deleteAccount.ts (the error lines)
 *  - supabase/functions/delete-user-account/index.ts (CANCEL_FAILED, the server's own words)
 * tests/account-copy.test.ts checks they are still in those files. Lines marked NEW are written for
 * the rebuild and have not been through compliance yet.
 */
export const ACCOUNT_DELETE_COPY = {
  /** LIVE (delete-account.tsx). */
  title: 'Delete your MealPlanatic account',
  /**
   * Live text (delete-account.tsx) with one change: "MealPlanatic Plus" became "your MealPlanatic
   * plan", because Pro and Family are sold too (compliance review). NEW wording, pending sign-off.
   */
  whatIsDeleted:
    'You can permanently delete your account and the personal data we store for you. This includes your profile, ' +
    'pantry, saved recipes, meal plan, grocery lists, saved stores, and scan photos tied to your account. Deleting ' +
    'your account also cancels your MealPlanatic plan and stops future charges.',
  /** LIVE (account.ts), except confirmBody: see below. */
  deleteButton: 'Delete account',
  confirmTitle: 'Delete your account?',
  /** Live text (account.ts) with "MealPlanatic Plus" changed to "a paid MealPlanatic plan". NEW wording, pending sign-off. */
  confirmBody:
    'This permanently removes your pantry, recipes, grocery list, meal plan, and profile. If you have a paid MealPlanatic plan, it is cancelled now and you will not be charged again. Community store prices you shared may stay visible without your name. This cannot be undone.',
  confirmAction: 'Yes, delete my account',
  cancel: 'Cancel',
  /** LIVE (delete-account.tsx). */
  signedOutHint: 'Sign in to delete your account from this page.',
  signIn: 'Sign in',
  /** LIVE (delete-account.tsx), shown on sign-in after deleting. */
  deleted: 'Your account and personal data have been deleted.',
  /** LIVE (delete-account.tsx), split around the address. */
  helpBefore: 'Need help? Email',
  helpAfter: 'from the address on your account and we will process your request.',
  privacyLink: 'Privacy Policy',
  /** NEW: the busy label while the request runs. */
  busy: 'Deleting your account…',
  /** Leaves the screen; same word as the plans screen's Close (src/plans/copy.ts). */
  close: 'Close',
} as const;

/** LIVE (mobile/config/support.ts). */
export const SUPPORT_EMAIL = 'support@mealplanatic.app';

export const ACCOUNT_DELETE_ERRORS = {
  /** LIVE (deleteAccount.ts): no session, or the server said the session is not valid (401). */
  signedOut: 'Sign in to delete your account.',
  /** LIVE (deleteAccount.ts). */
  notConfigured: 'App is not configured for account deletion.',
  /** LIVE (deleteAccount.ts): any other refusal; the server's raw database messages are not shown. */
  failed: 'Could not delete account. Try again or contact support.',
  /** NEW for this flow, same words as src/data/errors.ts: the request failed on the way (the old app showed the browser's own error). */
  network: "Couldn't reach the server. Check your connection and try again.",
  /** LIVE, the server's own words (delete-user-account CANCEL_FAILED_MESSAGE). */
  cancelFailed:
    'We could not cancel your MealPlanatic Plus subscription, so your account was not deleted. ' +
    'Try again in a few minutes, or cancel in Account, Manage subscription first.',
} as const;

/**
 * Words on the Account screen (`/account`). Every line but the title is an existing line reused as
 * is. The compliance-approved renewal line (src/plans/pricing.ts) says "Cancel any time in Account,
 * Manage subscription.": this screen's title and its Manage subscription button keep that true, and
 * tests/account-screen-copy.test.ts checks both still match that line.
 */
export const ACCOUNT_SCREEN_COPY = {
  /** NEW: the page title, and Home's link to this screen. Matches "Account" in the renewal line. */
  title: 'Account',
  /** Same link text Home used before this screen existed. */
  plansLink: 'Plans & usage',
  /** Same words as the delete screen's button (LIVE, ACCOUNT_DELETE_COPY.deleteButton). */
  deleteLink: ACCOUNT_DELETE_COPY.deleteButton,
  /** Leaves the screen; same word as the plans and delete screens' Close. */
  close: ACCOUNT_DELETE_COPY.close,
} as const;

/**
 * Words for the profile part of the Account screen (avatar, about you, allergens). All NEW: not
 * through compliance yet. Rules: never call anything "safe", "allergen-free" or "guaranteed"
 * (tests/profile-copy.test.ts checks); allergens only move and mark recipes, the person still
 * checks labels.
 */
export const PROFILE_COPY = {
  sectionTitle: 'Your profile',
  avatarLabel: 'Profile picture',
  uploadPhoto: 'Upload a photo',
  choosePreset: 'Choose an avatar',
  changePreset: 'Choose a different avatar',
  removePhoto: 'Remove photo',
  removeAvatar: 'Remove picture',
  presetTitle: 'Pick an avatar',
  presetOption: (label: string) => `${label} avatar`,
  closePresets: 'Done',
  photoWorking: 'Updating your picture…',
  photoSaved: 'Picture updated.',
  avatarRemoved: 'Picture removed.',
  photoOffline: "You're offline. Pictures need a connection.",
  photoFailed: "Couldn't update your picture. Check your connection and try again.",
  photoUnreadable: "Couldn't read that photo. Try a JPG or PNG.",
  photoTooBig: 'That photo is still too big after shrinking. Try a different one.',

  nameLabel: 'Display name',
  namePlaceholder: 'Your name',
  nameEmpty: 'Add a name.',
  nameTooLong: 'Keep your name under 60 characters.',
  householdLabel: 'People in your household',
  householdMore: 'More people',
  householdFewer: 'Fewer people',
  householdValue: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
  notesLabel: 'Dietary notes',
  notesPlaceholder: 'Anything else we should know, like "no mushrooms"',
  notesTooLong: 'Keep notes under 200 characters.',
  dietsLabel: 'Diets',
  allergensLabel: 'Allergens',
  allergensHelp:
    'We move recipes with these to the bottom and mark them. Always check labels and verify before you cook.',
  loadingPrefs: 'Loading your food preferences…',
  save: 'Save profile',
  saving: 'Saving…',
  saved: 'Profile saved.',
  saveOffline: "You're offline. Changes need a connection.",
  saveFailed: "Couldn't save your profile. Check your connection and try again.",
} as const;

/** The family plan setup card. It does not work yet: no control is live and nothing is sent anywhere. */
export const FAMILY_PLAN_COPY = {
  title: 'Family plan',
  badge: 'Coming soon',
  explain: 'Link accounts so a household can share a plan.',
  unavailable: 'Not available yet. These controls will switch on when family plans are ready.',
  inviteTitle: 'Invite someone',
  inviteEmailLabel: 'Their email',
  inviteButton: 'Invite someone',
  joinTitle: 'Join with a code',
  joinCodeLabel: 'Invite code',
  joinButton: 'Join with a code',
} as const;
