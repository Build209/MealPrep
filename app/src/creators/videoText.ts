/**
 * Cleaning creator video text before it reaches the screen, and the watch link.
 *
 * Titles and descriptions come from the video site through the creator-videos refresh job. The old
 * job cleaned them before saving (mobile/supabase/functions/creator-videos/videoSanitizer.ts:
 * no NUL bytes, no lone surrogates, cut by code point so emoji are never split). Rows saved before
 * that fix, or by hand, may not be clean, so the app cleans again on read with the same rules.
 * Checks: tests/creators-video-text.test.ts.
 */

/** Remove NUL bytes and lone UTF-16 surrogates. Ported unchanged from videoSanitizer.ts. */
export function stripInvalidUnicode(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i]! + input[i + 1]!;
        i += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += input[i]!;
  }
  return out;
}

/** Truncate by Unicode code point count (safe for emoji). Ported unchanged from videoSanitizer.ts. */
export function truncateByCodePoints(input: string, maxCodePoints: number): string {
  const cleaned = stripInvalidUnicode(input);
  if (maxCodePoints <= 0) return '';
  const points = [...cleaned];
  if (points.length <= maxCodePoints) return cleaned;
  return points.slice(0, maxCodePoints).join('');
}

/** Same limits as the refresh job. */
export const MAX_TITLE_CODE_POINTS = 500;
export const MAX_DESCRIPTION_CODE_POINTS = 500;

/** Control characters other than line breaks and tabs; never shown. */
const CONTROL_CHARS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Text safe to show: valid Unicode, no control characters, spaces collapsed, cut to `max` code points. */
export function cleanVideoText(input: string | null | undefined, max: number): string {
  if (typeof input !== 'string') return '';
  const cleaned = stripInvalidUnicode(input).replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  return truncateByCodePoints(cleaned, max).trim();
}

/** A title to show; "Untitled" when nothing is left (the refresh job's fallback). */
export function cleanVideoTitle(input: string | null | undefined): string {
  return cleanVideoText(input, MAX_TITLE_CODE_POINTS) || 'Untitled';
}

// ------------------------------------------------------------------ watch link

export type WatchLink = {
  /** The https address to open outside the app. */
  url: string;
  /**
   * What the button says. Compliance rule 5: another company's name only as plain text saying
   * what the link does. No logo, no "partner".
   */
  label: string;
};

const VIDEO_SITE_HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

function isVideoSiteHost(host: string): boolean {
  const h = host.toLowerCase();
  return VIDEO_SITE_HOSTS.some((site) => h === site || h.endsWith(`.${site}`));
}

/**
 * The link to open for a video, or null when the address is not a plain https web address (so a
 * bad row can never open a script or an app scheme). Labelled "Watch on YouTube" for that site,
 * "Watch the video" otherwise.
 */
export function watchLink(raw: string | null | undefined): WatchLink | null {
  if (typeof raw !== 'string') return null;
  const text = stripInvalidUnicode(raw).trim();
  if (!text || /\s/.test(text)) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
  return { url: parsed.toString(), label: isVideoSiteHost(parsed.hostname) ? 'Watch on YouTube' : 'Watch the video' };
}

/** An image address safe to load (https, or http only for a local test server), else null. */
export function imageAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const text = stripInvalidUnicode(raw).trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol === 'https:') return parsed.toString();
    if (parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}
