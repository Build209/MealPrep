import type { ImageSourcePropType } from 'react-native';
import { normalizeChainKey } from './storeBadge';

/**
 * THE ONE PLACE FOR REAL STORE LOGOS. EMPTY ON PURPOSE.
 *
 * Chain logos are other companies' trademarks. PRODUCT.md and the compliance doc say other
 * companies' names appear as plain text only, with no logos, until the owner and compliance clear
 * each one (licence or written permission). Until then every store circle shows the chain's
 * initials on a theme colour (StoreBadge, storeBadge.ts).
 *
 * Do not fetch logos from the web, and do not add one here without that clearance.
 *
 * Once a logo is cleared: put the file in app/assets/stores/ (a square PNG, at least 112x112),
 * then add one line keyed by the chain's name as normalizeChainKey writes it, for example:
 *
 *   safeway: require('../../assets/stores/safeway.png'),
 *   'trader joe s': require('../../assets/stores/trader-joes.png'),
 *
 * StoreBadge then shows the image inside the circle instead of the initials.
 */
export const STORE_LOGOS: Readonly<Record<string, ImageSourcePropType>> = {};

export function storeLogoFor(chain: string): ImageSourcePropType | undefined {
  return STORE_LOGOS[normalizeChainKey(chain)];
}
