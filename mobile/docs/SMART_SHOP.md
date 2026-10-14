# Smart Shop (store deals)

Smart Shop finds **nearby grocery stores** (OpenStreetMap) and compares prices for your grocery list. Kroger weekly specials run through the **`kroger-deals` Supabase Edge Function** (no Kroger keys in the web build). If that function returns **503 not configured**, the app shows clearly labeled **SAMPLE deals** and plain OSM stores.

## Owner setup (no Supabase CLI)

1. **SQL** — run in Supabase SQL editor:

   `mobile/supabase/migrations/20260930400000_smart_shop_location_stores.sql`

2. **Kroger Developer (free)** — [https://developer.kroger.com/](https://developer.kroger.com/) → app with **Product** + **Location** scopes.

3. **Supabase secrets** — `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`

4. **Paste-deploy** `supabase/functions/kroger-deals/index.ts` as function `kroger-deals` with **Verify JWT ON**.

No GitHub Pages env changes beyond existing `EXPO_PUBLIC_SUPABASE_URL` / anon key.

## Architecture

- `lib/stores/` — built-in Central Valley ZIP labels, `api.zippopotam.us` + Nominatim fallback (persistent cache), Overpass mirrors with timeouts and saved-store fallback.
- `lib/deals/` — always calls `kroger-deals` for Kroger **locations** and **deals** when Supabase is configured; 503 → SAMPLE mode.
- `config/smartShop.ts` — radius (~10 mi), endpoints, contact email for Nominatim.
- `config/smartShopChains.ts` — grocery chain allowlist, exclusions, delivery slugs.
- `config/smartShopDelivery.ts` — Instacart / DoorDash URL templates.
