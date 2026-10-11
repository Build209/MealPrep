import { useCallback, useEffect, useState } from 'react';
import { usageMonth } from '../config/planTiers';
import { freeScansRemaining } from '../lib/pantry/freeScanAllowance';
import { getSupabase } from '../lib/supabase';

/**
 * How many of this month's free scans a signed-in free account has left.
 * Reads the account's own row for the month in `photo_scan_usage` (row-level security allows only that).
 * Returns 0 while loading or if the count cannot be read, so nothing is promised that the
 * server would refuse.
 */
export function useFreeScanAllowance(input: { userId: string | null; enabled: boolean }): {
  remaining: number;
  /** Set the used count from a scan response, without another read. */
  setUsed: (used: number) => void;
  refresh: () => void;
} {
  const { userId, enabled } = input;
  const [used, setUsedState] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !userId) {
      setUsedState(null);
      return;
    }
    const client = getSupabase();
    if (!client) {
      setUsedState(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await client
          .from('photo_scan_usage')
          .select('scans')
          .eq('user_id', userId)
          .eq('period', usageMonth())
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setUsedState(null);
          return;
        }
        const scans = (data as { scans?: number } | null)?.scans;
        setUsedState(typeof scans === 'number' ? scans : 0);
      } catch {
        if (!cancelled) setUsedState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce, userId]);

  const setUsed = useCallback((value: number) => setUsedState(value), []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { remaining: enabled ? freeScansRemaining(used) : 0, setUsed, refresh };
}
