import { resolveStoreChainConfig } from './chains';
import { isBlockedStoreWebsiteHost, normalizeStoreWebsite, resolveWeeklyAdLink } from './links';

/**
 * The links a store card offers: weekly ad and shop online. Plain links that open the store's own
 * site. (Ordering through DoorDash, Instacart or Walmart is no longer per store: the Stores page
 * has one "Order online" section, see orderOnline.ts.)
 */

export type StoreAction = { id: 'flyer' | 'shop'; label: string; url: string };

export const STORE_ACTION_LABELS = {
  flyer: 'Weekly ad',
  shop: 'Shop online',
} as const;

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
 * Everything a store offers, ordered: flyer (if any), shop online (if any).
 * `link` is the store's own website when known (it can pick the store's own weekly ad).
 */
export function resolveStoreActions(store: { key?: string; name: string; link?: string | null }): StoreAction[] {
  const ref = { name: store.name, chain: store.name };
  const out: StoreAction[] = [];
  const ad = resolveWeeklyAdLink({ ...ref, website: store.link ?? undefined });
  if (ad) out.push({ id: 'flyer', label: STORE_ACTION_LABELS.flyer, url: ad.url });
  const shop = resolveShopUrl(store);
  if (shop && shop !== ad?.url) out.push({ id: 'shop', label: STORE_ACTION_LABELS.shop, url: shop });
  return out;
}
