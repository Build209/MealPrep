import type { ImageSourcePropType } from 'react-native';
import { normalizeChainKey } from './storeBadge';

/**
 * THE ONE PLACE FOR REAL STORE LOGOS.
 *
 * Owner decision, 2026-10-16: use the chains' real logos in the store circles, to identify the
 * store only (nominative use; no endorsement or "partner" implied). Compliance to confirm before
 * any marketing use. Trademarks stay with their owners.
 *
 * Rules for adding one (docs/STORE_LOGOS.md has the full list and the sources):
 *  - Source: a Wikimedia Commons file whose copyright status is clear (public domain, e.g.
 *    {{PD-textlogo}} / below the threshold of originality, or a free licence). Never Google Images,
 *    brand-asset portals with restrictive terms, or anything without a clear status.
 *  - File: app/assets/stores/<chain-slug>.png, square (about 192x192), transparent or white
 *    background, padded so it fits inside a circle and reads at 56-80px.
 *  - Record the chain, the Commons file page, its licence/status and the date checked in
 *    docs/STORE_LOGOS.md in the same commit.
 *  - Key: the chain's display name (chains.ts) as normalizeChainKey writes it. Keep one entry per
 *    line in exactly this form, because tests/store-logos.test.ts reads this file to check that
 *    every key is a known chain and every file exists:
 *
 *      safeway: require('../../assets/stores/safeway.png'),
 *      'trader joe s': require('../../assets/stores/trader-joes.png'),
 *
 * Chains without an entry keep the initials badge (StoreBadge, storeBadge.ts).
 *
 * Empty today: the sources are listed in docs/STORE_LOGOS.md, but the files could not be
 * downloaded and their licence pages could not be checked from the build machine, so no logo
 * ships yet.
 */
export const STORE_LOGOS: Readonly<Record<string, ImageSourcePropType>> = {
  // LOGO ENTRIES START (one per line; see the rules above)
  // LOGO ENTRIES END
};

export function storeLogoFor(chain: string): ImageSourcePropType | undefined {
  return STORE_LOGOS[normalizeChainKey(chain)];
}
