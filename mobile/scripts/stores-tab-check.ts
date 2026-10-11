/**
 * Stores tab — distance formatting, haversine enrichment, store page & weekly-ad links.
 * Run from mobile/: npm run test:stores-tab
 */

import { haversineMiles } from '../config/smartShop';
import { resolveStoreChainConfig, VERIFIED_WEEKLY_AD_CHAIN_KEYS } from '../config/storeChains';
import type { StoreLocation } from '../lib/deals/types';
import {
  distanceMilesBetween,
  formatDistanceMiles,
  roundDistanceMiles,
  sortStoresByDistanceMiles,
  withDistancesFromOrigin,
} from '../lib/stores/storeDistance';
import {
  googleMapsPlaceSearchUrl,
  isStoreDeliveryServiceAvailable,
  resolveStorePageUrl,
  resolveWeeklyAdLink,
  storeDeliveryUrl,
} from '../lib/stores/storeLinks';
import {
  storesTabShowsLoadError,
  storesTabShowsNoSearchResults,
} from '../lib/stores/storesTabEmptyState';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const origin = { lat: 37.7665, lng: -120.8471 };

const oakdaleSaveMart: StoreLocation = {
  id: 'test-savemart',
  name: 'Save Mart',
  chain: 'Save Mart',
  addressLine: '3401 Oakdale Rd',
  city: 'Modesto',
  state: 'CA',
  zip: '95355',
  lat: 37.687,
  lng: -120.993,
  source: 'osm',
  pricingSource: 'none',
};

const miles = haversineMiles(origin, { lat: oakdaleSaveMart.lat!, lng: oakdaleSaveMart.lng! });
assert(miles > 8 && miles < 12, `expected ~10mi from Oakdale origin, got ${miles}`);

const enriched = withDistancesFromOrigin([oakdaleSaveMart], origin)[0];
assert(enriched.distanceMiles != null, 'distance attached');
assert(distanceMilesBetween(origin, oakdaleSaveMart) === enriched.distanceMiles, 'distance matches haversine');

assert(formatDistanceMiles(2.34) === '2.3 mi', 'format distance one decimal');
assert(roundDistanceMiles(2.34) === 2.3, 'round distance');

const sorted = sortStoresByDistanceMiles([
  { ...oakdaleSaveMart, distanceMiles: 5, name: 'far' },
  { ...oakdaleSaveMart, id: 'near', distanceMiles: 1.2, name: 'near' },
]);
assert(sorted[0].name === 'near', 'sort by distance');

const saveMartPage = resolveStorePageUrl(oakdaleSaveMart);
assert(saveMartPage.includes('google.com/maps'), 'save mart without store website uses Maps');

const weekly = resolveWeeklyAdLink(oakdaleSaveMart);
assert(weekly?.url.includes('flyers'), 'save mart weekly ad');

const osmOnly: StoreLocation = {
  ...oakdaleSaveMart,
  id: 'local-market',
  name: 'Riverbank Market',
  chain: 'Riverbank Market',
  website: 'https://example-grocery.test/store',
};
const mapsUrl = resolveStorePageUrl(osmOnly);
assert(mapsUrl.startsWith('https://www.google.com/maps/search/'), 'non-chain opens Maps, not Overture website');
assert(!mapsUrl.includes('example-grocery'), 'dead OSM website ignored');

const noWebsite: StoreLocation = {
  ...osmOnly,
  website: undefined,
};
assert(
  resolveStorePageUrl(noWebsite).startsWith('https://www.google.com/maps/search/'),
  'maps fallback without website',
);

const winco: StoreLocation = {
  ...oakdaleSaveMart,
  chain: 'WinCo Foods',
  name: 'WinCo Foods',
};
assert(!isStoreDeliveryServiceAvailable('instacart', winco), 'winco hides instacart');
assert(isStoreDeliveryServiceAvailable('ubereats', winco), 'winco keeps ubereats search');

const instacartUrl = storeDeliveryUrl('instacart', oakdaleSaveMart);
assert(instacartUrl === 'https://www.instacart.com/store/savemart', 'instacart slug');

const doordashUrl = storeDeliveryUrl('doordash', oakdaleSaveMart);
assert(doordashUrl.includes('doordash.com/search/store/'), 'doordash search');

const uberUrl = storeDeliveryUrl('ubereats', oakdaleSaveMart);
assert(uberUrl.includes('uber.com') && uberUrl.includes('Save%20Mart'), 'uber eats search');

assert(resolveStoreChainConfig(oakdaleSaveMart)?.key === 'save_mart', 'chain resolve');

const food4Less: StoreLocation = {
  ...oakdaleSaveMart,
  id: 'f4l',
  name: 'Food 4 Less',
  chain: 'Food 4 Less',
};
const f4lPage = resolveStorePageUrl(food4Less);
assert(f4lPage.includes('google.com/maps'), 'norcal food 4 less without website uses Maps');
const f4lAd = resolveWeeklyAdLink(food4Less);
assert(f4lAd?.url.includes('myfood4less.com/store/food4less/pages/weekly-ad'), 'norcal food 4 less weekly ad');

const wincoPage = resolveStorePageUrl(winco);
assert(wincoPage.includes('google.com/maps'), 'winco uses Maps');

assert(VERIFIED_WEEKLY_AD_CHAIN_KEYS.length >= 15, 'weekly ad keys documented');

const safeway: StoreLocation = {
  ...oakdaleSaveMart,
  chain: 'Safeway',
  name: 'Safeway',
  addressLine: '1441 E F St',
  city: 'Oakdale',
  zip: '95361',
};
const safewayPage = resolveStorePageUrl(safeway);
assert(safewayPage.includes('safeway.com/store-locator'), 'safeway store locator url');

assert(
  storesTabShowsLoadError({
    loadingStores: false,
    storeSearchFailed: true,
    filteredCount: 0,
    hasSearchQuery: false,
  }),
);
assert(
  storesTabShowsNoSearchResults({
    loadingStores: false,
    storeSearchFailed: false,
    filteredCount: 0,
    hasSearchQuery: true,
  }),
);

console.log('stores-tab-check: ok');
