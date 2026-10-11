import * as Linking from 'expo-linking';
import { AUTH_EMAIL_REDIRECT_PATH } from '../config/appRoutes';
import { getWebBasePath } from './webBasePath';
import { passwordResetLinkState } from '../config/authConfig';

/** Redirect target for Supabase email links (magic link / confirm). Must match Auth URL config. */
export function getAuthRedirectUrl(path: string = String(AUTH_EMAIL_REDIRECT_PATH)): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${getWebBasePath()}${normalizedPath}`;
  }
  return Linking.createURL(normalizedPath.replace(/^\//, ''));
}

/**
 * Read once, when the app's code first loads: the auth client removes the link's details from
 * the address as soon as it starts, so asking later would always answer "no".
 */
const OPENED_FROM_PASSWORD_RESET_LINK =
  typeof window !== 'undefined' && window.location
    ? passwordResetLinkState(window.location.hash ?? '', window.location.search ?? '')
    : null;

/** Whether this visit began from a password reset email ('recovery'), a dead one ('expired'), or neither. */
export function openedFromPasswordResetLink(): 'recovery' | 'expired' | null {
  return OPENED_FROM_PASSWORD_RESET_LINK;
}
