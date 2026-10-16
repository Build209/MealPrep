/**
 * Calls the live usda-proxy edge function (unchanged; Verify JWT on) through supabase-js.
 * At most MAX_CONCURRENT searches run at once across the whole app, each with a short timeout.
 * Returns null when USDA has no usable match; throws on network or service errors.
 */
import { getSupabase } from '../lib/supabase';
import { pickBestFood, type Per100g } from './usdaParse';

export const MAX_CONCURRENT = 3;
export const REQUEST_TIMEOUT_MS = 8000;
const SEARCH_PAGE_SIZE = 5;

let running = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

export async function fetchPer100g(label: string): Promise<Per100g | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Nutrition lookup is not available.');
  return withSlot(async () => {
    const { data, error } = await supabase.functions.invoke('usda-proxy', {
      body: { action: 'search', query: { query: label, pageSize: SEARCH_PAGE_SIZE } },
      timeout: REQUEST_TIMEOUT_MS,
    });
    if (error) throw new Error('Nutrition lookup failed.');
    return pickBestFood(label, data)?.per100g ?? null;
  });
}
