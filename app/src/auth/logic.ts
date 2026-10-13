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
