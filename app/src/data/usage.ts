import { useQuery } from '@tanstack/react-query';
import { cleanCount, type UsageCounts } from '../plans/usage';
import { currentUsagePeriod } from '../scan/allowance';
import { retryUnlessPermanent, toDataError } from './errors';
import { SIGNED_OUT } from './keys';
import { requireClient, requireUserId, useSessionUserId } from './session';

type Table = 'photo_scan_usage' | 'recipe_import_usage' | 'forky_chat_usage';

/** One count from the person's own usage row for the month. No row yet means 0. */
async function readCount(table: Table, column: string, userId: string, period: string): Promise<number> {
  const client = requireClient();
  let response: { data: unknown; error: unknown };
  try {
    response = await client.from(table).select(column).eq('user_id', userId).eq('period', period).maybeSingle();
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  return cleanCount((response.data as Record<string, unknown> | null)?.[column]);
}

/**
 * This month's scans, recipe imports and Ask Forky messages. Row level security lets a person read
 * only their own rows (…_select_own policies); only the live functions write them.
 */
export async function fetchMonthUsage(userId: string | null | undefined, period: string): Promise<UsageCounts> {
  const id = requireUserId(userId);
  const [scans, imports, forky] = await Promise.all([
    readCount('photo_scan_usage', 'scans', id, period),
    readCount('recipe_import_usage', 'imports', id, period),
    readCount('forky_chat_usage', 'messages', id, period),
  ]);
  return { scans, imports, forky };
}

export const monthUsageKey = (userId: string | null | undefined, period: string) =>
  ['usage', userId ? userId : SIGNED_OUT, period] as const;

export function useMonthUsage() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const period = currentUsagePeriod();
  return useQuery({
    queryKey: monthUsageKey(userId, period),
    queryFn: () => fetchMonthUsage(userId, period),
    enabled: !session.isPending && userId !== null,
    retry: retryUnlessPermanent,
  });
}
