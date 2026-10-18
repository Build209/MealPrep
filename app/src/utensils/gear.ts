/**
 * Kitchen gear matching. Pure; tests/utensils-gear.test.ts.
 *
 * The rules (Utensils handoff 2026-10-17, owner decisions 2026-10-18):
 * - Nobody who skipped the picker (equipmentSetAt null) is ever filtered or re-ordered.
 * - A recipe nobody has tagged yet is "unknown": no sticker, no demotion.
 * - Gear is matched by swap rules, not just by name: an air fryer can stand in for an oven.
 *   Only "good" and "ok" swaps count; a "poor" swap is treated as missing rather than promised.
 * - Soft sort: recipes that need gear the person lacks move below the rest, in their own order.
 *   The "only what I can make" toggle hides them instead.
 */

export type GearCategory = 'heat' | 'pots_pans' | 'tools' | 'eating';
export const GEAR_CATEGORIES: readonly GearCategory[] = ['heat', 'pots_pans', 'tools', 'eating'];

/** public.equipment, the columns the app reads. */
export type GearItem = { slug: string; name: string; category: GearCategory; sortOrder: number };
/** public.equipment_swaps: `canUse` can stand in for `needs`. */
export type GearSwap = { needs: string; canUse: string; quality: 'good' | 'ok' | 'poor'; note: string | null };

export type GearRow = { slug?: unknown; name?: unknown; category?: unknown; sort_order?: unknown };
export type SwapRow = { needs?: unknown; can_use?: unknown; quality?: unknown; note?: unknown };

export function gearFromRows(rows: readonly GearRow[] | null | undefined): GearItem[] {
  const out: GearItem[] = [];
  for (const r of rows ?? []) {
    if (typeof r.slug !== 'string' || typeof r.name !== 'string') continue;
    if (!GEAR_CATEGORIES.includes(r.category as GearCategory)) continue;
    out.push({ slug: r.slug, name: r.name, category: r.category as GearCategory, sortOrder: typeof r.sort_order === 'number' ? r.sort_order : 0 });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function swapsFromRows(rows: readonly SwapRow[] | null | undefined): GearSwap[] {
  const out: GearSwap[] = [];
  for (const r of rows ?? []) {
    if (typeof r.needs !== 'string' || typeof r.can_use !== 'string') continue;
    if (r.quality !== 'good' && r.quality !== 'ok' && r.quality !== 'poor') continue;
    out.push({ needs: r.needs, canUse: r.can_use, quality: r.quality, note: typeof r.note === 'string' ? r.note : null });
  }
  return out;
}

export function groupByCategory(items: readonly GearItem[]): { category: GearCategory; items: GearItem[] }[] {
  return GEAR_CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter((g) => g.items.length > 0);
}

/** Slugs for a list of picks: only known gear, no repeats. */
export function cleanPicks(picks: Iterable<string>, catalog: readonly GearItem[]): string[] {
  const known = new Set(catalog.map((i) => i.slug));
  return [...new Set(picks)].filter((s) => known.has(s));
}

export type GearStatus =
  | { kind: 'unknown' }
  | { kind: 'ready' }
  | { kind: 'works'; via: { needs: string; canUse: string }[] }
  | { kind: 'needs'; missing: string[] };

export type TaggedRecipe = { equipmentRequired?: readonly string[] | null; equipmentTaggedAt?: string | null };

/**
 * How one recipe fits the person's gear. `owned` null means the person never answered the picker.
 * An empty tag list with no tagged date means untagged (unknown), not "needs nothing".
 */
export function gearStatus(recipe: TaggedRecipe, owned: ReadonlySet<string> | null, swaps: readonly GearSwap[]): GearStatus {
  if (owned === null) return { kind: 'unknown' };
  const required = recipe.equipmentRequired ?? [];
  if (required.length === 0) return recipe.equipmentTaggedAt ? { kind: 'ready' } : { kind: 'unknown' };
  const via: { needs: string; canUse: string }[] = [];
  const missing: string[] = [];
  for (const need of required) {
    if (owned.has(need)) continue;
    const swap = swaps
      .filter((s) => s.needs === need && s.quality !== 'poor' && owned.has(s.canUse))
      .sort((a, b) => (a.quality === b.quality ? 0 : a.quality === 'good' ? -1 : 1))[0];
    if (swap) via.push({ needs: need, canUse: swap.canUse });
    else missing.push(need);
  }
  if (missing.length > 0) return { kind: 'needs', missing };
  return via.length > 0 ? { kind: 'works', via } : { kind: 'ready' };
}

/**
 * Soft sort (or filter, with `onlyMakeable`). Stable: recipes keep the order they came in, those that
 * need missing gear go after the rest. With `owned` null the same array contents come back untouched.
 */
export function sortByGear<T extends TaggedRecipe>(
  recipes: readonly T[],
  owned: ReadonlySet<string> | null,
  swaps: readonly GearSwap[],
  options?: { onlyMakeable?: boolean },
): T[] {
  if (owned === null) return [...recipes];
  const fits: T[] = [];
  const lacks: T[] = [];
  for (const r of recipes) (gearStatus(r, owned, swaps).kind === 'needs' ? lacks : fits).push(r);
  return options?.onlyMakeable ? fits : [...fits, ...lacks];
}

export type ShelfKey = 'heat' | 'pots_pans' | 'tools';
/** The picker's three shelves, one step each. "Tools & table" joins the tools and eating categories. */
export function shelves(items: readonly GearItem[]): { key: ShelfKey; items: GearItem[] }[] {
  const defs: { key: ShelfKey; cats: GearCategory[] }[] = [
    { key: 'heat', cats: ['heat'] },
    { key: 'pots_pans', cats: ['pots_pans'] },
    { key: 'tools', cats: ['tools', 'eating'] },
  ];
  return defs.map((d) => ({ key: d.key, items: items.filter((i) => d.cats.includes(i.category)) })).filter((s) => s.items.length > 0);
}
