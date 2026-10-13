/**
 * Calls to Supabase Auth, each turned into an AuthActionResult with plain wording.
 * They take the auth client as an argument so tests can pass a fake one.
 * The session itself is not kept here: AuthProvider hears about it from onAuthStateChange.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTH_EMAIL_REDIRECT, AUTH_RESET_COPY, AUTH_RESULT_COPY } from './copy';
import { authErrorMessage, signUpOutcome, thrownMessage, type AuthActionResult } from './logic';

export type AuthClient = SupabaseClient['auth'];

export async function signIn(auth: AuthClient | null, email: string, password: string): Promise<AuthActionResult> {
  if (!auth) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
  try {
    const { error } = await auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: authErrorMessage(error.message) };
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: authErrorMessage(thrownMessage(error)) };
  }
}

/**
 * Only called once the 18+ box is ticked (the button does not work before). The profile name
 * defaults to the part of the email before the @, done by the database's sign-up trigger.
 * `redirectTo` is where the confirm link lands (the preview build passes its own address).
 */
export async function signUp(
  auth: AuthClient | null,
  email: string,
  password: string,
  redirectTo: string = AUTH_EMAIL_REDIRECT,
): Promise<AuthActionResult> {
  if (!auth) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
  try {
    const { data, error } = await auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return { ok: false, error: authErrorMessage(error.message) };
    return signUpOutcome({ session: data.session, user: data.user });
  } catch (error: unknown) {
    return { ok: false, error: authErrorMessage(thrownMessage(error)) };
  }
}

/** Says the same thing whether or not the address has an account. */
export async function requestPasswordReset(auth: AuthClient | null, email: string): Promise<AuthActionResult> {
  if (!auth) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: AUTH_RESET_COPY.missingEmail };
  try {
    const { error } = await auth.resetPasswordForEmail(trimmed, { redirectTo: AUTH_EMAIL_REDIRECT });
    if (error) return { ok: false, error: authErrorMessage(error.message) };
    return { ok: true, notice: AUTH_RESET_COPY.sent };
  } catch (error: unknown) {
    return { ok: false, error: authErrorMessage(thrownMessage(error)) };
  }
}

export async function signOut(auth: AuthClient | null): Promise<AuthActionResult> {
  if (!auth) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
  try {
    const { error } = await auth.signOut();
    if (error) return { ok: false, error: authErrorMessage(error.message) };
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: authErrorMessage(thrownMessage(error)) };
  }
}
