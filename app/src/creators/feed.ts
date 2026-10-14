import { isLowQualityFeedVideo } from './videoFilter';

/**
 * Picking which creator videos to show. Pure: no network, so tests/creators-video-text.test.ts
 * can check it.
 */

/** The fields the feed rules look at. */
export type FeedVideo = {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  isShort: boolean;
};

/** Hide non-recipe uploads (hacks, reviews, challenges...), the same rule as the old popular feed. */
export function visibleInFeed(video: FeedVideo): boolean {
  return !isLowQualityFeedVideo(video.title, video.description, { isShort: video.isShort });
}

/** One copy per video id; the first one wins (the input is already in the order wanted). */
export function dedupeVideos<T extends FeedVideo>(videos: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const video of videos) {
    if (!video.videoId || seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    out.push(video);
  }
  return out;
}

/**
 * Takes one video from each channel in turn, so one busy channel can't fill the row. Channels go in
 * the order their first video appears; each channel's videos keep their order (newest first when the
 * input is newest first). Stops at `limit`.
 */
export function interleaveByChannel<T extends FeedVideo>(videos: readonly T[], limit: number): T[] {
  const byChannel = new Map<string, T[]>();
  for (const video of videos) {
    const list = byChannel.get(video.channelId);
    if (list) list.push(video);
    else byChannel.set(video.channelId, [video]);
  }
  const queues = [...byChannel.values()];
  const out: T[] = [];
  let round = 0;
  while (out.length < limit) {
    let took = false;
    for (const queue of queues) {
      const next = queue[round];
      if (!next) continue;
      out.push(next);
      took = true;
      if (out.length >= limit) break;
    }
    if (!took) break;
    round += 1;
  }
  return out;
}

/** The recent row: recipe videos only, one per id, channels taking turns, at most `limit`. */
export function pickRecentVideos<T extends FeedVideo>(newestFirst: readonly T[], limit: number): T[] {
  return interleaveByChannel(dedupeVideos(newestFirst.filter(visibleInFeed)), limit);
}
