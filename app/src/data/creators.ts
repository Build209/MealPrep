import { useQuery } from '@tanstack/react-query';
import { pickRecentVideos, visibleInFeed, dedupeVideos } from '../creators/feed';
import {
  CREATOR_VIDEO_COLUMNS,
  RECIPE_CREATOR_COLUMNS,
  creatorFromRow,
  creatorSearchText,
  creatorVideosFromRows,
  type Creator,
  type CreatorVideo,
  type CreatorVideoRow,
  type RecipeCreatorRow,
} from './creatorRows';
import { retryUnlessPermanent, run } from './errors';
import { requireClient } from './session';

export type { Creator, CreatorVideo } from './creatorRows';

/**
 * Creator videos: read only, straight from recipe_creators and creator_videos (public read for
 * enabled creators) and the search_creator_videos function. The old app went through its
 * creator-videos edge function; reading the tables directly needs no function call and no secret.
 *
 * Not ported: the function's manual hide list (creator_video_overrides is service role only).
 * The recipe-video rule in src/creators/videoFilter.ts (which catches most of those by title)
 * runs on every list here instead.
 */

// ------------------------------------------------------------------------ keys

/** Public data: the same for everyone, so no user id in these keys. */
export const creatorKeys = {
  all: ['creators'] as const,
  list: () => ['creators', 'list'] as const,
  recent: (limit: number) => ['creators', 'recent', String(limit)] as const,
  search: (text: string) => ['creators', 'search', text.toLowerCase()] as const,
} as const;

/** How many recent videos the server sends before the app picks the row (newest first). */
const RECENT_FETCH = 150;
/** search_creator_videos' default and the old function's choice. */
const SEARCH_LIMIT = 40;

// ----------------------------------------------------------------------- reads

/** Enabled creators (row level security hides the rest). */
export async function fetchCreators(): Promise<Creator[]> {
  const client = requireClient();
  const rows = await run<RecipeCreatorRow[]>(
    client.from('recipe_creators').select(RECIPE_CREATOR_COLUMNS).order('display_name', { ascending: true }),
  );
  return rows.map(creatorFromRow);
}

/** Recent recipe videos from enabled creators, channels taking turns, at most `limit`. */
export async function fetchRecentCreatorVideos(limit: number): Promise<CreatorVideo[]> {
  const client = requireClient();
  const [creators, rows] = await Promise.all([
    fetchCreators(),
    run<CreatorVideoRow[]>(
      client
        .from('creator_videos')
        .select(CREATOR_VIDEO_COLUMNS)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('video_id', { ascending: true })
        .limit(RECENT_FETCH),
    ),
  ]);
  return pickRecentVideos(creatorVideosFromRows(rows, creators), limit);
}

/** Creator videos matching the words (search_creator_videos: title and description, best first). */
export async function searchCreatorVideos(query: string): Promise<CreatorVideo[]> {
  const text = creatorSearchText(query);
  if (!text) return [];
  const client = requireClient();
  const [creators, rows] = await Promise.all([
    fetchCreators(),
    run<CreatorVideoRow[]>(client.rpc('search_creator_videos', { p_query: text, p_limit: SEARCH_LIMIT })),
  ]);
  return dedupeVideos(creatorVideosFromRows(rows, creators).filter(visibleInFeed));
}

// ----------------------------------------------------------------------- hooks

/** The recent videos row (CreatorVideosRow). */
export function useRecentCreatorVideos(limit = 24) {
  return useQuery({
    queryKey: creatorKeys.recent(limit),
    queryFn: () => fetchRecentCreatorVideos(limit),
    staleTime: 10 * 60 * 1000,
    retry: retryUnlessPermanent,
  });
}

/** Creator videos for a search; idle until the text is at least 2 characters. */
export function useCreatorVideoSearch(query: string) {
  const text = creatorSearchText(query);
  return useQuery({
    queryKey: creatorKeys.search(text ?? ''),
    queryFn: () => searchCreatorVideos(text ?? ''),
    enabled: text !== null,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessPermanent,
  });
}
