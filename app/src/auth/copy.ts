/**
 * Words for sign-in, sign-up and forgot password.
 *
 * Most lines are carried over word for word from the live app (mobile/config/authConfig.ts and
 * mobile/config/account.ts), which compliance has seen. Lines marked NEW are written for the
 * rebuild and have not been through compliance yet.
 */

/** The terms and privacy pages state the same age. */
export const MINIMUM_AGE = 18;

/** Same rule as the live app and the auth server. */
export const MIN_PASSWORD_LENGTH = 6;

export const LEGAL_LINKS = {
  terms: 'https://mealplanatic.app/terms.html',
  privacy: 'https://mealplanatic.app/privacy.html',
} as const;

/**
 * Where links in auth emails send people when there is no better address: the live app, which is
 * on the server's allowed list and has its own "Choose a new password" screen. On the web, reset
 * links go to this app's own /reset-password screen instead (passwordResetRedirect in logic.ts).
 * NEW: chosen for the rebuild.
 */
export const AUTH_EMAIL_REDIRECT = 'https://mealplanatic.app/';

export const AUTH_SCREEN_COPY = {
  signInTab: 'Sign in',
  signUpTab: 'Create account',
  signOut: 'Sign out',
  blurb: 'Sign in with your email and password.',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  /** NEW: the live app put this in the placeholder; DESIGN.md wants a visible hint instead. */
  newPasswordHint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  /**
   * The live app's note was: "By creating an account you confirm you are 18 or older and agree to
   * the Terms and Privacy Policy." The rebuild makes it a box to tick, so the same words are
   * turned into the first person. NEW wording: compliance to confirm.
   */
  ageCheckbox: `I confirm I am ${MINIMUM_AGE} or older and agree to the Terms and Privacy Policy.`,
  termsLink: 'Read the Terms',
  privacyLink: 'Read the Privacy Policy',
  /** NEW */
  busySignIn: 'Signing in...',
  /** NEW */
  busySignUp: 'Creating account...',
  /** NEW */
  busyReset: 'Sending...',
  /** NEW */
  busySignOut: 'Signing out...',
  /** NEW */
  signedInAs: 'Signed in as',
  /** NEW: shown when the build was made without the server address and key. */
  noServerTitle: 'This build has no server settings',
  noServerBody:
    'Sign-in cannot work in this copy of the app because it was built without the server address. Use the app at mealplanatic.app instead.',
} as const;

export const AUTH_RESULT_COPY = {
  unavailable: 'Sign-in is not available right now. Please try again in a moment.',
  wrongCredentials: 'That email and password do not match. Check both and try again.',
  alreadyRegistered: 'There is already an account with that email. Choose "Sign in" instead.',
  emailNotConfirmed: 'Confirm your email first: open the link we sent you, then sign in.',
  confirmEmail: 'Almost there. Open the link we just emailed you to confirm your account, then sign in.',
  weakPassword: 'Choose a password with at least 6 characters.',
  invalidEmail: 'That email address does not look right. Check it and try again.',
  tooManyAttempts: 'Too many tries. Wait a minute, then try again.',
  offline: 'No connection. Check your internet and try again.',
  missingFields: 'Enter your email and password.',
  generic: 'That did not work. Please try again.',
  /** NEW: shown under the Create account button until the box is ticked. */
  ageNotConfirmed: `Tick the box to confirm you are ${MINIMUM_AGE} or older.`,
} as const;

/** "Forgot password": ask for a reset link by email. */
export const AUTH_RESET_COPY = {
  forgotLink: 'Forgot password?',
  title: 'Reset your password',
  blurb: 'Enter the email for your account and we will send you a link to choose a new password.',
  sendButton: 'Email me a reset link',
  backToSignIn: 'Back to sign in',
  /** Said whether or not the address has an account, so nobody can use this to find out who does. */
  sent: 'If that email has an account, a reset link is on its way. Open it on this device to choose a new password.',
  missingEmail: 'Enter your email address.',
  // The lines below up to busySave are carried over word for word from the live app's
  // "Choose a new password" screen (mobile/config/authConfig.ts).
  newPasswordTitle: 'Choose a new password',
  newPasswordBlurb: 'You opened a password reset link. Enter a new password for your account.',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'New password again',
  mismatch: 'The two passwords are not the same.',
  saveButton: 'Save new password',
  notNow: 'Not now',
  saved: 'Your password is changed.',
  linkExpired: 'That reset link has expired or was already used. Ask for a new one from "Forgot password?".',
  samePassword: 'Choose a password you have not used on this account before.',
  /** NEW */
  busySave: 'Saving...',
  /** NEW: shown for a moment while the reset link is checked. */
  checkingLink: 'Checking your reset link...',
} as const;
