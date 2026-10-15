/**
 * Which kind of build this is, so the phone preview says plainly that it is a preview.
 * Pure functions only (tested in tests/channel.test.ts); the values come from env.ts.
 *
 * EXPO_PUBLIC_APP_CHANNEL is set to "preview" only by .github/workflows/app-preview.yml.
 * Anything else (unset, empty, a typo) counts as an ordinary build with no label.
 */
export type AppChannel = 'preview' | 'default';

export const PREVIEW_LABEL = 'Preview build';

export function parseChannel(raw: string | undefined): AppChannel {
  return raw?.trim().toLowerCase() === 'preview' ? 'preview' : 'default';
}

/** The small label shown in the top bar, or null when the build is not a preview. */
export function channelLabel(channel: AppChannel): string | null {
  return channel === 'preview' ? PREVIEW_LABEL : null;
}

/** First 7 characters of a git commit id, or null when it is missing or not a commit id. */
export function shortSha(raw: string | undefined): string | null {
  const sha = raw?.trim().toLowerCase() ?? '';
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : null;
}

/** The Home card's small print about the build, e.g. "Build 1a2b3c4", or null with no commit id. */
export function buildLine(raw: string | undefined): string | null {
  const sha = shortSha(raw);
  return sha ? `Build ${sha}` : null;
}

/**
 * Where the "confirm your email" link in a sign-up email should land. A preview build on the web
 * sends people back to the preview's own address (which must be on Supabase's Redirect URLs list,
 * see app/PREVIEW.md); every other build uses the normal address.
 */
export function signUpRedirect(channel: AppChannel, origin: string | undefined, fallback: string): string {
  if (channel !== 'preview' || !origin) return fallback;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return fallback;
    return `${url.origin}/`;
  } catch {
    return fallback;
  }
}
