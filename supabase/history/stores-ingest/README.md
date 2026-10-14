# US grocery store ingest (Overture Places → Supabase `stores`)

Loads grocery and allowed big-box locations from the public Overture Maps S3 release into `public.stores` (PostGIS). Run after applying `mobile/supabase/migrations/20261005120000_stores_postgis_nearby.sql` (and `20261005143000_nearby_stores_security_invoker.sql` if you already created the RPC).

## Prerequisites

- Python 3.10+
- Recommended: virtualenv

```bash
cd mobile/scripts/stores-ingest
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

DuckDB reads `s3://overturemaps-us-west-2/...` without AWS credentials (anonymous).

## Environment

| Variable | Used when |
|----------|-----------|
| `DATABASE_URL` | Direct Postgres upsert (`--mode postgres`) |
| `SUPABASE_ACCESS_TOKEN` | Management API (`--mode supabase-api`) |
| `SUPABASE_PROJECT_REF` | Project ref (or pass `--project-ref`) |

## Commands

**Dry run (counts + estimated JSON size, no writes):**

```bash
python3 ingest.py --dry-run --state CA
python3 ingest.py --dry-run
```

**California test load via Supabase Management API** (recommended first):

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
export SUPABASE_PROJECT_REF="your-project-ref"
python3 ingest.py --mode supabase-api --state CA
```

**Full US load:**

```bash
python3 ingest.py --mode supabase-api
```

**Direct Postgres** (if you have a connection string):

```bash
export DATABASE_URL="postgresql://..."
python3 ingest.py --mode postgres --state CA
```

### Flags

- `--release 2026-09-23.1` — Overture release folder (default: latest discovered on S3)
- `--state CA` — filter to one US state (matches `CA` or `CALIFORNIA` in Overture `region`)
- `--dry-run` — print row counts and approximate payload size only
- `--batch-size 1000` — upsert batch size (Supabase API; retries 429/5xx with backoff)

## Monthly refresh

1. Check [Overture release notes](https://docs.overturemaps.org/release/latest/) for a new `release/YYYY-MM-DD.0` folder.
2. Run `python3 ingest.py --dry-run` to confirm row counts.
3. Run full `python3 ingest.py --mode supabase-api` (upserts by `id`).
4. Smoke-test the Stores tab in a few ZIPs (Oakdale, metro, rural).

Optional automation: a scheduled GitHub Action with `SUPABASE_ACCESS_TOKEN` and `workflow_dispatch` — not included in-repo.

**TODO:** optional OSM merge + dedupe behind a flag (not implemented).

## Data policy

- Confidence ≥ 0.5 (Overture `confidence` score).
- Permanently closed places excluded (`operating_status`).
- **Overture `taxonomy.primary` grocery types:** `grocery_store`, `supermarket`, `health_food_store`, `organic_grocery_store`, `international_grocery_store`, `asian_grocery_store`, `mexican_grocery_store`, `indian_grocery_store`, `korean_grocery_store`, `japanese_grocery_store`, `kosher_grocery_store`, `ethical_grocery_store`, `imported_food_store`, `butcher_shop`, `produce_store`, `greengrocer`, `seafood_market`.
- **Chain allow-list:** near-exact name match (`CHAIN_NAME_RE`) for major US grocers / big-box when Overture miscategorizes (e.g. Save Mart as `convenience_store`). Generic convenience names (e.g. “Lucky 7”) are not included.
- Excludes gas, liquor, tobacco/vape, pharmacies, supplement/vitamin shops (unless name includes a grocery word), restaurants mis-tagged as grocery, and “Walmart Grocery Pickup and Delivery” when a Walmart store is nearby.
- US `state` column: USPS 2-letter code from Overture `region` (full state name or code); blank when unknown.
- Name blocklist aligned with `mobile/lib/stores/groceryFilter.ts`.

Attribution in-app: OpenStreetMap contributors + Overture Maps Foundation.
