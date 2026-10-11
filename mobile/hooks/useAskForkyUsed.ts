import { useEffect, useState } from 'react';
import { usageMonth } from '../config/planTiers';
import { getSupabase } from '../lib/supabase';

/**
 * How many Ask Forky questions the signed-in account has used this month, so the chat can say
 * "you are out of questions" when it opens and not only after a question is sent and refused.
 * Reads the account's own row for the month in `forky_chat_usage` (row-level security allows
 * only that). Returns `null` while loading or if the count cannot be read; the server is still
 * what enforces the limit.
 */
export function useAskForkyUsed(input: { userId: string | null; enabled: boolean }): number | null {
  const { userId, enabled } = input;
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setUsed(null);
      return;
    }
    const client = getSupabase();
    if (!client) {
      setUsed(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await client
          .from('forky_chat_usage')
          .select('messages')
          .eq('user_id', userId)
          .eq('period', usageMonth())
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setUsed(null);
          return;
        }
        const messages = (data as { messages?: number } | null)?.messages;
        setUsed(typeof messages === 'number' ? messages : 0);
      } catch {
        if (!cancelled) setUsed(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  return used;
}
