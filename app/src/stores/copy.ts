/**
 * Stores tab wording, from the old app (mobile/config/storesTab.ts) where it exists.
 * Compliance rule 5: other companies' names only say what a link does ("Weekly ad: Safeway").
 * Rule 4: no savings claims.
 */
export const STORES_COPY = {
  title: 'Stores near you',
  heroTitle: 'Find deals and order groceries near you',
  heroSub: 'Open a weekly ad, shop a store online, or get directions.',
  savedHeading: 'Your saved stores',
  nearbyHeading: 'Nearby stores',
  savedTag: 'Saved',
  orderHeading: 'Order groceries',
  noStoresTitle: 'No stores here yet',
  noStoresHint: 'Try a wider area or a different ZIP code.',
  nearPrefix: 'Near',
  nearYourLocation: 'your location',
  changeLocation: 'Change',
  changeLocationA11y: 'Change location',
  searchPlaceholder: 'Search stores',
  emptySearch: 'No stores match your search.',
  loading: 'Finding nearby grocery stores…',
  loadFailed: 'Could not load stores. Check your connection and try again.',
  retry: 'Try again',
  noStores: 'No stores found nearby yet.',
  widenSearch: 'Try a wider area',
  findStoresTitle: 'Find stores near you',
  useMyLocation: 'Use my location',
  locating: 'Finding your location…',
  zipShort: 'ZIP code',
  zipGo: 'Go',
  zipInvalid: 'Enter a valid 5-digit US ZIP code.',
  locationDeniedHelp:
    'Location is off. Tap the lock icon in the address bar, open Permissions, and turn on Location — or enter a ZIP below.',
  phoneLocationDeniedHelp: "Location is off for MealPlanatic. Turn it on in your phone's Settings, or enter a ZIP below.",
  phoneServicesOff: 'Location services are turned off on this phone. Turn them on in Settings, or enter a ZIP below.',
  phoneTimeout: "Couldn't find your location in time. Try again, or enter a ZIP below.",
  phoneFailed: "Couldn't get your location. Try again, or enter a ZIP below.",
  zipOnlyHelp: 'Enter your ZIP code to see stores near you.',
  saveFailed: (message: string) => `Couldn't save your location. ${message}`,
  /** Old app wording. Compliance has an open question on the correct credit for Overture data (status doc, compliance item 4). */
  attribution: 'Store data © OpenStreetMap contributors, Overture Maps Foundation',
  directions: 'Directions',
  weeklyAd: 'Weekly ad',
  weeklyAdThirdParty: 'Weekly ad (third-party)',
  addFavoriteA11y: (name: string) => `Add ${name} to favourites`,
  removeFavoriteA11y: (name: string) => `Remove ${name} from favourites`,
  favoriteFailed: (message: string) => `Couldn't change your saved stores. ${message}`,
  /** Under the location line: which favourites the Grocery list's row of circles shows (storeRow.ts). */
  rowNote: 'Your 3 newest favourites show on your list.',
  // The row of store circles on the Grocery list (StoresRow.tsx).
  rowTitle: 'Your stores',
  rowA11y: 'Your stores',
  /** What the circle does: opens the weekly ad, the shop page, or (neither known) the Stores view. */
  rowStoreA11y: (name: string, favorite: boolean, action: 'weekly-ad' | 'shop' | 'stores' = 'stores', thirdParty = false) =>
    `${name}${favorite ? ', favourite' : ', nearby'}. ${
      action === 'weekly-ad' ? (thirdParty ? 'Weekly ad (third-party)' : 'Weekly ad') : action === 'shop' ? 'Shop online' : 'Open in Stores'
    }`,
  findStores: 'Find stores',
  findStoresA11y: 'Find stores near you',
  moreLocalMarkets: 'More local markets',
  hideLocalMarkets: 'Hide local markets',
  localMarketsHeading: 'Local markets',
  localMarketsNote: 'Smaller shops from open map data. Some may be closed or may not sell groceries.',
} as const;
