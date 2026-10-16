import { resolveGroceryChainFromHaystack } from './chains';
import type { LinkStore } from './links';

/**
 * Delivery link for a store: opens Instacart for that chain, in the browser. No Instacart agreement,
 * no API, no cart writes, nothing earned. Ported from the old app (mobile/config/smartShopChains.ts
 * and smartShopDelivery.ts), Instacart only, with one change below.
 *
 * Compliance rule 5: the other company's name only says what the link does ("Delivery (Instacart)").
 * Never "partner", never "free delivery", no Instacart logo. Compliance to confirm the wording.
 *
 * NOT VERIFIED: Instacart refuses automated checks, so no slug or search link here has been opened
 * by a program. They follow the old app's table and Instacart's public URL shapes. Open a few in a
 * browser before launch.
 *
 * Chains with no entry get no delivery link: Dollar General Market (the old table said Instacart
 * does not serve it) and Trader Joe's (changed from the old table: Trader Joe's does not offer
 * delivery through Instacart, so the link would lead nowhere useful).
 */
type InstacartEntry = {
  /** https://www.instacart.com/store/{slug} */
  slug?: string;
  /** Used for the Instacart search link when there is no slug (default: the chain's display name). */
  searchName?: string;
};

// Keyed by GROCERY_CHAINS keys (chains.ts).
const INSTACART_BY_CHAIN: Readonly<Record<string, InstacartEntry>> = {
  save_mart: { slug: 'savemart' },
  foodmaxx: { slug: 'foodmaxx' },
  cost_less: { searchName: 'Cost Less Foods' },
  grocery_outlet: { slug: 'grocery-outlet' },
  winco: {},
  safeway: { slug: 'safeway' },
  raleys: { slug: 'raleys' },
  walmart: { searchName: 'Walmart' },
  target: {},
  food_4_less: {},
  costco: { slug: 'costco' },
  sprouts: { slug: 'sprouts' },
  smart_final: { slug: 'smart-and-final' },
  el_super: {},
  sams_club: {},
};

export type DeliveryLink = { url: string; service: 'Instacart' };

export function instacartSearchUrl(query: string): string {
  return `https://www.instacart.com/store/s?k=${encodeURIComponent(query)}`;
}

/** The Instacart link for this store's chain, or undefined for stores outside the table. */
export function resolveDeliveryLink(store: Pick<LinkStore, 'name' | 'chain'>): DeliveryLink | undefined {
  const chain = resolveGroceryChainFromHaystack(`${store.name} ${store.chain}`.toLowerCase());
  if (!chain) return undefined;
  const entry = INSTACART_BY_CHAIN[chain.key];
  if (!entry) return undefined;
  if (entry.slug) return { url: `https://www.instacart.com/store/${entry.slug}`, service: 'Instacart' };
  return { url: instacartSearchUrl(entry.searchName ?? chain.displayName), service: 'Instacart' };
}
