import { canonicalYouTubeWatchUrl } from './urlClassification.ts';
import { sanitizeHttpUrl } from './safeHttpUrl.ts';

export interface YouTubeCreatorMeta {
  channelName: string;
  channelUrl: string;
}

export function youtubeVideoIdFromImportUrl(urlString: string): string | null {
  try {
    const canonical = canonicalYouTubeWatchUrl(urlString);
    const parsed = new URL(canonical);
    const v = parsed.searchParams.get('v');
    if (v && /^[\w-]{6,}$/.test(v)) return v;
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (id) return id;
    }
    const shorts = parsed.pathname.match(/\/shorts\/([\w-]+)/);
    if (shorts?.[1]) return shorts[1];
  } catch {
    return null;
  }
  return null;
}

export function parseYouTubeOembedPayload(raw: unknown): YouTubeCreatorMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const channelName =
    typeof obj.author_name === 'string' && obj.author_name.trim() ? obj.author_name.trim() : null;
  const channelUrl =
    typeof obj.author_url === 'string' && obj.author_url.trim() ? obj.author_url.trim() : null;
  const safeUrl = channelUrl ? sanitizeHttpUrl(channelUrl) : null;
  if (!channelName || !safeUrl) return null;
  return { channelName, channelUrl: safeUrl };
}

export async function fetchYouTubeCreatorFromOembed(pageUrl: string): Promise<YouTubeCreatorMeta | null> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(pageUrl)}&format=json`;
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(12_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const json = (await response.json()) as unknown;
    return parseYouTubeOembedPayload(json);
  } catch {
    return null;
  }
}

export async function fetchYouTubeCreatorFromVideosApi(
  apiKey: string,
  videoId: string,
): Promise<YouTubeCreatorMeta | null> {
  if (!apiKey.trim() || !videoId) return null;
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body = (await response.json()) as {
    items?: Array<{
      snippet?: { channelTitle?: string; channelId?: string };
    }>;
  };
  const snippet = body.items?.[0]?.snippet;
  const channelTitle = snippet?.channelTitle?.trim() ?? '';
  const channelId = snippet?.channelId?.trim() ?? '';
  if (!channelTitle || !channelId) return null;
  return {
    channelName: channelTitle,
    channelUrl: `https://www.youtube.com/channel/${channelId}`,
  };
}

export async function resolveYouTubeCreatorMeta(
  normalizedUrl: string,
  watchUrl: string,
): Promise<YouTubeCreatorMeta | null> {
  const oembed =
    (await fetchYouTubeCreatorFromOembed(normalizedUrl)) ??
    (await fetchYouTubeCreatorFromOembed(watchUrl));
  if (oembed) return oembed;

  const apiKey = Deno.env.get('YOUTUBE_API_KEY') ?? '';
  const videoId = youtubeVideoIdFromImportUrl(watchUrl);
  if (!videoId) return null;
  return await fetchYouTubeCreatorFromVideosApi(apiKey, videoId);
}
