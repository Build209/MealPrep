import { validatePublicHttpFetchUrl } from './ssrfGuard.ts';

const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'm.reddit.com',
  'redd.it',
  'www.redd.it',
]);

export function isRedditImportHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (REDDIT_HOSTS.has(h)) return true;
  return h.endsWith('.reddit.com');
}

export type RecipeImportSourceType =
  | 'youtube'
  | 'web'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'reddit'
  | 'photo'
  | 'video';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'fb.watch',
  'www.fb.watch',
]);

export function normalizeImportUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const validated = validatePublicHttpFetchUrl(withProtocol);
    if (!validated.ok) return null;
    const url = validated.url;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function classifyRecipeImportUrl(urlString: string): RecipeImportSourceType | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (YOUTUBE_HOSTS.has(host)) return 'youtube';
  if (host.endsWith('.youtube.com')) return 'youtube';
  if (url.pathname.includes('/shorts/')) return 'youtube';
  if (TIKTOK_HOSTS.has(host) || host.endsWith('.tiktok.com')) return 'tiktok';
  if (INSTAGRAM_HOSTS.has(host) || host.endsWith('.instagram.com')) return 'instagram';
  if (FACEBOOK_HOSTS.has(host) || host.endsWith('.facebook.com') || host === 'fb.watch') {
    return 'facebook';
  }
  if (isRedditImportHostname(host)) return 'reddit';
  return 'web';
}

/** Meta / IG: user must paste caption or upload screenshot (no server-side caption fetch). */
export function isManualCaptionSourceType(type: RecipeImportSourceType): boolean {
  return type === 'instagram' || type === 'facebook';
}

/** Legacy alias — TikTok now uses oEmbed; IG/FB still manual caption. */
export function isSocialCaptionSourceType(type: RecipeImportSourceType): boolean {
  return type === 'tiktok' || isManualCaptionSourceType(type);
}

export function canonicalYouTubeWatchUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (url.pathname.startsWith('/shorts/')) {
      const id = url.pathname.split('/')[2];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    const v = url.searchParams.get('v');
    if (v) return `https://www.youtube.com/watch?v=${v}`;
  } catch {
    /* keep original */
  }
  return urlString;
}

export function urlHashKey(urlString: string): string {
  return urlString.trim().toLowerCase();
}
