import { cleanVideoText, cleanVideoTitle, imageAddress, MAX_DESCRIPTION_CODE_POINTS, watchLink, type WatchLink } from '../creators/videoText';

/**
 * Creator rows (recipe_creators, creator_videos in db/supabase/migrations/20261013000000_live_baseline.sql)
 * and their mapping. Both tables are public read for enabled creators (row level security), and the
 * app only reads them. No network here, so tests can run it.
 */

// ------------------------------------------------------------- recipe_creators

export type RecipeCreatorRow = {
  youtube_channel_id: string;
  display_name: string;
  handle: string | null;
  channel_url: string;
  avatar_url: string | null;
  rank: number | null;
};

export const RECIPE_CREATOR_COLUMNS = 'youtube_channel_id, display_name, handle, channel_url, avatar_url, rank';

export type Creator = {
  channelId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
};

export function creatorFromRow(row: RecipeCreatorRow): Creator {
  return {
    channelId: row.youtube_channel_id,
    name: cleanVideoText(row.display_name, 80) || 'Creator',
    handle: row.handle ? cleanVideoText(row.handle, 80) || null : null,
    avatarUrl: imageAddress(row.avatar_url),
  };
}

// -------------------------------------------------------------- creator_videos

export type CreatorVideoRow = {
  video_id: string;
  channel_id: string;
  title: string;
  description_snippet: string | null;
  thumbnail_url: string;
  published_at: string | null;
  view_count: number | string; // bigint (PostgREST may send it as a string)
  duration_seconds: number | null;
  is_short: boolean;
  url: string;
};

export const CREATOR_VIDEO_COLUMNS =
  'video_id, channel_id, title, description_snippet, thumbnail_url, published_at, view_count, duration_seconds, is_short, url';

export type CreatorVideo = {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  durationSeconds: number | null;
  isShort: boolean;
  /** Where the video plays, outside the app. */
  watch: WatchLink;
  creatorName: string;
};

/**
 * A row ready to show, or null when it can't be opened safely (no https watch address).
 * Text is cleaned (videoText.ts); the creator name comes from the enabled creators list.
 */
export function creatorVideoFromRow(row: CreatorVideoRow, creators: ReadonlyMap<string, Creator>): CreatorVideo | null {
  const videoId = typeof row.video_id === 'string' ? row.video_id.trim() : '';
  if (!videoId) return null;
  const watch = watchLink(row.url);
  if (!watch) return null;
  const views = Number(row.view_count);
  return {
    videoId,
    channelId: row.channel_id,
    title: cleanVideoTitle(row.title),
    description: cleanVideoText(row.description_snippet, MAX_DESCRIPTION_CODE_POINTS),
    thumbnailUrl: imageAddress(row.thumbnail_url),
    publishedAt: row.published_at,
    viewCount: Number.isFinite(views) ? views : 0,
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    isShort: row.is_short === true,
    watch,
    creatorName: creators.get(row.channel_id)?.name ?? 'Creator',
  };
}

/** Maps rows, dropping the ones that can't be shown. */
export function creatorVideosFromRows(rows: readonly CreatorVideoRow[], creators: readonly Creator[]): CreatorVideo[] {
  const byChannel = new Map<string, Creator>(creators.map((c) => [c.channelId, c] as const));
  const out: CreatorVideo[] = [];
  for (const row of rows) {
    const video = creatorVideoFromRow(row, byChannel);
    if (video) out.push(video);
  }
  return out;
}

/** Longest search text sent to the server (same as the old creator-videos function). */
export const CREATOR_SEARCH_MAX_LENGTH = 80;

/** The text sent to search_creator_videos, or null when it is too short to search (under 2). */
export function creatorSearchText(query: string): string | null {
  const q = query.trim().slice(0, CREATOR_SEARCH_MAX_LENGTH).trim();
  return q.length >= 2 ? q : null;
}
