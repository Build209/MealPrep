import { useMemo, useState } from 'react';

/**
 * Keeps a list that is still loading from jumping around under the reader.
 *
 * Found in live testing on 2026-10-10: the recipe grid re-sorted itself every half second for
 * about 15 seconds while pantry matches came in, putting new recipes above the ones being read.
 * With this, a recipe keeps the place where it first appeared and anything new goes underneath.
 */
export function stableOrderIds(previous: readonly string[], incoming: readonly string[]): string[] {
  const incomingSet = new Set(incoming);
  const kept = previous.filter((id) => incomingSet.has(id));
  const keptSet = new Set(kept);
  const seen = new Set<string>();
  const added: string[] = [];
  for (const id of incoming) {
    if (keptSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    added.push(id);
  }
  return [...kept, ...added];
}

export function applyStableOrder<T>(rows: readonly T[], order: readonly string[], idOf: (row: T) => string): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(idOf(row), row);
  const out: T[] = [];
  for (const id of order) {
    const row = byId.get(id);
    if (row !== undefined) out.push(row);
  }
  return out;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * `rows` in a steady order: first come, first placed. A new `resetKey` (another category, a
 * refresh) starts over with the incoming order.
 */
export function useStableRowOrder<T>(rows: readonly T[], idOf: (row: T) => string, resetKey: string): T[] {
  const [memo, setMemo] = useState<{ key: string; ids: string[] }>({ key: resetKey, ids: [] });
  const previous = memo.key === resetKey ? memo.ids : [];
  const ids = stableOrderIds(previous, rows.map(idOf));
  if (memo.key !== resetKey || !sameIds(memo.ids, ids)) {
    // Remembered for the next render (adjusted during render, not in an effect).
    setMemo({ key: resetKey, ids });
  }
  const orderKey = ids.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `orderKey` stands for `ids`; `idOf` is a plain reader
  return useMemo(() => applyStableOrder(rows, ids, idOf), [rows, orderKey]);
}
