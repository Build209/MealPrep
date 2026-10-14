import { sanitizeHttpUrl } from './safeHttpUrl.ts';

export interface TikTokOembedResult {
  caption: string;
  authorName: string;
  authorUrl: string | null;
  thumbnailUrl: string | null;
}

export function parseTikTokOembedPayload(raw: unknown): TikTokOembedResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return null;
  const authorName =
    typeof obj.author_name === 'string' && obj.author_name.trim()
      ? obj.author_name.trim()
      : 'creator';
  const authorUrlRaw =
    typeof obj.author_url === 'string' && obj.author_url.trim() ? obj.author_url.trim() : null;
  const authorUrl = authorUrlRaw ? sanitizeHttpUrl(authorUrlRaw) : null;
  const thumbnailUrl =
    typeof obj.thumbnail_url === 'string' && obj.thumbnail_url.trim()
      ? obj.thumbnail_url.trim()
      : null;
  return { caption: title, authorName, authorUrl, thumbnailUrl };
}

export async function fetchTikTokOembed(postUrl: string): Promise<TikTokOembedResult | null> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(postUrl)}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const json = (await response.json()) as unknown;
    return parseTikTokOembedPayload(json);
  } catch {
    return null;
  }
}
