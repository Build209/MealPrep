import { resolveGroceryChainFromHaystack, resolveStoreChainConfig } from './chains';
import { isBlockedStoreWebsiteHost, normalizeStoreWebsite, resolveWeeklyAdLink, type LinkStore } from './links';

/**
 * The links a store offers, in the order the Stores page shows them: weekly ad, shop online,
 * Instacart, DoorDash. Plain links that open the other service's site or app in the browser.
 * No agreement, API, affiliate tag, cart write or earnings with Instacart or DoorDash. Affiliate tags
 * are to be added only after agreements are in place.
 *
 * Compliance rule 5 (claude/MealPlanatic compliance.md): the other company's name only says what a
 * link does ("Order with Instacart"). Never "partner", never "free delivery", no savings figures,
 * no Instacart or DoorDash logo. Compliance to confirm the wording.
 *
 * NOT VERIFIED: Instacart and DoorDash refuse automated checks, so no link here has been opened by a
 * program. The Instacart store slugs follow the old app's table (mobile/config/smartShopChains.ts);
 * everything else is a search link, which is a public URL shape on each site.
 *
 * DoorDash: its store pages end in a numeric id we cannot know, so every store gets a search link
 * (https://www.doordash.com/search/store/<name>/). No slug is guessed.
 *
 * Left out on purpose (as in #324): Trader Joe's (no delivery through either service) and, for
 * Instacart only, Dollar General Market (the old table said Instacart does not serve it).
 */

export type StoreAction = { id: 'flyer' | 'shop' | 'instacart' | 'doordash'; label: string; url: string };

export const STORE_ACTION_LABELS = {
  flyer: 'Weekly ad',
  shop: 'Shop online',
  instacart: 'Order with Instacart',
  doordash: 'Order with DoorDash',
} as const;

/** Instacart store pages (https://www.instacart.com/store/{slug}), keyed by GROCERY_CHAINS key. Other chains get a search link. */
const INSTACART_SLUG_BY_CHAIN: Readonly<Record<string, string>> = {
  save_mart: 'savemart',
  foodmaxx: 'foodmaxx',
  grocery_outlet: 'grocery-outlet',
  safeway: 'safeway',
  raleys: 'raleys',
  costco: 'costco',
  sprouts: 'sprouts',
  smart_final: 'smart-and-final',
};

/** The name sent to search when it differs from the chain's display name. */
const SEARCH_NAME_BY_CHAIN: Readonly<Record<string, string>> = {
  cost_less: 'Cost Less Foods',
};

const NO_INSTACART: ReadonlySet<string> = new Set(['trader_joes', 'dollar_general_market']);
const NO_DOORDASH: ReadonlySet<string> = new Set(['trader_joes']);

type NameRef = Pick<LinkStore, 'name' | 'chain'>;

function recognised(store: NameRef) {
  return resolveGroceryChainFromHaystack(`${store.name} ${store.chain}`.toLowerCase());
}

/** What to search for: the chain's name when we know the chain, else the store's own name. */
function searchNameFor(store: NameRef): string {
  const chain = recognised(store);
  if (chain) return SEARCH_NAME_BY_CHAIN[chain.key] ?? chain.displayName;
  return (store.chain || store.name).trim();
}

export type DeliveryLink = { url: string; service: 'Instacart' | 'DoorDash' };

export function instacartSearchUrl(query: string): string {
  return `https://www.instacart.com/store/s?k=${encodeURIComponent(query)}`;
}

export function doordashSearchUrl(query: string): string {
  return `https://www.doordash.com/search/store/${encodeURIComponent(query)}/`;
}

/** The Instacart link: the chain's store page where we know it, else a search for its name. */
export function resolveDeliveryLink(store: NameRef): DeliveryLink | undefined {
  const chain = recognised(store);
  if (chain && NO_INSTACART.has(chain.key)) return undefined;
  const name = searchNameFor(store);
  if (!name) return undefined;
  const slug = chain ? INSTACART_SLUG_BY_CHAIN[chain.key] : undefined;
  if (slug) return { url: `https://www.instacart.com/store/${slug}`, service: 'Instacart' };
  return { url: instacartSearchUrl(name), service: 'Instacart' };
}

/** The DoorDash link: always a search for the chain (or store) name. */
export function resolveDoorDashLink(store: NameRef): DeliveryLink | undefined {
  const chain = recognised(store);
  if (chain && NO_DOORDASH.has(chain.key)) return undefined;
  const name = searchNameFor(store);
  return name ? { url: doordashSearchUrl(name), service: 'DoorDash' } : undefined;
}

function usableWebsite(link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  const url = normalizeStoreWebsite(link);
  if (!url) return undefined;
  try {
    return isBlockedStoreWebsiteHost(new URL(url).hostname) ? undefined : url;
  } catch {
    return undefined;
  }
}

/** Shop online: the chain's online shop page, else the store's own website (never a maps or social page). */
export function resolveShopUrl(store: { name: string; chain?: string; link?: string | null }): string | undefined {
  const chain = resolveStoreChainConfig({ name: store.name, chain: store.chain ?? store.name });
  return chain?.shopUrl ?? usableWebsite(store.link);
}

/**
 * Everything a store offers, ordered: flyer (if any), shop/order (if any), Instacart, DoorDash.
 * `link` is the store's own website when known (it can pick the store's own weekly ad).
 */
export function resolveStoreActions(store: { key?: string; name: string; link?: string | null }): StoreAction[] {
  const ref = { name: store.name, chain: store.name };
  const out: StoreAction[] = [];
  const ad = resolveWeeklyAdLink({ ...ref, website: store.link ?? undefined });
  if (ad) out.push({ id: 'flyer', label: STORE_ACTION_LABELS.flyer, url: ad.url });
  const shop = resolveShopUrl(store);
  if (shop && shop !== ad?.url) out.push({ id: 'shop', label: STORE_ACTION_LABELS.shop, url: shop });
  const instacart = resolveDeliveryLink(ref);
  if (instacart) out.push({ id: 'instacart', label: STORE_ACTION_LABELS.instacart, url: instacart.url });
  const doordash = resolveDoorDashLink(ref);
  if (doordash) out.push({ id: 'doordash', label: STORE_ACTION_LABELS.doordash, url: doordash.url });
  return out;
}
