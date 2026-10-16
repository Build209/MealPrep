import { colors, type ColorName } from '../theme/tokens';

/**
 * What a store circle shows when there is no cleared logo (storeLogos.ts): the chain's initials
 * on a colour picked from the theme by the chain's name, so the same chain always gets the same
 * colour. Pure and tested (tests/stores-row.test.ts checks every pair's contrast).
 *
 * Only theme colours (DESIGN.md: no new colours in components). Tomato is left out (camera or
 * money only), and so are danger (problems only) and warning yellow (favourites and time).
 */
export const BADGE_COLORS: ReadonlyArray<{ bg: ColorName; fg: ColorName }> = [
  { bg: 'primary', fg: 'onPrimary' },
  { bg: 'success', fg: 'onSuccess' },
  { bg: 'banana', fg: 'onBanana' },
  { bg: 'successLight', fg: 'ink' },
  { bg: 'sand', fg: 'ink' },
];

/** Lower case, letters and digits only: "Trader Joe's" and "trader joes" are one chain. */
export function normalizeChainKey(chain: string): string {
  return chain
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SKIP_WORDS = new Set(['the', 'and', 'of']);

/** "Trader Joe's" -> "TJ", "Grocery Outlet" -> "GO", "Safeway" -> "S", "" -> "?". */
export function storeInitials(chain: string): string {
  const words = normalizeChainKey(chain)
    .split(' ')
    .filter((w) => w && !SKIP_WORDS.has(w));
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** FNV-1a: a small, stable string hash (same answer on every device and every run). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function badgeColorsFor(chain: string): { bg: string; fg: ColorName } {
  const pick = BADGE_COLORS[hash(normalizeChainKey(chain)) % BADGE_COLORS.length]!;
  return { bg: colors[pick.bg], fg: pick.fg };
}
