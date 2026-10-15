/**
 * Stores tab wording, from the old app (mobile/config/storesTab.ts) where it exists.
 * Compliance rule 5: other companies' names only say what a link does ("Weekly ad: Safeway").
 * Rule 4: no savings claims.
 */
export const STORES_COPY = {
  title: 'Stores near you',
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
  favorite: 'Save',
  favorited: 'Saved',
  favoriteA11y: (name: string) => `Favourite: ${name}`,
  favoriteFailed: (message: string) => `Couldn't change your saved stores. ${message}`,
  moreLocalMarkets: 'More local markets',
  hideLocalMarkets: 'Hide local markets',
  localMarketsHeading: 'Local markets',
  localMarketsNote: 'Smaller shops from open map data. Some may be closed or may not sell groceries.',
} as const;
