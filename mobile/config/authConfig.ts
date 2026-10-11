/** Auth UI feature flags (Supabase OTP / magic-link code paths stay in AppContext). */
export const AUTH_CONFIG = {
  magicLinkEnabled: false,
} as const;

const AUTH_CARD_BLURB_WITH_MAGIC_LINK =
  'Sign in with your email and password, or get a one-tap sign-in link by email.';

const AUTH_CARD_BLURB_PASSWORD_ONLY = 'Sign in with your email and password.';

export const AUTH_MAGIC_LINK_COPY = {
  buttonLabel: 'Email magic link',
  successMessage: 'Magic link sent — check your email.',
} as const;

export function isMagicLinkSignInEnabled(): boolean {
  return AUTH_CONFIG.magicLinkEnabled;
}

export function getAuthCardBlurb(): string {
  return isMagicLinkSignInEnabled() ? AUTH_CARD_BLURB_WITH_MAGIC_LINK : AUTH_CARD_BLURB_PASSWORD_ONLY;
}

/** What a sign-in, sign-up or magic-link attempt came to, so the sheet can stay open and say so. */
export type AuthActionResult =
  | { ok: true; /** Something the person must still do, e.g. confirm by email. The sheet stays open to show it. */ notice?: string }
  | { ok: false; error: string };

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
} as const;

export const AUTH_MIN_PASSWORD_LENGTH = 6;

/** Plain wording for the auth server's messages; anything unrecognised is shown as it came. */
export function authErrorMessage(raw: string | null | undefined): string {
  const message = (raw ?? '').trim();
  const lower = message.toLowerCase();
  if (!message) return AUTH_RESULT_COPY.generic;
  if (lower.includes('invalid login credentials')) return AUTH_RESULT_COPY.wrongCredentials;
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return AUTH_RESULT_COPY.alreadyRegistered;
  }
  if (lower.includes('email not confirmed')) return AUTH_RESULT_COPY.emailNotConfirmed;
  if (lower.includes('password should be at least') || lower.includes('weak password')) {
    return AUTH_RESULT_COPY.weakPassword;
  }
  if (lower.includes('invalid email') || lower.includes('unable to validate email') || lower.includes('invalid format')) {
    return AUTH_RESULT_COPY.invalidEmail;
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('security purposes')) {
    return AUTH_RESULT_COPY.tooManyAttempts;
  }
  if (lower.includes('failed to fetch') || lower.includes('network request failed') || lower.includes('networkerror')) {
    return AUTH_RESULT_COPY.offline;
  }
  return message;
}
