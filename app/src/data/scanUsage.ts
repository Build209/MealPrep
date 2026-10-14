import { useQuery } from '@tanstack/react-query';
import { allowanceFor, currentUsagePeriod, scanTierFor, type Allowance } from '../scan/allowance';
import { retryUnlessPermanent, toDataError } from './errors';
import { SIGNED_OUT } from './keys';
import { useProfile } from './profile';
import { requireClient, requireUserId, useSessionUserId } from './session';

/**
 * This month's photo scans used, from the person's own photo_scan_usage row (row level security
 * allows reading only that; only the pantry-vision function writes it). No row yet means 0.
 */
export async function fetchScansUsed(userId: string | null | undefined, period: string): Promise<number> {
  const client = requireClient();
  const id = requireUserId(userId);
  let response: { data: unknown; error: unknown };
  try {
    response = await client.from('photo_scan_usage').select('scans').eq('user_id', id).eq('period', period).maybeSingle();
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  const scans = (response.data as { scans?: unknown } | null)?.scans;
  return typeof scans === 'number' && Number.isFinite(scans) ? scans : 0;
}

/** Key for the usage read. Kept here (not keys.ts) until the parallel pantry work merges; same shape rules. */
export const scanUsageKey = (userId: string | null | undefined, period: string) =>
  ['scan-usage', userId ? userId : SIGNED_OUT, period] as const;
export const scanUsageAllKey = ['scan-usage'] as const;

/**
 * What the Scan button says: this month's allowance from the plan (profiles) and the usage row.
 * 'unknown' while loading or when either read fails, so the button never promises a scan the
 * server would refuse.
 */
export function useScanAllowance(): Allowance {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const profile = useProfile();
  const period = currentUsagePeriod();
  const usage = useQuery({
    queryKey: scanUsageKey(userId, period),
    queryFn: () => fetchScansUsed(userId, period),
    enabled: !session.isPending && userId !== null,
    retry: retryUnlessPermanent,
  });
  const tier = profile.data ? scanTierFor(profile.data) : null;
  return allowanceFor(tier, usage.data ?? null);
}
