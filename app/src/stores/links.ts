import { resolveStoreChainConfig, type StoreChainConfig } from './chains';

/**
 * Weekly-ad and directions links for a store, ported from the old app
 * (mobile/lib/stores/storeLinks.ts, chainStoreWebsite.ts, mobile/config/smartShop.ts mapsDirectionsUrl).
 */

export type LinkStore = {
  name: string;
  chain: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  website?: string;
  krogerLocationId?: string;
  pricingSource?: 'kroger' | 'none';
};

const BLOCKED_WEBSITE_HOST_RE =
  /(^|\.)((google|goo\.gl|facebook|fb\.com|yelp|instagram|tripadvisor|foursquare|bing|apple|maps\.app)|openstreetmap)\./i;

const GENERIC_PATH_SKIP_RE = /\/(weekly-ad|circular|careers|about|privacy|terms|contact|login|signup)(\/|$)/i;

export function normalizeStoreWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/\//, '')}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function isBlockedStoreWebsiteHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return !h || BLOCKED_WEBSITE_HOST_RE.test(h);
}

export function isStoreSpecificWebsitePath(pathname: string): boolean {
  const path = pathname || '/';
  if (path === '/' || path === '') return false;
  const lower = path.toLowerCase();
  if (GENERIC_PATH_SKIP_RE.test(lower)) return false;
  if (/\/stores?\/details?\//i.test(lower)) return true;
  if (/\/stores?\/.+/i.test(lower) && !/\/stores?\/?$/i.test(lower)) return true;
  if (/\/locations?\/\d+/i.test(lower)) return true;
  if (/\/locations?\/.+\/.+/i.test(lower)) return true;
  if (/\/circulars\/storeid\/\d+/i.test(lower)) return true;
  if (/\/sm\/planning\/rsid\/\d+/i.test(lower)) return true;
  if (/\/store\/\d+/i.test(lower)) return true;
  return lower.split('/').filter(Boolean).length >= 2;
}

function hostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase().replace(/^www\./, '');
    return h === a || h.endsWith(`.${a}`);
  });
}

function matchesConfiguredChainStorePage(chain: StoreChainConfig, url: string): boolean {
  if (!chain.storePagePathPattern) return false;
  if (!new RegExp(chain.storePagePathPattern, 'i').test(url)) return false;
  const host = hostnameOf(url);
  if (isBlockedStoreWebsiteHost(host)) return false;
  if (chain.allowedWebsiteHosts?.length && !hostAllowed(host, chain.allowedWebsiteHosts)) return false;
  return isStoreSpecificWebsitePath(pathnameOf(url));
}

/** The store's own page on its chain's site, when the listing's website is one (chains only). */
export function resolveChainStorePageUrl(store: Pick<LinkStore, 'website'>, chain: StoreChainConfig | null): string | null {
  const normalized = store.website ? normalizeStoreWebsite(store.website) : null;
  if (!normalized || !chain?.storePagePathPattern) return null;
  return matchesConfiguredChainStorePage(chain, normalized) ? normalized : null;
}

function groceryOutletStoreWeeklyAdUrl(website: string): string | null {
  const m = website.match(/groceryoutlet\.com\/circulars\/storeid\/(\d+)/i);
  return m ? `https://www.groceryoutlet.com/circulars/storeid/${m[1]}` : null;
}

/** Save Mart store pages look like /stores/<uuid>/<NAME>/<store number>/<CITY>; the ad lives at /stores/<number>/flyers. */
function saveMartStoreWeeklyAdUrl(website: string): string | null {
  const m = website.match(/savemart\.com\/stores\/[0-9a-f-]{36}\/[^/]+\/(\d+)(?:\/|$)/i);
  return m ? `https://savemart.com/stores/${m[1]}/flyers` : null;
}

const STORE_WEEKLY_AD_FROM_WEBSITE: Record<string, (website: string) => string | null> = {
  grocery_outlet: groceryOutletStoreWeeklyAdUrl,
  save_mart: saveMartStoreWeeklyAdUrl,
};

export type WeeklyAdLink = {
  url: string;
  thirdParty?: boolean;
  /** True when the link is for this one store, not the chain's "pick your store" page. */
  storeSpecific?: boolean;
};

/**
 * The ad for this store, where we can tell which store it is:
 *  1. a per-store ad address built from the store's own web page (Save Mart, Grocery Outlet);
 *  2. the store's own page, for chains whose store page carries that store's ad (Safeway, Walmart);
 *  3. otherwise the chain's weekly-ad page, which asks the shopper to pick a store.
 * No link for stores outside the table.
 */
export function resolveWeeklyAdLink(
  store: Pick<LinkStore, 'name' | 'chain' | 'krogerLocationId' | 'pricingSource' | 'website'>,
): WeeklyAdLink | undefined {
  const chain = resolveStoreChainConfig(store);
  const website = store.website?.trim();
  if (website && chain) {
    const fromSite = STORE_WEEKLY_AD_FROM_WEBSITE[chain.key]?.(website);
    if (fromSite) return { url: fromSite, storeSpecific: true };
    if (chain.weeklyAdOnStorePage) {
      const storePage = resolveChainStorePageUrl(store, chain);
      if (storePage) return { url: storePage, storeSpecific: true };
    }
  }
  if (!chain?.weeklyAdUrl) return undefined;
  return chain.weeklyAdIsThirdParty ? { url: chain.weeklyAdUrl, thirdParty: true } : { url: chain.weeklyAdUrl };
}

/** Google Maps directions to the store (by position when known, else by address). */
export function mapsDirectionsUrl(store: Pick<LinkStore, 'name' | 'addressLine' | 'city' | 'state' | 'zip' | 'lat' | 'lng'>): string {
  if (store.lat != null && store.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
  }
  const q = [store.name, store.addressLine, store.city, store.state, store.zip].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}
