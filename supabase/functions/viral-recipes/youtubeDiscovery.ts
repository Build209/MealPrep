/**
 * YouTube viral-shelf discovery: US English dinner-focused search + relevance filters.
 * Shared by the edge function and local live-sample script.
 */

export type ViralRecipesCategory = 'viral' | 'quick' | 'budget';

export const ALL_VIRAL_RECIPE_CATEGORIES: ViralRecipesCategory[] = ['viral', 'quick', 'budget'];

/** search.list costs 100 units; videos.list costs 1 unit per call. */
export const YOUTUBE_SEARCH_MAX_RESULTS = 20;
export const TARGET_PER_CATEGORY = 20;

export const CATEGORY_SEARCH_QUERIES: Record<ViralRecipesCategory, readonly string[]> = {
  viral: ['viral dinner recipe', 'tiktok famous dinner recipe'],
  quick: ['15 minute dinner recipe', 'easy weeknight dinner recipe'],
  budget: ['cheap dinner recipe', 'budget family dinner recipe'],
};

export const YOUTUBE_SEARCH_DEFAULTS = {
  regionCode: 'US',
  relevanceLanguage: 'en',
  /** Howto & Style — omit when useVideoCategoryId is false. */
  videoCategoryId: '26',
  safeSearch: 'strict',
  order: 'viewCount',
  publishedWithinDays: 30,
} as const;

export interface YoutubeSearchOptions {
  regionCode?: string;
  relevanceLanguage?: string;
  useVideoCategoryId?: boolean;
  videoCategoryId?: string;
  maxResults?: number;
}

export interface YoutubeVideoCandidate {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  thumbnailUrl: string;
  viewCount: number;
  tags: string[];
}

export class YoutubeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const VLOG_BLOCK_RE = /\b(mini\s*vlog|minivlog|\bvlog\b|prank|giveaway|mukbang|asmr\s*eating)\b/i;

const RECIPE_FOOD_SIGNAL_RE =
  /\b(recipe|recipes|cooking|cook|dinner|lunch|breakfast|brunch|meal|meals|bake|baking|air\s*fryer|instant\s*pot|slow\s*cooker|skillet|sheet\s*pan|one\s*pan|pasta|chicken|beef|taco|soup|salad|stir\s*fry|casserole|meatloaf|chili|curry|pizza|burger|sandwich|noodles|rice|potato|salmon|shrimp|vegetarian|vegan|gluten\s*free|weeknight|minutes?)\b/i;

function publishedAfterIso(withinDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - withinDays);
  return d.toISOString();
}

function pickThumbnail(thumbnails: Record<string, { url?: string }> | undefined): string {
  for (const key of ['high', 'medium', 'default']) {
    const url = thumbnails?.[key]?.url;
    if (url) return url;
  }
  return '';
}

/** Prefer titles that read as English for US home cooks (mostly Latin letters). */
export function isMostlyEnglishTitle(title: string): boolean {
  if (/[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(title)) {
    return false;
  }
  const letters = [...title].filter((ch) => /\p{L}/u.test(ch));
  if (letters.length < 4) return false;
  const latin = letters.filter((ch) => /[A-Za-z]/.test(ch)).length;
  return latin / letters.length >= 0.85;
}

export function passesRecipeRelevanceFilter(title: string, tags: string[]): boolean {
  const haystack = `${title} ${tags.join(' ')}`.trim();
  if (!haystack) return false;
  if (VLOG_BLOCK_RE.test(haystack)) return false;
  if (!isMostlyEnglishTitle(title)) return false;
  if (!RECIPE_FOOD_SIGNAL_RE.test(haystack)) return false;
  return true;
}

export async function youtubeSearchVideoIds(
  apiKey: string,
  query: string,
  options: YoutubeSearchOptions = {},
): Promise<string[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('safeSearch', YOUTUBE_SEARCH_DEFAULTS.safeSearch);
  url.searchParams.set('order', YOUTUBE_SEARCH_DEFAULTS.order);
  url.searchParams.set('publishedAfter', publishedAfterIso(YOUTUBE_SEARCH_DEFAULTS.publishedWithinDays));
  url.searchParams.set('maxResults', String(options.maxResults ?? YOUTUBE_SEARCH_MAX_RESULTS));
  url.searchParams.set('q', query);
  url.searchParams.set('regionCode', options.regionCode ?? YOUTUBE_SEARCH_DEFAULTS.regionCode);
  url.searchParams.set('relevanceLanguage', options.relevanceLanguage ?? YOUTUBE_SEARCH_DEFAULTS.relevanceLanguage);
  if (options.useVideoCategoryId !== false) {
    url.searchParams.set(
      'videoCategoryId',
      options.videoCategoryId ?? YOUTUBE_SEARCH_DEFAULTS.videoCategoryId,
    );
  }
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const text = await response.text();
    throw new YoutubeApiError(`YouTube search failed: ${response.status} ${text.slice(0, 200)}`, response.status);
  }

  const body = (await response.json()) as {
    items?: Array<{ id?: { videoId?: string } }>;
  };

  const ids: string[] = [];
  for (const item of body.items ?? []) {
    const id = item.id?.videoId;
    if (id) ids.push(id);
  }
  return ids;
}

export async function youtubeFetchVideoCandidates(
  apiKey: string,
  videoIds: string[],
): Promise<YoutubeVideoCandidate[]> {
  if (videoIds.length === 0) return [];

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const text = await response.text();
    throw new YoutubeApiError(`YouTube videos.list failed: ${response.status} ${text.slice(0, 200)}`, response.status);
  }

  const body = (await response.json()) as {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        channelId?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: Record<string, { url?: string }>;
        tags?: string[];
      };
      statistics?: { viewCount?: string };
    }>;
  };

  const out: YoutubeVideoCandidate[] = [];
  for (const item of body.items ?? []) {
    const videoId = item.id;
    if (!videoId) continue;
    const title = item.snippet?.title?.trim() ?? '';
    const channelId = item.snippet?.channelId?.trim() ?? '';
    const channelTitle = item.snippet?.channelTitle?.trim() ?? '';
    const thumbnailUrl = pickThumbnail(item.snippet?.thumbnails);
    if (!title || !channelId || !thumbnailUrl) continue;
    out.push({
      videoId,
      title,
      channelId,
      channelTitle,
      publishedAt: item.snippet?.publishedAt ?? null,
      thumbnailUrl,
      viewCount: Number(item.statistics?.viewCount ?? 0),
      tags: item.snippet?.tags ?? [],
    });
  }
  return out;
}

export function estimateRefreshQuotaUnits(): number {
  const searches = ALL_VIRAL_RECIPE_CATEGORIES.reduce(
    (sum, cat) => sum + CATEGORY_SEARCH_QUERIES[cat].length,
    0,
  );
  const videoListCalls = searches;
  return searches * 100 + videoListCalls;
}

export async function collectCategoryCandidates(
  apiKey: string,
  category: ViralRecipesCategory,
  options: YoutubeSearchOptions = {},
): Promise<YoutubeVideoCandidate[]> {
  const queries = CATEGORY_SEARCH_QUERIES[category];
  const seen = new Set<string>();
  const merged: YoutubeVideoCandidate[] = [];

  for (const query of queries) {
    const ids = await youtubeSearchVideoIds(apiKey, query, options);
    const uniqueIds = ids.filter((id) => !seen.has(id));
    uniqueIds.forEach((id) => seen.add(id));
    if (uniqueIds.length === 0) continue;
    const batch = await youtubeFetchVideoCandidates(apiKey, uniqueIds);
    for (const candidate of batch) {
      if (!passesRecipeRelevanceFilter(candidate.title, candidate.tags)) continue;
      merged.push(candidate);
    }
  }

  const byId = new Map<string, YoutubeVideoCandidate>();
  for (const row of merged) {
    const prev = byId.get(row.videoId);
    if (!prev || row.viewCount > prev.viewCount) byId.set(row.videoId, row);
  }

  return [...byId.values()].sort((a, b) => b.viewCount - a.viewCount);
}
