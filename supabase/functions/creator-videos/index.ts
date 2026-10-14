// Creator recipe videos — cached YouTube metadata for trusted channels (no search.list).
//
// Deploy: supabase functions deploy creator-videos --no-verify-jwt
// Secrets: YOUTUBE_API_KEY, CREATOR_ADMIN_SECRET (refresh + upsert by handle)
// JWT verification off — the app sends the Supabase publishable (anon) key, not a user JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { applyHideOverrides, loadCreatorVideoOverrides } from './creatorVideoOverrides.ts';
import { loadChannelIdsWithVisibleFeedVideos } from './creatorListVisibility.ts';
import { buildChannelFitWeightMap, mixCreatorFeed } from './feedMix.ts';
import { compareCreatorsByFitAndSubscribers } from './fitOrder.ts';
import {
  isLowQualityFeedVideo,
  matchesBudgetFeed,
  matchesQuickFeed,
} from './recipeVideoFilter.ts';
import { refreshAndPersistCreator } from './refreshPersist.ts';
import {
  upsertCreatorByHandle,
  YOUTUBE_UNITS_CHANNELS_FOR_HANDLE,
} from './youtubeRefresh.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-creator-admin-secret',
  'Access-Control-Max-Age': '86400',
};

const ADMIN_SECRET_HEADER = 'x-creator-admin-secret';

type FeedMode = 'popular' | 'new' | 'quick' | 'budget';

type PublicAction =
  | { action: 'creators' }
  | { action: 'creator'; channelId?: string; handle?: string }
  | { action: 'feed'; mode?: FeedMode }
  | { action: 'search'; q?: string };

type RefreshBody = {
  action: 'refresh';
  handle?: string;
  channelId?: string;
  youtubeChannelId?: string;
};

interface CreatorDto {
  id: string;
  youtubeChannelId: string;
  displayName: string;
  handle: string | null;
  channelUrl: string;
  avatarUrl: string | null;
  subscriberCount: number;
  totalChannelViews: number;
  rank: number | null;
  fit: string;
  source: string | null;
}

interface VideoDto {
  videoId: string;
  channelId: string;
  creatorName: string;
  creatorHandle: string | null;
  creatorAvatarUrl: string | null;
  channelUrl: string;
  title: string;
  descriptionSnippet: string | null;
  thumbnailUrl: string;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  durationSeconds: number | null;
  isShort: boolean;
  watchUrl: string;
}

interface CreatorRow {
  id: string;
  youtube_channel_id: string;
  display_name: string;
  handle: string | null;
  channel_url: string;
  avatar_url: string | null;
  subscriber_count: number;
  total_views: number;
  avg_views: number;
  rank: number | null;
  fit: string | null;
  source: string | null;
}

interface VideoRow {
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
}

function creatorToDto(row: CreatorRow): CreatorDto {
  return {
    id: row.id,
    youtubeChannelId: row.youtube_channel_id,
    displayName: row.display_name,
    handle: row.handle,
    channelUrl: row.channel_url,
    avatarUrl: row.avatar_url,
    subscriberCount: row.subscriber_count,
    totalChannelViews: row.total_views ?? 0,
    rank: row.rank,
    fit: row.fit ?? 'Medium',
    source: row.source,
  };
}

function videoToDto(row: VideoRow, creator: CreatorRow | undefined): VideoDto {
  return {
    videoId: row.video_id,
    channelId: row.channel_id,
    creatorName: creator?.display_name ?? 'Creator',
    creatorHandle: creator?.handle ?? null,
    creatorAvatarUrl: creator?.avatar_url ?? null,
    channelUrl: creator?.channel_url ?? `https://www.youtube.com/channel/${row.channel_id}`,
    title: row.title,
    descriptionSnippet: row.description_snippet,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    viewCount: row.view_count,
    likeCount: row.like_count,
    durationSeconds: row.duration_seconds,
    isShort: row.is_short,
    watchUrl: row.url,
  };
}

function authorizeRefresh(req: Request): boolean {
  const expected = (Deno.env.get('CREATOR_ADMIN_SECRET') ?? '').trim();
  const provided = (req.headers.get(ADMIN_SECRET_HEADER) ?? '').trim();
  return Boolean(expected && provided && provided === expected);
}

/**
 * Rate-limit bucket key. Uses the caller's network address only.
 *
 * This function runs with JWT verification off, so anything in the Authorization
 * header is unverified: keying on its `sub` claim let a caller mint a fresh bucket
 * per request by sending a made-up token. Prefer the edge-set client IP headers over
 * `x-forwarded-for`, whose first entry can be supplied by the caller.
 */
function rateLimitKey(req: Request): string {
  const direct =
    req.headers.get('cf-connecting-ip')?.trim() || req.headers.get('x-real-ip')?.trim();
  if (direct) return direct;
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'anon';
}

const clientHits = new Map<string, { count: number; windowStart: number }>();
const CLIENT_WINDOW_MS = 60_000;
const CLIENT_MAX_PER_WINDOW = 60;
const SEARCH_MAX_PER_WINDOW = 20;
/** Longest search text sent to the database; longer input is cut, not rejected. */
const SEARCH_QUERY_MAX_LENGTH = 80;

function checkClientRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const bucket = clientHits.get(key);
  if (!bucket || now - bucket.windowStart > CLIENT_WINDOW_MS) {
    clientHits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

function parseFeedMode(input: unknown): FeedMode {
  if (input === 'new' || input === 'quick' || input === 'budget' || input === 'popular') {
    return input;
  }
  return 'popular';
}

async function loadCreatorsMap(
  admin: ReturnType<typeof createClient>,
): Promise<Map<string, CreatorRow>> {
  const { data, error } = await admin
    .from('recipe_creators')
    .select(
      'id, youtube_channel_id, display_name, handle, channel_url, avatar_url, subscriber_count, total_views, avg_views, rank, fit, source',
    )
    .eq('enabled', true);
  if (error) throw error;
  const sorted = [...((data ?? []) as CreatorRow[])].sort(compareCreatorsByFitAndSubscribers);
  const map = new Map<string, CreatorRow>();
  for (const row of sorted) {
    map.set(row.youtube_channel_id, row);
  }
  return map;
}

async function queryFeedVideoRows(
  admin: ReturnType<typeof createClient>,
  mode: FeedMode,
): Promise<VideoRow[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let query = admin
    .from('creator_videos')
    .select(
      'video_id, channel_id, title, description_snippet, thumbnail_url, published_at, view_count, like_count, duration_seconds, is_short, url',
    )
    .limit(400);

  if (mode === 'popular') {
    query = query.gte('published_at', ninetyDaysAgo);
  } else if (mode === 'new') {
    query = query.order('published_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('published_at', { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as VideoRow[];
}

function processFeedVideoRows(
  rawRows: VideoRow[],
  mode: FeedMode,
  channelFitWeight: Map<string, number>,
  creatorsMap: Map<string, CreatorRow>,
  hideOverrides: ReadonlyMap<string, 'hide' | 'show'>,
): VideoRow[] {
  let rows = applyHideOverrides(rawRows, hideOverrides);

  if (mode === 'popular') {
    rows = rows.filter(
      (row) =>
        !isLowQualityFeedVideo(row.title, row.description_snippet ?? '', {
          isShort: row.is_short,
        }),
    );
    const relativeViewScore = (row: VideoRow): number => {
      const channelAvg = creatorsMap.get(row.channel_id)?.avg_views ?? 0;
      const baseline = channelAvg > 0 ? channelAvg : Math.max(row.view_count, 1);
      return row.view_count / baseline;
    };
    rows = mixCreatorFeed(rows, {
      channelFitWeight: channelFitWeight,
      viewScore: (row) => Math.round(relativeViewScore(row) * 1_000_000),
    });
    return rows.slice(0, 60);
  }

  if (mode === 'quick') {
    rows = rows.filter((row) =>
      matchesQuickFeed(
        row.title,
        row.description_snippet ?? '',
        row.duration_seconds,
        row.is_short,
      ),
    );
    rows.sort((a, b) => (a.duration_seconds ?? 9999) - (b.duration_seconds ?? 9999));
  } else if (mode === 'budget') {
    rows = rows.filter((row) =>
      matchesBudgetFeed(row.title, row.description_snippet ?? ''),
    );
    rows.sort((a, b) => b.view_count - a.view_count);
  }

  return mixCreatorFeed(rows, { channelFitWeight: channelFitWeight }).slice(0, 60);
}

async function handlePublicAction(
  admin: ReturnType<typeof createClient>,
  body: PublicAction,
  limitKey: string,
): Promise<Response> {
  const creatorsMapPromise = loadCreatorsMap(admin);
  const hideOverridesPromise = loadCreatorVideoOverrides(admin);

  if (body.action === 'creators') {
    const channelsPromise = hideOverridesPromise.then((hideOverrides) =>
      loadChannelIdsWithVisibleFeedVideos(admin, hideOverrides),
    );
    const [creatorsMap, channelsWithVideos] = await Promise.all([
      creatorsMapPromise,
      channelsPromise,
    ]);
    const creators = [...creatorsMap.values()]
      .filter((row) => channelsWithVideos.has(row.youtube_channel_id))
      .sort(compareCreatorsByFitAndSubscribers)
      .map(creatorToDto);
    return jsonResponse({ creators });
  }

  if (body.action === 'creator') {
    const [creatorsMap, hideOverrides] = await Promise.all([
      creatorsMapPromise,
      hideOverridesPromise,
    ]);
    const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
    const channelId =
      typeof body.channelId === 'string' && body.channelId.trim()
        ? body.channelId.trim()
        : '';
    let creator: CreatorRow | undefined;
    if (channelId) creator = creatorsMap.get(channelId);
    if (!creator && handle) {
      const normalized = handle.toLowerCase();
      creator = [...creatorsMap.values()].find(
        (row) => row.handle?.toLowerCase() === normalized || row.handle?.toLowerCase() === `@${normalized.replace(/^@/, '')}`,
      );
    }
    if (!creator) {
      return jsonResponse({ creator: null, videos: [] });
    }
    const { data, error } = await admin
      .from('creator_videos')
      .select(
        'video_id, channel_id, title, description_snippet, thumbnail_url, published_at, view_count, like_count, duration_seconds, is_short, url',
      )
      .eq('channel_id', creator.youtube_channel_id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(80);
    if (error) throw error;
    const videos = applyHideOverrides((data ?? []) as VideoRow[], hideOverrides).map((row) =>
      videoToDto(row, creator),
    );
    return jsonResponse({ creator: creatorToDto(creator), videos });
  }

  if (body.action === 'feed') {
    const mode = parseFeedMode(body.mode);
    const feedRowsPromise = queryFeedVideoRows(admin, mode);
    const [creatorsMap, hideOverrides, rawRows] = await Promise.all([
      creatorsMapPromise,
      hideOverridesPromise,
      feedRowsPromise,
    ]);
    const fitWeights = buildChannelFitWeightMap(creatorsMap.values());
    const rows = processFeedVideoRows(rawRows, mode, fitWeights, creatorsMap, hideOverrides);
    const videos = rows.map((row) => videoToDto(row, creatorsMap.get(row.channel_id)));
    return jsonResponse({ mode, videos });
  }

  if (body.action === 'search') {
    const q =
      typeof body.q === 'string' ? body.q.trim().slice(0, SEARCH_QUERY_MAX_LENGTH).trim() : '';
    if (q.length < 2) {
      return jsonResponse({ videos: [] });
    }
    if (!checkClientRateLimit(`${limitKey}:search`, SEARCH_MAX_PER_WINDOW)) {
      return jsonResponse(
        { error: 'Too many searches. Try again in a minute.', code: 'RATE_LIMIT' },
        429,
      );
    }
    const [creatorsMap, hideOverrides] = await Promise.all([
      creatorsMapPromise,
      hideOverridesPromise,
    ]);
    const { data, error } = await admin.rpc('search_creator_videos', { p_query: q, p_limit: 40 });
    if (error) throw error;
    const rows = applyHideOverrides((data ?? []) as VideoRow[], hideOverrides);
    const videos = rows.map((row) => videoToDto(row, creatorsMap.get(row.channel_id)));
    return jsonResponse({ videos, q });
  }

  return jsonResponse({ error: 'Unknown action', code: 'BAD_REQUEST' }, 400);
}

async function refreshAllEnabledCreators(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
): Promise<{
  refreshedCreators: number;
  refreshedVideos: number;
  youtubeUnitsEstimate: number;
  creators: Array<{
    channelId: string;
    displayName: string;
    ok: boolean;
    error?: string;
    videosUpserted: number;
  }>;
}> {
  const { data: creators, error } = await admin
    .from('recipe_creators')
    .select('youtube_channel_id, display_name, enabled')
    .eq('enabled', true);
  if (error) throw error;

  const results: Array<{
    channelId: string;
    displayName: string;
    ok: boolean;
    error?: string;
    videosUpserted: number;
  }> = [];
  let videoCount = 0;
  let youtubeUnitsEstimate = 0;

  const videoOverrides = await loadCreatorVideoOverrides(admin);

  for (const row of creators ?? []) {
    const channelId = (row as { youtube_channel_id: string }).youtube_channel_id;
    const seedName = (row as { display_name?: string }).display_name ?? channelId;
    const outcome = await refreshAndPersistCreator(admin, apiKey, channelId, {
      videoOverrides,
    });
    youtubeUnitsEstimate += outcome.youtubeUnits;
    videoCount += outcome.videosUpserted;
    results.push({
      channelId: outcome.channelId,
      displayName: outcome.displayName || seedName,
      ok: outcome.ok,
      error: outcome.error,
      videosUpserted: outcome.videosUpserted,
    });
  }

  return {
    refreshedCreators: creators?.length ?? 0,
    refreshedVideos: videoCount,
    youtubeUnitsEstimate,
    creators: results,
  };
}

async function refreshSingleCreator(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  options: { handle?: string; channelId?: string },
): Promise<{
  channelId: string;
  displayName: string;
  ok: boolean;
  error?: string;
  videosUpserted: number;
  youtubeUnitsEstimate: number;
} | null> {
  let channelId = options.channelId?.trim() ?? '';
  let creatorPatch: Record<string, unknown> | null = null;
  let youtubeUnitsEstimate = 0;

  const isNewByHandle = Boolean(!channelId && options.handle?.trim());

  if (isNewByHandle) {
    const resolved = await upsertCreatorByHandle(apiKey, options.handle!);
    youtubeUnitsEstimate += YOUTUBE_UNITS_CHANNELS_FOR_HANDLE;
    if (!resolved) return null;
    channelId = resolved.channelId;
    creatorPatch = {
      ...resolved.creator,
      fit: 'Medium',
      source: 'david_pick',
      updated_at: new Date().toISOString(),
    };
  }

  if (!channelId) return null;

  const videoOverrides = await loadCreatorVideoOverrides(admin);
  const outcome = await refreshAndPersistCreator(admin, apiKey, channelId, {
    creatorPatchOnInsert: isNewByHandle ? creatorPatch ?? undefined : undefined,
    videoOverrides,
  });
  youtubeUnitsEstimate += outcome.youtubeUnits;

  return {
    channelId: outcome.channelId,
    displayName: outcome.displayName,
    ok: outcome.ok,
    error: outcome.error,
    videosUpserted: outcome.videosUpserted,
    youtubeUnitsEstimate,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Server configuration incomplete.', code: 'NOT_CONFIGURED' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const limitKey = rateLimitKey(req);
  if (!checkClientRateLimit(limitKey, CLIENT_MAX_PER_WINDOW)) {
    return jsonResponse(
      { error: 'Too many requests. Try again in a minute.', code: 'RATE_LIMIT' },
      429,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const action = body.action;

  if (action === 'refresh') {
    if (!authorizeRefresh(req)) {
      return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    const apiKey = Deno.env.get('YOUTUBE_API_KEY') ?? '';
    if (!apiKey.trim()) {
      return jsonResponse({ error: 'YOUTUBE_API_KEY not configured', code: 'NOT_CONFIGURED' }, 503);
    }

    const refreshBody = body as RefreshBody;
    const handle = typeof refreshBody.handle === 'string' ? refreshBody.handle : undefined;
    const channelId =
      typeof refreshBody.channelId === 'string'
        ? refreshBody.channelId
        : typeof refreshBody.youtubeChannelId === 'string'
          ? refreshBody.youtubeChannelId
          : undefined;

    try {
      if (handle?.trim() || channelId?.trim()) {
        const result = await refreshSingleCreator(admin, apiKey, { handle, channelId });
        if (!result) {
          return jsonResponse({ error: 'Could not resolve creator', code: 'NOT_FOUND' }, 404);
        }
        if (!result.ok) {
          return jsonResponse(
            { ok: false, ...result, code: 'UPSTREAM_ERROR' },
            502,
          );
        }
        return jsonResponse({ ok: true, ...result });
      }

      const summary = await refreshAllEnabledCreators(admin, apiKey);
      const failed = summary.creators.filter((row) => !row.ok).length;
      return jsonResponse({
        ok: failed === 0,
        ...summary,
        failedCreators: failed,
      });
    } catch (err) {
      console.error('creator-videos refresh failed', err);
      return jsonResponse({ error: 'Refresh failed', code: 'UPSTREAM_ERROR' }, 502);
    }
  }

  try {
    return await handlePublicAction(admin, body as PublicAction, limitKey);
  } catch (err) {
    console.error('creator-videos error', err);
    return jsonResponse({ error: 'Could not load creator recipes right now.', code: 'UPSTREAM_ERROR' }, 502);
  }
});
