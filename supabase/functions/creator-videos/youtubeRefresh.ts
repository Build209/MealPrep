import {
  shouldPersistVideoOnRefresh,
  type CreatorVideoOverrideAction,
} from './creatorVideoOverrides.ts';
import {
  isRecipeLikeVideo,
  parseIsoDurationSeconds,
} from './recipeVideoFilter.ts';
import { dedupeVideoUpsertRows } from './videoSanitizer.ts';

const UPLOADS_PAGE_SIZE = 50;

/** YouTube Data API quota units (see Google quota costs). */
export const YOUTUBE_UNITS_CHANNELS_LIST = 1;
export const YOUTUBE_UNITS_PLAYLIST_ITEMS_LIST = 1;
export const YOUTUBE_UNITS_VIDEOS_LIST = 1;
export const YOUTUBE_UNITS_CHANNELS_FOR_HANDLE = 1;

export interface CreatorRowInput {
  youtube_channel_id: string;
  display_name: string;
  handle: string | null;
  channel_url: string;
  avatar_url: string | null;
  subscriber_count: number;
  total_views: number;
  enabled: boolean;
  rank: number | null;
  notes: string | null;
}

export interface VideoUpsertRow {
  video_id: string;
  channel_id: string;
  title: string;
  description_snippet: string | null;
  thumbnail_url: string;
  published_at: string | null;
  view_count: number;
  like_count: number;
  duration_seconds: number | null;
  is_short: boolean;
  url: string;
  fetched_at: string;
}

interface YouTubeChannelListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      customUrl?: string;
      thumbnails?: { high?: { url?: string }; default?: { url?: string } };
    };
    statistics?: {
      subscriberCount?: string;
      viewCount?: string;
    };
    contentDetails?: {
      relatedPlaylists?: { uploads?: string };
    };
  }>;
}

interface YouTubePlaylistItemsResponse {
  items?: Array<{
    contentDetails?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
    };
  }>;
  nextPageToken?: string;
}

interface YouTubeVideosListResponse {
  items?: Array<{
    id?: string;
    snippet?: { title?: string; description?: string };
    statistics?: { viewCount?: string; likeCount?: string };
    contentDetails?: { duration?: string };
  }>;
}

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function channelUrlFromHandle(handle: string | null, channelId: string): string {
  if (handle?.startsWith('@')) return `https://www.youtube.com/${handle}`;
  return `https://www.youtube.com/channel/${channelId}`;
}

async function youtubeGet<T>(url: URL): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(25_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function resolveChannelIdFromHandle(
  apiKey: string,
  handle: string,
): Promise<string | null> {
  const forHandle = normalizeHandle(handle).replace(/^@/, '');
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'id');
  url.searchParams.set('forHandle', forHandle);
  url.searchParams.set('key', apiKey);
  const data = await youtubeGet<YouTubeChannelListResponse>(url);
  const id = data?.items?.[0]?.id?.trim();
  return id ?? null;
}

export async function fetchChannelBundle(
  apiKey: string,
  channelId: string,
): Promise<{ creator: CreatorRowInput; uploadsPlaylistId: string } | null> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'contentDetails,statistics,snippet');
  url.searchParams.set('id', channelId);
  url.searchParams.set('key', apiKey);
  const data = await youtubeGet<YouTubeChannelListResponse>(url);
  const item = data?.items?.[0];
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads?.trim();
  const title = item?.snippet?.title?.trim();
  if (!uploads || !title) return null;

  const customUrl = item.snippet?.customUrl?.trim() ?? null;
  const handle = customUrl ? normalizeHandle(customUrl) : null;
  const avatar =
    item.snippet?.thumbnails?.high?.url?.trim() ??
    item.snippet?.thumbnails?.default?.url?.trim() ??
    null;

  const subscriberCount = Number.parseInt(item.statistics?.subscriberCount ?? '0', 10) || 0;
  const totalViews = Number.parseInt(item.statistics?.viewCount ?? '0', 10) || 0;

  return {
    uploadsPlaylistId: uploads,
    creator: {
      youtube_channel_id: channelId,
      display_name: title,
      handle,
      channel_url: channelUrlFromHandle(handle, channelId),
      avatar_url: avatar,
      subscriber_count: subscriberCount,
      total_views: totalViews,
      enabled: true,
      rank: null,
      notes: null,
    },
  };
}

async function fetchPlaylistVideoIds(
  apiKey: string,
  playlistId: string,
  maxItems: number,
): Promise<
  Array<{
    videoId: string;
    title: string;
    description: string;
    publishedAt: string | null;
    thumbnailUrl: string;
  }>
> {
  const results: Array<{
    videoId: string;
    title: string;
    description: string;
    publishedAt: string | null;
    thumbnailUrl: string;
  }> = [];
  let pageToken: string | undefined;
  while (results.length < maxItems) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'contentDetails,snippet');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', String(Math.min(50, maxItems - results.length)));
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await youtubeGet<YouTubePlaylistItemsResponse>(url);
    if (!data?.items?.length) break;
    for (const row of data.items) {
      const videoId = row.contentDetails?.videoId?.trim();
      const title = row.snippet?.title?.trim() ?? '';
      if (!videoId || !title) continue;
      const thumb =
        row.snippet?.thumbnails?.high?.url?.trim() ??
        row.snippet?.thumbnails?.medium?.url?.trim() ??
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      results.push({
        videoId,
        title,
        description: row.snippet?.description?.trim() ?? '',
        publishedAt: row.snippet?.publishedAt?.trim() ?? null,
        thumbnailUrl: thumb,
      });
      if (results.length >= maxItems) break;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return results;
}

async function fetchVideoStats(
  apiKey: string,
  videoIds: readonly string[],
): Promise<Map<string, YouTubeVideosListResponse['items'][0]>> {
  const map = new Map<string, YouTubeVideosListResponse['items'][0]>();
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }
  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics,contentDetails,snippet');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('key', apiKey);
    const data = await youtubeGet<YouTubeVideosListResponse>(url);
    for (const item of data?.items ?? []) {
      const id = item.id?.trim();
      if (id) map.set(id, item);
    }
  }
  return map;
}

export async function refreshCreatorVideos(
  apiKey: string,
  channelId: string,
  uploadsPlaylistId: string,
  overrides: ReadonlyMap<string, CreatorVideoOverrideAction> = new Map(),
): Promise<{ videos: VideoUpsertRow[]; avgViews: number; avgLikes: number }> {
  const playlistItems = await fetchPlaylistVideoIds(apiKey, uploadsPlaylistId, UPLOADS_PAGE_SIZE);
  const ids = playlistItems.map((row) => row.videoId);
  const stats = await fetchVideoStats(apiKey, ids);
  const fetchedAt = new Date().toISOString();
  const videos: VideoUpsertRow[] = [];

  for (const item of playlistItems) {
    const detail = stats.get(item.videoId);
    const snippetDesc = detail?.snippet?.description?.trim() ?? item.description;
    const title = detail?.snippet?.title?.trim() ?? item.title;
    const durationSeconds = parseIsoDurationSeconds(detail?.contentDetails?.duration);
    const isShort = durationSeconds != null && durationSeconds > 0 && durationSeconds <= 60;
    if (
      !shouldPersistVideoOnRefresh(
        item.videoId,
        title,
        snippetDesc,
        overrides,
        (videoTitle, description) => isRecipeLikeVideo(videoTitle, description, { isShort }),
      )
    ) {
      continue;
    }
    const viewCount = Number.parseInt(detail?.statistics?.viewCount ?? '0', 10) || 0;
    const likeCount = Number.parseInt(detail?.statistics?.likeCount ?? '0', 10) || 0;

    videos.push({
      video_id: item.videoId,
      channel_id: channelId,
      title,
      description_snippet: snippetDesc || null,
      thumbnail_url: item.thumbnailUrl,
      published_at: item.publishedAt,
      view_count: viewCount,
      like_count: likeCount,
      duration_seconds: durationSeconds,
      is_short: isShort,
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      fetched_at: fetchedAt,
    });
  }

  const avgViews =
    videos.length > 0
      ? Math.round(videos.reduce((sum, row) => sum + row.view_count, 0) / videos.length)
      : 0;
  const avgLikes =
    videos.length > 0
      ? Math.round(videos.reduce((sum, row) => sum + row.like_count, 0) / videos.length)
      : 0;

  return { videos: dedupeVideoUpsertRows(videos), avgViews, avgLikes };
}

export function estimateRefreshUnitsForCreator(playlistPages: number, videoListChunks: number): number {
  return (
    YOUTUBE_UNITS_CHANNELS_LIST +
    playlistPages * YOUTUBE_UNITS_PLAYLIST_ITEMS_LIST +
    videoListChunks * YOUTUBE_UNITS_VIDEOS_LIST
  );
}

export function estimateVideoListChunks(videoCount: number): number {
  return Math.max(1, Math.ceil(videoCount / 50));
}

export async function upsertCreatorByHandle(
  apiKey: string,
  handle: string,
): Promise<{ channelId: string; creator: CreatorRowInput } | null> {
  const channelId = await resolveChannelIdFromHandle(apiKey, handle);
  if (!channelId) return null;
  const bundle = await fetchChannelBundle(apiKey, channelId);
  if (!bundle) return null;
  return { channelId, creator: bundle.creator };
}
