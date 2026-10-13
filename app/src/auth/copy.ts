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
 * Where links in auth emails (confirm address, reset password) send people. The live app has the
 * "Choose a new password" screen and is on the server's allowed list, so links go there until the
 * rebuild has its own reset screen. NEW: chosen for the rebuild.
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
} as const;
