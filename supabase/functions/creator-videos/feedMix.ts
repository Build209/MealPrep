import { creatorFitMixWeight } from './fitOrder.ts';

export interface MixableVideo {
  video_id: string;
  channel_id: string;
  view_count: number;
  published_at: string | null;
}

const DEFAULT_TOP_WINDOW = 12;
const DEFAULT_MAX_PER_CREATOR = 2;

function channelWeight(
  channelId: string,
  weights: Map<string, number> | undefined,
): number {
  return weights?.get(channelId) ?? 1;
}

function pickScore<T extends MixableVideo>(
  row: T,
  weights: Map<string, number> | undefined,
  viewScore?: (row: T) => number,
): number {
  const fitBoost = channelWeight(row.channel_id, weights) * 1_000_000_000_000;
  const views = viewScore ? viewScore(row) : row.view_count;
  return fitBoost + views;
}

/**
 * Interleave videos so one channel cannot dominate; prefer High-fit creators in the mix.
 */
export function mixCreatorFeed<T extends MixableVideo>(
  rows: readonly T[],
  options?: {
    topWindow?: number;
    maxPerCreator?: number;
    channelFitWeight?: Map<string, number>;
    viewScore?: (row: T) => number;
  },
): T[] {
  const topWindow = options?.topWindow ?? DEFAULT_TOP_WINDOW;
  const maxPerCreator = options?.maxPerCreator ?? DEFAULT_MAX_PER_CREATOR;
  const weights = options?.channelFitWeight;
  const viewScore = options?.viewScore;
  if (rows.length <= 1) return [...rows];

  const pool = [...rows].sort(
    (a, b) => pickScore(b, weights, viewScore) - pickScore(a, weights, viewScore),
  );
  const head: T[] = [];
  const counts = new Map<string, number>();

  while (head.length < topWindow && pool.length > 0) {
    let pickIndex = -1;
    let pickScoreValue = -Infinity;

    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const channelId = candidate.channel_id;
      const count = counts.get(channelId) ?? 0;
      if (count >= maxPerCreator) continue;
      const score = pickScore(candidate, weights, viewScore);
      if (score > pickScoreValue) {
        pickScoreValue = score;
        pickIndex = i;
      }
    }

    if (pickIndex < 0) break;

    const [picked] = pool.splice(pickIndex, 1);
    counts.set(picked.channel_id, (counts.get(picked.channel_id) ?? 0) + 1);
    head.push(picked);
  }

  const tail = pool.sort(
    (a, b) => pickScore(b, weights, viewScore) - pickScore(a, weights, viewScore),
  );
  return [...head, ...tail];
}

export function buildChannelFitWeightMap(
  creators: Iterable<{ youtube_channel_id: string; fit?: string | null }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const creator of creators) {
    map.set(creator.youtube_channel_id, creatorFitMixWeight(creator.fit));
  }
  return map;
}
