// Kroger weekly specials proxy — paste this ENTIRE file into Supabase Dashboard:
// Edge Functions → kroger-deals → Via Editor
//
// Settings: leave "Verify JWT" ENABLED (authenticated app users only).
//
// Secrets (Edge Functions → Secrets):
//   KROGER_CLIENT_ID
//   KROGER_CLIENT_SECRET
// From https://developer.kroger.com/ — application scopes: Product + Location.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const KROGER_TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token';
const KROGER_API = 'https://api.kroger.com/v1';

interface StoreLocation {
  id: string;
  name: string;
  chain: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  url?: string;
}

interface GroceryItemPayload {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getKrogerToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.value;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'product.compact',
  });
  const basic = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(KROGER_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kroger token failed: ${response.status} ${text}`);
  }
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

function mapKrogerLocation(row: Record<string, unknown>): StoreLocation {
  const address = (row.address as Record<string, string>) ?? {};
  const geo = (row.geolocation as Record<string, number>) ?? {};
  const chain = String(row.chain ?? 'Kroger');
  const locationId = String(row.locationId ?? row.id ?? '');
  const name = String(row.name ?? chain);
  return {
    id: locationId,
    name,
    chain,
    addressLine: address.addressLine1 ?? '',
    city: address.city ?? '',
    state: address.state ?? '',
    zip: address.zipCode ?? '',
    lat: geo.latitude,
    lng: geo.longitude,
    url: `https://www.kroger.com/stores/details/${locationId}`,
  };
}

async function fetchNearbyStores(
  token: string,
  params: { lat?: number; lng?: number; zip?: string; radiusMiles?: number },
): Promise<StoreLocation[]> {
  const radius = params.radiusMiles ?? 15;
  const search = new URLSearchParams({
    'filter.radiusInMiles': String(radius),
    'filter.limit': '25',
  });
  if (params.lat != null && params.lng != null) {
    search.set('filter.latLong.near', `${params.lat},${params.lng}`);
  } else if (params.zip) {
    search.set('filter.zipCode.near', params.zip.slice(0, 5));
  } else {
    throw new Error('Provide lat/lng or zip');
  }

  const response = await fetch(`${KROGER_API}/locations?${search.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kroger locations failed: ${response.status} ${text}`);
  }
  const json = (await response.json()) as { data?: Record<string, unknown>[] };
  return (json.data ?? []).map(mapKrogerLocation);
}

const OZ_PER_LB = 16;
const G_PER_OZ = 28.3495;

function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === 'lbs' || u === 'pound' || u === 'pounds') return 'lb';
  if (u === 'ounces' || u === 'ounce') return 'oz';
  if (u === 'grams' || u === 'gram') return 'g';
  if (u === 'kilograms' || u === 'kilogram' || u === 'kgs') return 'kg';
  if (u === 'ct' || u === 'ea' || u === 'item' || u === 'items') return 'each';
  if (u === 'gal' || u === 'gallon' || u === 'gallons') return 'gal';
  if (u === 'qt' || u === 'quart' || u === 'quarts') return 'qt';
  if (u === 'pt' || u === 'pint' || u === 'pints') return 'pt';
  if (u === 'l' || u === 'liter' || u === 'liters' || u === 'litre' || u === 'litres') return 'l';
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return 'ml';
  if (u === 'fl' || u === 'floz' || u === 'fl oz' || u === 'fl-oz') return 'floz';
  return u;
}

function amountToOunces(quantity: number, unit: string): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const u = normalizeUnit(unit);
  if (u === 'oz') return quantity;
  if (u === 'lb') return quantity * OZ_PER_LB;
  if (u === 'g') return quantity / G_PER_OZ;
  if (u === 'kg') return (quantity * 1000) / G_PER_OZ;
  if (u === 'floz') return quantity;
  if (u === 'gal') return quantity * 128;
  if (u === 'qt') return quantity * 32;
  if (u === 'pt') return quantity * 16;
  if (u === 'l') return quantity * 33.814;
  if (u === 'ml') return (quantity / 1000) * 33.814;
  return null;
}

const SIZE_IN_TEXT_RE =
  /(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms|gal|gallon|gallons|qt|quart|quarts|pt|pint|pints|l|liter|liters|ml|milliliter|milliliters|ct|count|ea|each)\b/i;

const HALF_GALLON_RE = /\bhalf[\s-]?gallon\b/i;
const DOZEN_RE = /\b(dozen|dz)\b/i;

function parsePackageSizeFromText(text: string): { amount: number; unit: string } | null {
  if (HALF_GALLON_RE.test(text)) return { amount: 0.5, unit: 'gal' };
  if (DOZEN_RE.test(text)) return { amount: 12, unit: 'each' };

  const match = text.match(SIZE_IN_TEXT_RE);
  if (!match) return null;
  const amount = Number.parseFloat(match[1] ?? '');
  const unit = match[2] ?? '';
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, unit };
}

function packagesNeededForLine(
  neededQuantity: number,
  neededUnit: string,
  packageSize: { amount: number; unit: string } | null,
): number {
  if (!Number.isFinite(neededQuantity) || neededQuantity <= 0) return 1;
  const needU = normalizeUnit(neededUnit);
  if (needU === 'each' || needU === 'count') {
    if (packageSize) {
      const pkgU = normalizeUnit(packageSize.unit);
      if (pkgU === 'each' || pkgU === 'count') {
        return Math.max(1, Math.ceil(neededQuantity / packageSize.amount));
      }
    }
    return Math.max(1, Math.ceil(neededQuantity));
  }
  if (!packageSize) return 1;
  const pkgU = normalizeUnit(packageSize.unit);
  if (pkgU === 'each' || pkgU === 'count') {
    return Math.max(1, Math.ceil(neededQuantity / packageSize.amount));
  }
  const needOz = amountToOunces(neededQuantity, needU);
  const pkgOz = amountToOunces(packageSize.amount, pkgU);
  if (needOz == null || pkgOz == null || pkgOz <= 0) return 1;
  return Math.max(1, Math.ceil(needOz / pkgOz));
}

const DELI_PREPARED_RE =
  /\b(deli|sliced|prepared|cooked|rotisserie|breaded|nugget|strip|lunch\s*meat|smoked|honey\s*ham)\b/i;
const FRESH_RAW_RE = /\b(fresh|raw|boneless|skinless|breast|thigh|whole)\b/i;

function scoreProductTitle(searchTerm: string, productTitle: string): number {
  const title = productTitle.toLowerCase();
  const term = searchTerm.toLowerCase();
  let score = 0;
  if (title.includes(term)) score += 40;
  for (const token of term.split(/\s+/).filter((t) => t.length > 2)) {
    if (title.includes(token)) score += 8;
  }
  if (DELI_PREPARED_RE.test(productTitle)) score -= 35;
  if (FRESH_RAW_RE.test(productTitle)) score += 12;
  return score;
}

function pickPrice(priceObj: Record<string, unknown> | undefined): {
  unit: number;
  promoLabel?: string;
} | null {
  if (!priceObj) return null;
  const regular = Number(priceObj.regular);
  const promo = Number(priceObj.promo);
  const hasPromo = Number.isFinite(promo) && promo > 0;
  const hasRegular = Number.isFinite(regular) && regular > 0;
  if (hasPromo && hasRegular && promo < regular) {
    return { unit: promo, promoLabel: `Sale (was $${regular.toFixed(2)})` };
  }
  if (hasPromo) return { unit: promo, promoLabel: 'Promo price' };
  if (hasRegular) return { unit: regular };
  return null;
}

async function fetchProductPrice(
  token: string,
  locationId: string,
  term: string,
  neededQuantity: number,
  neededUnit: string,
): Promise<{ title: string; price: number; promo?: string; url?: string; lineTotal: number } | null> {
  const search = new URLSearchParams({
    'filter.term': term.slice(0, 48),
    'filter.locationId': locationId,
    'filter.limit': '8',
  });
  const response = await fetch(`${KROGER_API}/products?${search.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { data?: Record<string, unknown>[] };
  const products = json.data ?? [];
  if (products.length === 0) return null;

  let best: { title: string; price: number; promo?: string; url?: string; lineTotal: number; score: number } | null =
    null;
  for (const product of products) {
    const items = (product.items as Record<string, unknown>[]) ?? [];
    for (const item of items) {
      const picked = pickPrice(item.price as Record<string, unknown> | undefined);
      if (!picked) continue;
      const title = String(product.description ?? term);
      const url = product.productId
        ? `https://www.kroger.com/p/${String(product.productId)}`
        : undefined;
      const sizeText = String(item.size ?? product.size ?? title);
      const packageSize = parsePackageSizeFromText(sizeText) ?? parsePackageSizeFromText(title);
      const packages = packagesNeededForLine(neededQuantity, neededUnit, packageSize);
      const lineTotal = Math.round(picked.unit * packages * 100) / 100;
      const score = scoreProductTitle(term, title) - picked.unit * 0.01;
      if (
        !best ||
        score > best.score ||
        (score === best.score && lineTotal < best.lineTotal) ||
        (score === best.score && lineTotal === best.lineTotal && picked.unit < best.price)
      ) {
        best = { title, price: picked.unit, promo: picked.promoLabel, url, lineTotal, score };
      }
    }
  }
  if (!best) return null;
  return { title: best.title, price: best.price, promo: best.promo, url: best.url, lineTotal: best.lineTotal };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('KROGER_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('KROGER_CLIENT_SECRET') ?? '';
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          error:
            'Live Kroger prices are not set up yet. Ask an admin to finish setup.',
          configured: false,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const body = (await req.json()) as {
      action: 'stores' | 'locations' | 'deals';
      lat?: number;
      lng?: number;
      zip?: string;
      radiusMiles?: number;
      stores?: StoreLocation[];
      items?: GroceryItemPayload[];
    };

    const token = await getKrogerToken(clientId, clientSecret);

    if (body.action === 'stores' || body.action === 'locations') {
      const stores = await fetchNearbyStores(token, body);
      return new Response(JSON.stringify({ stores, configured: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'deals') {
      const stores = body.stores ?? [];
      const items = body.items ?? [];
      const deals: Record<string, unknown>[] = [];

      for (const item of items) {
        for (const store of stores) {
          const match = await fetchProductPrice(token, store.id, item.name, item.quantity, item.unit);
          if (!match) continue;
          const lineTotal = match.lineTotal;
          deals.push({
            groceryItemId: item.id,
            storeId: store.id,
            productTitle: match.title,
            unitPrice: match.price,
            lineTotal,
            quantity: item.quantity,
            unit: item.unit,
            promoLabel: match.promo,
            productUrl: match.url ?? store.url,
          });
        }
      }

      const storeTotals = stores.map((store) => {
        const storeDeals = deals.filter((d) => d.storeId === store.id);
        const subtotal = storeDeals.reduce((sum, d) => sum + Number(d.lineTotal), 0);
        const promoCount = storeDeals.filter((d) => d.promoLabel).length;
        return {
          storeId: store.id,
          subtotal: Math.round(subtotal * 100) / 100,
          itemCount: storeDeals.length,
          missingCount: Math.max(0, items.length - storeDeals.length),
          promoCount,
          pricesAvailable: true,
        };
      });

      const sorted = [...storeTotals].sort((a, b) => b.itemCount - a.itemCount || a.subtotal - b.subtotal);
      const best = sorted[0];
      const bestStore = stores.find((s) => s.id === best?.storeId);

      const result = {
        stores,
        deals,
        storeTotals,
        suggestion: {
          kind: 'single_store',
          label: bestStore ? bestStore.chain : 'Store',
          storeIds: best ? [best.storeId] : [],
          estimatedTotal: best?.subtotal ?? 0,
          note: 'Live price',
        },
      };

      return new Response(JSON.stringify({ result, configured: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kroger proxy error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
