/**
 * What the person pasted or typed in the import box: a link, a link with a caption, or recipe text.
 * Ported from the old app (mobile/lib/recipeImport/parseImportInput.ts and urlClassificationClient.ts)
 * so the new app sends the live recipe-import function exactly what the old one does.
 * Pure functions only (tests/recipe-import-request.test.ts).
 */

/** The function refuses shorter text (MIN_TEXT_IMPORT_CHARS in recipe-import/index.ts). */
export const MIN_TEXT_IMPORT_CHARS = 24;

export type ImportUrlKind = 'youtube' | 'web' | 'tiktok' | 'instagram' | 'facebook' | 'reddit';

export function normalizeImportUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const FACEBOOK_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch', 'www.fb.watch']);
const REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com', 'm.reddit.com', 'redd.it', 'www.redd.it']);

/** Same rules as the function's urlClassification.ts (the old app's client copy). */
export function classifyImportUrl(urlString: string): ImportUrlKind | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (YOUTUBE_HOSTS.has(host) || host.endsWith('.youtube.com') || url.pathname.includes('/shorts/')) return 'youtube';
  if (TIKTOK_HOSTS.has(host) || host.endsWith('.tiktok.com')) return 'tiktok';
  if (INSTAGRAM_HOSTS.has(host) || host.endsWith('.instagram.com')) return 'instagram';
  if (FACEBOOK_HOSTS.has(host) || host.endsWith('.facebook.com') || host === 'fb.watch') return 'facebook';
  if (REDDIT_HOSTS.has(host) || host.endsWith('.reddit.com')) return 'reddit';
  return 'web';
}

/** Instagram and Facebook block automatic captions: the person pastes the caption with the link. */
export function needsPastedCaption(kind: ImportUrlKind | null): boolean {
  return kind === 'instagram' || kind === 'facebook';
}

/** First http(s) link in shared or pasted text, trailing punctuation trimmed. */
export function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[)\]"']+$/, '') : null;
}

export type ParsedImportInput = { kind: 'url'; url: string; caption?: string } | { kind: 'text'; text: string };

/** Link, link plus caption, or recipe text; null when there is nothing usable (old parseImportInput). */
export function parseImportInput(raw: string): ParsedImportInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const embedded = extractUrlFromText(trimmed);
  if (embedded) {
    const normalized = normalizeImportUrl(embedded);
    if (normalized) {
      const caption = trimmed.replace(embedded, '').replace(/\s+/g, ' ').trim();
      return caption.length > 0 ? { kind: 'url', url: normalized, caption } : { kind: 'url', url: normalized };
    }
  }

  const directUrl = normalizeImportUrl(trimmed);
  if (directUrl) return { kind: 'url', url: directUrl };

  if (trimmed.length >= MIN_TEXT_IMPORT_CHARS) return { kind: 'text', text: trimmed };
  return null;
}

/** Only absolute http(s) links without credentials are ever shown as tappable links. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (['javascript:', 'data:', 'vbscript:', 'file:'].some((p) => lower.startsWith(p))) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return null;
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}
