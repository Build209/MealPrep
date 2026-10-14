/** Sort / weight tier from seed `fit` strings (e.g. "Medium/High", "Low/Medium"). */

export function creatorFitSortRank(fit: string | null | undefined): number {
  const normalized = (fit ?? '').toLowerCase();
  if (normalized.includes('high')) return 1;
  if (normalized.includes('medium')) return 2;
  return 3;
}

export function creatorFitMixWeight(fit: string | null | undefined): number {
  const rank = creatorFitSortRank(fit);
  if (rank === 1) return 3;
  if (rank === 2) return 2;
  return 1;
}

export function compareCreatorsByFitAndSubscribers(
  a: { fit?: string | null; subscriber_count: number },
  b: { fit?: string | null; subscriber_count: number },
): number {
  const fitDiff = creatorFitSortRank(a.fit) - creatorFitSortRank(b.fit);
  if (fitDiff !== 0) return fitDiff;
  return b.subscriber_count - a.subscriber_count;
}
