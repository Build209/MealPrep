/**
 * Store tables, ported from the old app without changes to the values:
 *  - STORE_CHAINS: weekly-ad links and store-page patterns (mobile/config/storeChains.ts).
 *    Weekly-ad links are dateless landing pages that always show the current ad.
 *  - GROCERY_CHAINS: the names that count as a "recognised chain" for sorting
 *    (mobile/config/smartShopChains.ts, match patterns only).
 *  - GROCERY_NAME_EXCLUDE_PATTERNS: names that are not grocery stores (same file).
 *  - KROGER_CHAINS: Kroger-family names (mobile/config/smartShop.ts).
 *
 * Compliance rule 5: these names are only used to say what a link does. No "partner". Store logos
 * (owner decision 2026-10-16, compliance to confirm) live only in storeLogos.ts; see docs/STORE_LOGOS.md.
 * Delivery links and prefilled store locators from the old table are not ported (the old store
 * detail sheet is not part of this tab yet).
 */

export type ChainStoreRef = {
  name: string;
  chain: string;
  krogerLocationId?: string;
  pricingSource?: 'kroger' | 'none';
};

export interface StoreChainConfig {
  key: string;
  displayName: string;
  matchPatterns: readonly string[];
  /** Regex tested against the store's own website; when it matches (on an allowed host) that page is the store's page. */
  storePagePathPattern?: string;
  /** Hostname allowlist (suffix match). */
  allowedWebsiteHosts?: readonly string[];
  weeklyAdUrl?: string;
  /** Weekly ad hosted off the chain's own domain (labelled in the UI). */
  weeklyAdIsThirdParty?: boolean;
  /** The chain's page for one store shows that store's ad, so the weekly-ad link opens it when known. */
  weeklyAdOnStorePage?: boolean;
  excludeStore?: (store: ChainStoreRef) => boolean;
}

export const STORE_CHAINS: readonly StoreChainConfig[] = [
  {
    key: 'save_mart',
    displayName: 'Save Mart',
    matchPatterns: ['save mart', 'savemart'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?savemart\\.com/stores/.+',
    allowedWebsiteHosts: ['savemart.com'],
    weeklyAdUrl: 'https://savemart.com/flyers',
  },
  { key: 'foodmaxx', displayName: 'FoodMaxx', matchPatterns: ['foodmaxx', 'food maxx'], weeklyAdUrl: 'https://foodmaxx.com/flyers' },
  {
    key: 'cost_less',
    displayName: 'Cost Less Food Co.',
    matchPatterns: ['cost less', 'costless'],
    weeklyAdUrl: 'https://costlessfoods.com/weekly-ad/',
  },
  {
    key: 'raleys',
    displayName: "Raley's",
    matchPatterns: ['raley', "raley's", 'raleys', 'bel air', 'nob hill'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?raleys\\.com/stores/.+',
    allowedWebsiteHosts: ['raleys.com'],
    weeklyAdUrl: 'https://www.raleys.com/weekly-ad',
  },
  {
    key: 'safeway',
    displayName: 'Safeway',
    matchPatterns: ['safeway'],
    storePagePathPattern: '^https://((local\\.)?safeway\\.com/.+|([a-z0-9-]+\\.)?safeway\\.com/(?!store-locator)[^?#]+)',
    allowedWebsiteHosts: ['safeway.com'],
    weeklyAdUrl: 'https://www.safeway.com/weeklyad',
    weeklyAdOnStorePage: true,
  },
  {
    key: 'albertsons',
    displayName: 'Albertsons',
    matchPatterns: ['albertsons'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?albertsons\\.com/.+',
    allowedWebsiteHosts: ['albertsons.com'],
    weeklyAdUrl: 'https://www.albertsons.com/weeklyad',
  },
  {
    key: 'vons',
    displayName: 'Vons',
    matchPatterns: ['vons'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?vons\\.com/.+',
    allowedWebsiteHosts: ['vons.com'],
    weeklyAdUrl: 'https://www.vons.com/weeklyad',
  },
  {
    key: 'pavilions',
    displayName: 'Pavilions',
    matchPatterns: ['pavilions'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?pavilions\\.com/.+',
    allowedWebsiteHosts: ['pavilions.com'],
    weeklyAdUrl: 'https://www.pavilions.com/weeklyad',
  },
  {
    key: 'walmart',
    displayName: 'Walmart',
    // A bare 'neighborhood market' also matched other names (e.g. the closed Fresh & Easy chain).
    matchPatterns: ['walmart supercenter', 'walmart neighborhood', 'walmart'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?walmart\\.com/store/.+',
    allowedWebsiteHosts: ['walmart.com'],
    weeklyAdUrl: 'https://www.walmart.com/shop/deals',
    weeklyAdOnStorePage: true,
  },
  { key: 'target', displayName: 'Target', matchPatterns: ['target'], weeklyAdUrl: 'https://www.target.com/weekly-ad' },
  { key: 'winco', displayName: 'WinCo', matchPatterns: ['winco', 'winco foods'], weeklyAdUrl: 'https://www.wincofoods.com/weekly-ad' },
  {
    key: 'grocery_outlet',
    displayName: 'Grocery Outlet',
    matchPatterns: ['grocery outlet'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?groceryoutlet\\.com/(circulars/storeid/\\d+|stores/.+)',
    allowedWebsiteHosts: ['groceryoutlet.com'],
    weeklyAdUrl: 'https://www.groceryoutlet.com/circulars',
  },
  {
    key: 'food_4_less',
    displayName: 'Food 4 Less',
    matchPatterns: ['food 4 less', 'food4less', 'food for less'],
    /** Save Mart-operated NorCal / Central Valley stores (not Kroger's food4less.com chain). */
    excludeStore: (store) => Boolean(store.krogerLocationId) || store.pricingSource === 'kroger',
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?myfood4less\\.com/.+',
    allowedWebsiteHosts: ['myfood4less.com'],
    weeklyAdUrl: 'https://www.myfood4less.com/store/food4less/pages/weekly-ad',
  },
  {
    key: 'kroger',
    displayName: 'Kroger',
    matchPatterns: ['kroger'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?kroger\\.com/stores/.+',
    allowedWebsiteHosts: ['kroger.com'],
    weeklyAdUrl: 'https://www.kroger.com/weeklyad',
  },
  {
    key: 'fred_meyer',
    displayName: 'Fred Meyer',
    matchPatterns: ['fred meyer', 'fredmeyer'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?(fredmeyer|kroger)\\.com/stores/.+',
    allowedWebsiteHosts: ['fredmeyer.com', 'kroger.com'],
    weeklyAdUrl: 'https://www.fredmeyer.com/weeklyad',
  },
  {
    key: 'king_soopers',
    displayName: 'King Soopers',
    matchPatterns: ['king soopers', 'king sooper'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?kingsoopers\\.com/stores/.+',
    allowedWebsiteHosts: ['kingsoopers.com', 'kroger.com'],
    weeklyAdUrl: 'https://www.kingsoopers.com/weeklyad',
  },
  {
    key: 'ralphs',
    displayName: 'Ralphs',
    matchPatterns: ['ralphs'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?ralphs\\.com/stores/.+',
    allowedWebsiteHosts: ['ralphs.com', 'kroger.com'],
    weeklyAdUrl: 'https://www.ralphs.com/weeklyad',
  },
  {
    key: 'publix',
    displayName: 'Publix',
    matchPatterns: ['publix'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?publix\\.com/locations/.+',
    allowedWebsiteHosts: ['publix.com'],
    weeklyAdUrl: 'https://www.publix.com/savings/weekly-ad',
  },
  {
    key: 'heb',
    displayName: 'H-E-B',
    matchPatterns: ['h-e-b', 'heb'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?heb\\.com/.+',
    allowedWebsiteHosts: ['heb.com'],
    weeklyAdUrl: 'https://www.heb.com/h-e-b-ads',
  },
  {
    key: 'meijer',
    displayName: 'Meijer',
    matchPatterns: ['meijer'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?meijer\\.com/.+',
    allowedWebsiteHosts: ['meijer.com'],
    weeklyAdUrl: 'https://www.meijer.com/shopping/weekly-ads.html',
  },
  {
    key: 'wegmans',
    displayName: 'Wegmans',
    matchPatterns: ['wegmans'],
    weeklyAdUrl: 'https://www.wegmans.com/shop/categories/weekly-specials',
  },
  { key: 'hy_vee', displayName: 'Hy-Vee', matchPatterns: ['hy-vee', 'hy vee', 'hyvee'], weeklyAdUrl: 'https://www.hy-vee.com/deals/weekly-ads' },
  {
    key: 'food_lion',
    displayName: 'Food Lion',
    matchPatterns: ['food lion'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?foodlion\\.com/.+',
    allowedWebsiteHosts: ['foodlion.com'],
    weeklyAdUrl: 'https://www.foodlion.com/weekly-specials/',
  },
  {
    key: 'stop_and_shop',
    displayName: 'Stop & Shop',
    matchPatterns: ['stop & shop', 'stop and shop'],
    weeklyAdUrl: 'https://www.stopandshop.com/weeklyad',
  },
  {
    key: 'whole_foods',
    displayName: 'Whole Foods Market',
    matchPatterns: ['whole foods'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?wholefoodsmarket\\.com/stores/.+',
    allowedWebsiteHosts: ['wholefoodsmarket.com'],
    weeklyAdUrl: 'https://www.wholefoodsmarket.com/sales-flyer',
  },
  {
    key: 'stater_bros',
    displayName: 'Stater Bros.',
    matchPatterns: ['stater bros', 'stater brothers'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?staterbros\\.com/stores/.+',
    allowedWebsiteHosts: ['staterbros.com'],
    weeklyAdUrl: 'https://www.staterbros.com/weekly-ad',
  },
  {
    key: 'smart_final',
    displayName: 'Smart & Final',
    matchPatterns: ['smart & final', 'smart and final', 'smart final'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?smartandfinal\\.com/sm/planning/rsid/\\d+',
    allowedWebsiteHosts: ['smartandfinal.com'],
    weeklyAdUrl: 'https://www.smartandfinal.com/circular',
  },
  { key: 'costco', displayName: 'Costco', matchPatterns: ['costco'], weeklyAdUrl: 'https://www.costco.com/warehouse-savings.html' },
  {
    key: 'trader_joes',
    displayName: "Trader Joe's",
    matchPatterns: ['trader joe', "trader joe's", 'trader joes'],
    weeklyAdUrl: 'https://www.traderjoes.com/home/flyer',
  },
  {
    key: 'sprouts',
    displayName: 'Sprouts',
    matchPatterns: ['sprouts'],
    storePagePathPattern: '^https://([a-z0-9-]+\\.)?sprouts\\.com/stores/.+',
    allowedWebsiteHosts: ['sprouts.com'],
    weeklyAdUrl: 'https://www.sprouts.com/weekly-ad',
  },
  { key: 'aldi', displayName: 'Aldi', matchPatterns: ['aldi'], weeklyAdUrl: 'https://www.aldi.us/weekly-specials' },
  {
    key: 'dollar_general',
    displayName: 'Dollar General',
    matchPatterns: ['dollar general'],
    weeklyAdUrl: 'https://www.dollargeneral.com/deals/weekly-ads',
  },
];

export function resolveStoreChainConfig(store: ChainStoreRef): StoreChainConfig | null {
  const haystack = `${store.name} ${store.chain}`.toLowerCase();
  for (const chain of STORE_CHAINS) {
    if (chain.excludeStore?.(store)) continue;
    if (chain.matchPatterns.some((p) => haystack.includes(p.toLowerCase()))) return chain;
  }
  return null;
}

// ------------------------------------------------------------ recognised chains

export interface GroceryChainConfig {
  key: string;
  displayName: string;
  /** Case-insensitive substrings matched against name + brand. */
  matchPatterns: readonly string[];
}

export const GROCERY_CHAINS: readonly GroceryChainConfig[] = [
  { key: 'save_mart', displayName: 'Save Mart', matchPatterns: ['save mart', 'savemart'] },
  { key: 'foodmaxx', displayName: 'FoodMaxx', matchPatterns: ['foodmaxx', 'food maxx'] },
  { key: 'cost_less', displayName: 'Cost Less Food Co.', matchPatterns: ['cost less', 'costless'] },
  { key: 'grocery_outlet', displayName: 'Grocery Outlet', matchPatterns: ['grocery outlet'] },
  { key: 'winco', displayName: 'WinCo', matchPatterns: ['winco', 'winco foods'] },
  { key: 'safeway', displayName: 'Safeway', matchPatterns: ['safeway'] },
  { key: 'raleys', displayName: "Raley's", matchPatterns: ['raley', "raley's", 'raleys', 'bel air', 'nob hill'] },
  // A bare 'neighborhood market' also matched other names (e.g. the closed Fresh & Easy chain).
  { key: 'walmart', displayName: 'Walmart', matchPatterns: ['walmart supercenter', 'walmart neighborhood', 'walmart'] },
  { key: 'target', displayName: 'Target', matchPatterns: ['target'] },
  { key: 'food_4_less', displayName: 'Food 4 Less', matchPatterns: ['food 4 less', 'food4less', 'food for less'] },
  { key: 'costco', displayName: 'Costco', matchPatterns: ['costco'] },
  { key: 'trader_joes', displayName: "Trader Joe's", matchPatterns: ['trader joe', "trader joe's", 'trader joes'] },
  { key: 'sprouts', displayName: 'Sprouts', matchPatterns: ['sprouts'] },
  { key: 'smart_final', displayName: 'Smart & Final', matchPatterns: ['smart & final', 'smart and final', 'smart final'] },
  { key: 'dollar_general_market', displayName: 'Dollar General Market', matchPatterns: ['dollar general market'] },
  { key: 'el_super', displayName: 'El Super', matchPatterns: ['el super', 'mi pueblo', 'cardenas', 'cardenas markets'] },
  { key: 'sams_club', displayName: "Sam's Club", matchPatterns: ["sam's club", 'sams club'] },
];

export function resolveGroceryChainFromHaystack(haystack: string): GroceryChainConfig | null {
  for (const chain of GROCERY_CHAINS) {
    if (chain.matchPatterns.some((p) => haystack.includes(p.toLowerCase()))) return chain;
  }
  return null;
}

/** Substrings that disqualify a listing even if it is labelled a grocery store. */
export const GROCERY_NAME_EXCLUDE_PATTERNS: readonly string[] = [
  '7-eleven',
  '7 eleven',
  'circle k',
  'ampm',
  'am pm',
  'chevron',
  'shell',
  'arco',
  'valero',
  '76 ',
  ' gas ',
  'fuel',
  'walgreens',
  'cvs ',
  'cvs pharmacy',
  'rite aid',
  'dollar tree',
  'dollar general',
  'family dollar',
  '99 cents',
  '99¢',
  'liquor',
  'bevmo',
  'department',
  'macy',
  'nordstrom',
  'tj maxx',
  'ross ',
  'burlington',
  'big lots',
  'pharmacy',
  'wal-mart pharmacy',
];

export function matchesGroceryNameExcludePattern(haystack: string): boolean {
  const lower = haystack.toLowerCase();
  if (lower.includes('dollar general market')) return false;
  if (
    /\b(cigarette|cigarettes|tobacco|smoke shop|beer wine|wine & gas|wine & spirits|liquor|vape|extramile|extra mile|amar beer)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (/\b(quick stop|quik stop|speedway|love'?s|flyers|mine-mart|fast & easy mart|five star food|wine vinegar)\b/i.test(lower)) {
    return true;
  }
  if (/\brocket\b/i.test(lower)) return true;
  return GROCERY_NAME_EXCLUDE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

/** Kroger-family store names (mobile/config/smartShop.ts KROGER_CHAINS). */
export const KROGER_CHAINS: readonly string[] = [
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
];

export function chainMatchesKroger(chain: string): boolean {
  const lower = chain.toLowerCase();
  return KROGER_CHAINS.some((c) => lower.includes(c.toLowerCase()));
}
