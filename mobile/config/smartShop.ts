/** Smart Shop — public config only (no secrets). */

import { GROCERY_NAME_EXCLUDE_PATTERNS, SPECIALTY_SHOP_TAGS } from './smartShopChains';

export const SMART_SHOP_STORES = {
  defaultRadiusMiles: 10,
  maxSavedStores: 8,
  /** Stores pre-selected for price comparison when the user has no favorites yet. */
  defaultComparisonStoreCount: 3,
  /** Initial store cards shown before "Show more". */
  defaultVisibleStores: 8,
  /** Dedupe same name within this radius (meters). */
  duplicateRadiusMeters: 150,
  /** Include OSM shop=bakery / butcher / etc. when true. */
  includeSpecialtyShops: false,
  nameExcludePatterns: GROCERY_NAME_EXCLUDE_PATTERNS,
  specialtyShopTags: SPECIALTY_SHOP_TAGS,
  maxOverpassResults: 80,
  /** Native clients: Nominatim / Overpass usage policy User-Agent. */
  httpUserAgent: '209MealPrep/1.0 Smart Shop (https://github.com/Build209/MealPrep)',
  /** Web / fallback: Nominatim requires a contact email in the request (cannot set User-Agent in browsers). */
  nominatimContactEmail: 'smartshop@209mealprep.local',
  nominatimBaseUrl: 'https://nominatim.openstreetmap.org',
  /** Overpass mirrors tried in order (browser-friendly POST endpoints). */
  overpassApiUrls: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ] as const,
  /** @deprecated Use overpassApiUrls — kept for scripts. */
  overpassApiUrl: 'https://overpass-api.de/api/interpreter',
  /** Per-mirror POST timeout while racing Overpass endpoints. */
  overpassRequestTimeoutMs: 4_000,
  /** Overall cap for the parallel mirror race (ms). */
  overpassOverallTimeoutMs: 6_000,
  /** Overpass QL `[timeout:…]` server-side limit (seconds). */
  overpassQueryTimeoutSec: 10,
  /** In-memory cache TTL for geocode / Overpass (ms). */
  cacheTtlMs: 15 * 60 * 1000,
  /** localStorage cache for ZIP geocode + nearby stores (ms). */
  zipGeocodePersistentTtlMs: 30 * 24 * 60 * 60 * 1000,
  overpassPersistentTtlMs: 7 * 24 * 60 * 60 * 1000,
  /** Merge Kroger location rows within this distance (miles). */
  krogerMergeRadiusMiles: 0.35,
} as const;

/** User-facing Smart Shop copy (screens import from here — no inline marketing strings). */
export const SMART_SHOP_COPY = {
  locationModalTitle: 'Where are you shopping?',
  locationModalBody:
    'We use your area to find nearby grocery stores and compare list prices. Saved to your profile when signed in.',
  locationUseDevice: 'Use my location',
  locationZipPlaceholder: 'ZIP code',
  locationContinue: 'Continue',
  locationUnavailable: 'Location unavailable — enter a ZIP code.',
  locationNearPrefix: 'Near',
  locationChange: 'Change',
  compareStoresTitle: 'Compare at these stores',
  compareStoresEdit: 'Edit stores',
  compareStoresPickerTitle: 'Stores to compare',
  compareStoresPickerDone: 'Done',
  compareStoresEmpty: 'No grocery stores found nearby. Try a different ZIP or widen your search later.',
  deliveryBlurb: 'Copy your list, then paste into search on Instacart or DoorDash.',
  retailerListCopiedToast: 'List copied — refine search on the store site if needed.',
  estimatedPricesTitle: 'Estimated prices',
  estimatedPricesNote: 'Prices are estimates. Check the store for exact prices.',
  demoPricesTitle: 'Demo prices (sample)',
  demoPricesNote: 'Signed-out demo only — numbers are placeholders, not real store prices.',
  estimatesBanner: 'Demo mode — sample prices only, not real comparisons.',
  noLivePricesLabel: 'No live prices',
  noLivePricesHint:
    'No verified prices for your list yet. Open a weekly ad, check delivery apps, or add a price you saw in the aisle.',
  noLiveStoresNearbyHint:
    'No verified store prices near you yet. Use weekly ads, delivery apps, or add prices you see while shopping.',
  noPricesYetStore: 'No prices yet — check this week’s ad or add a price you saw.',
  noRealPriceComparison:
    'No verified prices to compare yet. Pick stores below, open weekly ads, or add prices you see in the aisle.',
  estimatedBadge: 'Estimated',
  estimatedWithCommunity: 'Estimated · shopper reports',
  communityDealsOnlyBadge: 'Shopper-reported deals only',
  communityDealsSummarySuffix: ' · shopper reports',
  estimatedSuffix: 'est.',
  pricesUnavailable: 'No prices yet',
  loadingStores: 'Finding nearby grocery stores…',
  updatingStores: 'Updating nearby stores…',
  storeSearchFailed: 'Could not load nearby stores. Check your connection and try again.',
  retryStoreSearch: 'Retry',
  loadingComparison: 'Comparing prices for your list…',
  osmRateLimited: 'Store search is busy — try again in a minute.',
  osmNetwork:
    'Store search is unavailable right now. Showing your saved stores when we have them — pull to refresh or try again in a few minutes.',
  osmNetworkRetry:
    'Could not reach store search servers. Your saved stores are shown below — tap Change location or try again shortly.',
  osmEmpty: 'No grocery stores found near this area — try a different ZIP.',
  livePricesLabel: 'Live store prices',
  livePricesWithCommunity: 'Store prices + shopper reports',
  pricingPartnerLabel: 'partner stores',
  livePricingNotConfigured: 'Estimated prices',
  livePricingUnavailable: 'Estimated prices',
  noLiveStoresNearby: 'Estimated prices',
  livePricingMatched: 'Live prices at selected stores with API coverage. Add prices for other stores.',
  livePricingNoMatches: 'No live prices matched this list — add prices to compare.',
  addPriceButton: 'Add price',
  addPriceSheetTitle: 'Add a price',
  addPriceItemLabel: 'Item',
  addPricePriceLabel: 'Price ($)',
  addPriceSizeLabel: 'Size / unit',
  addPriceSizePlaceholder: 'e.g. 16 oz or each',
  addPriceSaleUntilLabel: 'Sale ends (optional)',
  addPriceSaleUntilPlaceholder: 'YYYY-MM-DD',
  addPriceSave: 'Save price',
  addPriceCancel: 'Cancel',
  addPriceSignIn: 'Sign in to share prices with other shoppers.',
  addPriceScanTag: 'Snap shelf tag',
  addPriceScanning: 'Reading tag…',
  addPriceScanFailed: 'Could not read that tag. Try a clearer photo.',
  addPriceScanNotConfigured: 'Photo price scan is not set up yet.',
  reportedPriceNote: 'Shopper-reported price',
  addPriceFromListLabel: 'From your list',
  addPricePickStore: 'Pick a store',
  addPriceSavedTitle: 'Price saved',
  addPriceSavedBody: 'Thanks — other shoppers can use this when they compare your list.',
  addPriceAddAnother: 'Add another',
  addPriceDone: 'Done',
  addPriceItemRequired: 'Enter an item name.',
  addPricePriceRequired: 'Enter a valid price.',
  addPriceSaleDateInvalid: 'Sale end date must be today or later.',
  addPriceStoreUnsupported: 'This store cannot accept prices yet.',
  addPriceSaveFailed: 'Could not save price.',
  addPriceCameraPermission: 'Camera permission is needed to scan a shelf tag.',
} as const;

export const KROGER_CHAINS = [
  'Kroger',
  'Ralphs',
  'Food 4 Less',
  'Fred Meyer',
  'Smiths',
  "Smith's",
  'Fry’s',
  'Frys',
  'QFC',
  'King Soopers',
  'Mariano’s',
  'Marianos',
  'Pick n Save',
  'Metro Market',
  'Harris Teeter',
  'Dillons',
  'Baker’s',
  'Bakers',
  'Gerbes',
  'Jay C',
  'Pay Less',
  'Ruler',
] as const;

export function milesToMeters(miles: number): number {
  return miles * 1609.344;
}

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function mapsDirectionsUrl(store: {
  name: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
}): string {
  if (store.lat != null && store.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
  }
  const q = [store.name, store.addressLine, store.city, store.state, store.zip].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}
