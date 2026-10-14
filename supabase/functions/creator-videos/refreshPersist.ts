import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import type { CreatorVideoOverrideAction } from './creatorVideoOverrides.ts';
import {
  estimateRefreshUnitsForCreator,
  estimateVideoListChunks,
  fetchChannelBundle,
  refreshCreatorVideos,
  type CreatorRowInput,
} from './youtubeRefresh.ts';

export interface CreatorRefreshResult {
  channelId: string;
  displayName: string;
  ok: boolean;
  error?: string;
  videosUpserted: number;
  youtubeUnits: number;
}

async function pruneCreatorVideos(
  admin: SupabaseClient,
  channelId: string,
  keptVideoIds: readonly string[],
): Promise<void> {
  if (keptVideoIds.length === 0) {
    const { error } = await admin.from('creator_videos').delete().eq('channel_id', channelId);
    if (error) throw error;
    return;
  }

  const inList = `(${keptVideoIds.map((id) => `"${id.replaceAll('"', '')}"`).join(',')})`;
  const { error } = await admin
    .from('creator_videos')
    .delete()
    .eq('channel_id', channelId)
    .not('video_id', 'in', inList);
  if (error) throw error;
}

export async function refreshAndPersistCreator(
  admin: SupabaseClient,
  apiKey: string,
  channelId: string,
  options?: {
    creatorPatchOnInsert?: Record<string, unknown>;
    videoOverrides?: ReadonlyMap<string, CreatorVideoOverrideAction>;
  },
): Promise<CreatorRefreshResult> {
  const displayNameFallback = channelId;
  let youtubeUnits = 1;

  try {
    const bundle = await fetchChannelBundle(apiKey, channelId);
    if (!bundle) {
      return {
        channelId,
        displayName: displayNameFallback,
        ok: false,
        error: 'Could not load channel from YouTube',
        videosUpserted: 0,
        youtubeUnits: 1,
      };
    }

    const { videos, avgViews, avgLikes } = await refreshCreatorVideos(
      apiKey,
      channelId,
      bundle.uploadsPlaylistId,
      options?.videoOverrides ?? new Map(),
    );
    youtubeUnits = estimateRefreshUnitsForCreator(
      1,
      estimateVideoListChunks(Math.max(videos.length, 1)),
    );

    const displayName = bundle.creator.display_name;

    if (options?.creatorPatchOnInsert) {
      const { error: insertError } = await admin.from('recipe_creators').upsert(
        {
          ...options.creatorPatchOnInsert,
          youtube_channel_id: channelId,
          avg_views: avgViews,
          avg_likes: avgLikes,
          enabled: true,
        },
        { onConflict: 'youtube_channel_id' },
      );
      if (insertError) throw insertError;
    } else {
      const { error: updateError } = await admin
        .from('recipe_creators')
        .update({
          display_name: bundle.creator.display_name,
          handle: bundle.creator.handle,
          channel_url: bundle.creator.channel_url,
          avatar_url: bundle.creator.avatar_url,
          subscriber_count: bundle.creator.subscriber_count,
          total_views: bundle.creator.total_views,
          avg_views: avgViews,
          avg_likes: avgLikes,
          updated_at: new Date().toISOString(),
        })
        .eq('youtube_channel_id', channelId);
      if (updateError) throw updateError;
    }

    const keptIds = videos.map((row) => row.video_id);
    if (videos.length > 0) {
      const { error: upsertVideosError } = await admin
        .from('creator_videos')
        .upsert(videos, { onConflict: 'video_id' });
      if (upsertVideosError) throw upsertVideosError;
    }

    await pruneCreatorVideos(admin, channelId, keptIds);

    return {
      channelId,
      displayName,
      ok: true,
      videosUpserted: videos.length,
      youtubeUnits,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('creator-videos refresh failed for channel', channelId, err);
    return {
      channelId,
      displayName: displayNameFallback,
      ok: false,
      error: message,
      videosUpserted: 0,
      youtubeUnits,
    };
  }
}

export type { CreatorRowInput };
