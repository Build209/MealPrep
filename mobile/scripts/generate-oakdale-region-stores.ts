/**
 * Fetch grocery stores within ~25 mi of Oakdale CA via Overpass and write mobile/data/oakdale-region-stores.json
 * Run: npx tsx scripts/generate-oakdale-region-stores.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOverpassGroceryQuery } from '../lib/stores/groceryFilter';
import { enrichStoreAddressFields, parseOsmAddressTags } from '../lib/stores/osmStoreAddress';
import {
  dedupeGroceryStoresByName,
  haystackFromTags,
  isAllowedOsmGroceryElement,
  rankGroceryStores,
  resolveGroceryChainFromHaystack,
} from '../lib/stores/groceryFilter';
import { storeRecordExtrasFromOsmTags } from '../lib/stores/storeLinks';
import type { StoreRecord } from '../lib/stores/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../data/oakdale-region-stores.json');

const OAKDALE = { lat: 37.7665, lng: -120.8471 };
const RADIUS_M = Math.round(25 * 1609.34);

const query = buildOverpassGroceryQuery(OAKDALE.lat, OAKDALE.lng, RADIUS_M, 200);

const endpoints = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

async function fetchOverpass(): Promise<unknown[]> {
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': '209MealPrep/1.0 store-fallback-generator (https://github.com/Build209/MealPrep)',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) continue;
    const json = (await response.json()) as { elements?: unknown[] };
    if (json.elements?.length) return json.elements;
  }
  throw new Error('Overpass fetch failed or returned no elements');
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function main(): Promise<void> {
const elements = (await fetchOverpass()) as OverpassElement[];
const stores: StoreRecord[] = [];

for (const el of elements) {
  const tags = el.tags ?? {};
  if (!isAllowedOsmGroceryElement(tags)) continue;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) continue;
  const name = tags.name!.trim();
  const haystack = haystackFromTags(tags);
  const known = resolveGroceryChainFromHaystack(haystack);
  const chain = known?.displayName ?? tags.brand ?? tags.operator ?? name;
  const addr = enrichStoreAddressFields(parseOsmAddressTags(tags), lat, lng);
  stores.push({
    id: `osm-${el.type}-${el.id}`,
    name,
    chain,
    addressLine: addr.addressLine,
    city: addr.city,
    state: addr.state || 'CA',
    zip: addr.zip,
    lat,
    lng,
    source: 'osm',
    pricingSource: 'none',
    osmShop: tags.shop?.trim() || undefined,
    ...storeRecordExtrasFromOsmTags(tags),
  });
}

const ranked = rankGroceryStores(dedupeGroceryStoresByName(stores));

const payload = {
  attribution:
    'Store locations © OpenStreetMap contributors (ODbL), via Overpass API — snapshot for offline fallback near Oakdale, CA.',
  generatedAt: new Date().toISOString(),
  stores: ranked,
};

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.stores.length} stores to ${OUT}`);
}

void main();
