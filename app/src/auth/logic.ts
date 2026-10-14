/**
 * Pure rules for the sign-in screen: no React, no network. Tested in tests/auth-logic.test.ts.
 */
import { AUTH_RESET_COPY, AUTH_RESULT_COPY, MIN_PASSWORD_LENGTH } from './copy';

export type AuthMode = 'sign-in' | 'sign-up' | 'reset';

export type AuthForm = {
  email: string;
  password: string;
  /** The 18+ box at sign-up. Starts unticked. */
  ageConfirmed: boolean;
};

/** What an auth attempt came to, so the screen can stay put and say so. */
export type AuthActionResult =
  | { ok: true; /** Something the person must still do, e.g. confirm by email. */ notice?: string }
  | { ok: false; error: string };

/** A light check only: something@something.something with no spaces. The server has the last word. */
export function isPlausibleEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export function isLongEnoughPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * The first thing stopping the form from being sent, in plain words, or null when it can go.
 * Sign-up needs a plausible email, a long enough password and the 18+ box ticked.
 */
export function submitBlocker(mode: AuthMode, form: AuthForm): string | null {
  const email = form.email.trim();
  if (mode === 'reset') {
    if (!email) return AUTH_RESET_COPY.missingEmail;
    if (!isPlausibleEmail(email)) return AUTH_RESULT_COPY.invalidEmail;
    return null;
  }
  if (!email || !form.password) return AUTH_RESULT_COPY.missingFields;
  if (!isPlausibleEmail(email)) return AUTH_RESULT_COPY.invalidEmail;
  if (mode === 'sign-up') {
    if (!isLongEnoughPassword(form.password)) return AUTH_RESULT_COPY.weakPassword;
    if (!form.ageConfirmed) return AUTH_RESULT_COPY.ageNotConfirmed;
  }
  return null;
}

/** The main button works only when nothing blocks the form and nothing is already being sent. */
export function canSubmit(mode: AuthMode, form: AuthForm, busy: boolean): boolean {
  return !busy && submitBlocker(mode, form) === null;
}

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
  if (lower.includes('different from the old password')) return AUTH_RESET_COPY.samePassword;
  if (lower.includes('auth session missing')) return AUTH_RESET_COPY.linkExpired;
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

/** The parts of a sign-up reply that decide what to tell the person. */
export type SignUpReply = {
  session: unknown | null;
  user: { identities?: unknown[] | null } | null;
};

/**
 * After a sign-up with no error:
 * - a session means they are signed in (email confirmation is off);
 * - an empty identity list is the server's quiet way of saying the address already has an account;
 * - otherwise they must open the confirmation email first.
 */
export function signUpOutcome(reply: SignUpReply): AuthActionResult {
  if (reply.session) return { ok: true };
  const identities = reply.user?.identities;
  if (reply.user && Array.isArray(identities) && identities.length === 0) {
    return { ok: false, error: AUTH_RESULT_COPY.alreadyRegistered };
  }
  return { ok: true, notice: AUTH_RESULT_COPY.confirmEmail };
}

/** Text of whatever was thrown, for authErrorMessage. */
export function thrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

/**
 * What the address the app was opened with says about a password reset link (same rule as the
 * live app). 'recovery': a good reset link. 'expired': a reset link the server refused.
 */
export function passwordResetLinkState(hash: string, search: string): 'recovery' | 'expired' | null {
  const text = `${hash}&${search}`;
  if (/[#&?]type=recovery(&|$)/.test(text)) return 'recovery';
  if (/[#&?]error_code=otp_expired(&|$)/.test(text) || /[#&?]error=access_denied(&|$)/.test(text)) return 'expired';
  return null;
}

/** The first thing stopping a new password from being saved (same length rule as sign-up), or null. */
export function newPasswordBlocker(password: string, again: string): string | null {
  if (!isLongEnoughPassword(password)) return AUTH_RESULT_COPY.weakPassword;
  if (password !== again) return AUTH_RESET_COPY.mismatch;
  return null;
}

/**
 * What the reset screen shows:
 * - 'checking' until the saved session (or the link's session) has been read;
 * - 'form' when someone is signed in, either by the reset link or already;
 * - 'expired' for a link the server refused, or nobody signed in (nothing to change).
 */
export type ResetScreenState = 'checking' | 'form' | 'expired';

export function resetScreenState(input: {
  ready: boolean;
  hasSession: boolean;
  /** The auth client's PASSWORD_RECOVERY event was heard. */
  recovery: boolean;
  link: 'recovery' | 'expired' | null;
}): ResetScreenState {
  if (!input.ready) return 'checking';
  if (input.hasSession && input.recovery) return 'form';
  // A refused link while an older session is still saved: do not offer to change that account.
  if (input.link === 'expired') return 'expired';
  return input.hasSession ? 'form' : 'expired';
}

/** The new app's own "Choose a new password" screen. */
export const RESET_PASSWORD_PATH = '/reset-password';

/**
 * Where the link in a "reset your password" email should land.
 * - Web: this app's own reset screen on the address it is running at (live site, preview, or the
 *   local test server). That address must be on Supabase's Redirect URLs list; if it is not, the
 *   auth server sends people to its Site URL instead (the live app, which has its own reset screen).
 * - Phones, or a plain-http address that is not this machine: the fallback (the live app).
 */
export function passwordResetRedirect(isWeb: boolean, origin: string | undefined, fallback: string): string {
  if (!isWeb || !origin) return fallback;
  try {
    const url = new URL(origin);
    const local = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    if (url.protocol !== 'https:' && !local) return fallback;
    return `${url.origin}${RESET_PASSWORD_PATH}`;
  } catch {
    return fallback;
  }
}
