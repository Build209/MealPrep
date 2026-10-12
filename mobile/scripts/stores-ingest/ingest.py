#!/usr/bin/env python3
"""Ingest US grocery stores from Overture Places GeoParquet into Supabase `public.stores`."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import textwrap
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Optional

import duckdb
import requests

S3_BUCKET = "s3://overturemaps-us-west-2"
USER_AGENT = "MealPlanatic-stores-ingest/1.0 (https://github.com/Build209/MealPrep)"

# Overture taxonomy.primary values (checked against release 2026-09-23.1).
GROCERY_CATEGORIES = {
    "grocery_store",
    "supermarket",
    "health_food_store",
    "organic_grocery_store",
    "international_grocery_store",
    "asian_grocery_store",
    "mexican_grocery_store",
    "indian_grocery_store",
    "korean_grocery_store",
    "japanese_grocery_store",
    "kosher_grocery_store",
    "ethical_grocery_store",
    "imported_food_store",
    "butcher_shop",
    "produce_store",
    "greengrocer",
    "seafood_market",
}

# Known grocery chains / big-box grocers. Overture often mis-tags these
# (e.g. Grocery Outlet -> discount_store, Raley's -> cafe, Save Mart -> convenience_store),
# so a near-exact name match is accepted from any category when the category is in CHAIN_OK_CATEGORIES.
CHAIN_NAME_RE = re.compile(
    r"^(walmart( supercenter| neighborhood market)?|target|super target|costco( wholesale)?|sam'?s club|"
    r"winco( foods)?|dollar general market|grocery outlet( bargain market)?|raley'?s|bel air|nob hill foods|"
    r"save mart( supermarkets)?|foodmaxx|lucky supermarkets|safeway|vons|pavilions|albertsons|ralphs|"
    r"food 4 less|foods co|smart ?& ?final( extra!?)?|sprouts( farmers market)?|trader joe'?s|"
    r"whole foods( market)?|aldi|stater bros\.?( markets)?|kroger|fred meyer|king soopers|fry'?s( food)?|"
    r"smith'?s( food (and|&) drug)?|qfc|h-e-b|heb|publix|meijer|hy-vee|wegmans|giant( eagle)?|"
    r"food lion|harris teeter|piggly wiggly|ingles|winn-dixie|shoprite|stop & shop|hannaford|"
    r"price chopper|market basket|jewel-osco|acme( markets)?|tops( markets)?|weis( markets)?|"
    r"save-a-lot|save a lot|lidl|natural grocers|cardenas( markets)?|vallarta( supermarkets)?|"
    r"northgate( gonzalez)?( market)?|el super|99 ranch market|h mart|food city|brookshire'?s|"
    r"united supermarkets|winco foods|grocery outlet)"
    r"( supermarket| market| store)?( #?\d+)?$",
    re.I,
)

# A chain-name match is only trusted when Overture's category is still store-like
# (drops pharmacy counters, money centers, fuel, offices, restaurants, "TOPS" weight-loss clubs, etc.).
CHAIN_OK_CATEGORIES = {
    "",
    "department_store",
    "discount_store",
    "shopping",
    "shopping_mall",
    "superstore",
    "specialty_foods_store",
    "wholesale_grocer",
    "warehouse_club_store",
    "farmers_market",
    "food_and_beverage_store",
    "market",
    "public_market",
    "drugstore",
    "convenience_store",
    "cafe",
    "bakery",
    "beer_wine_spirits_store",
    "delicatessen",
}

NAME_EXCLUDE = re.compile(
    r"\b(cigarette|cigarettes|tobacco|smoke shop|beer wine|wine & gas|wine & spirits|liquors?|vape|"
    r"7-eleven|7 eleven|circle k|am ?pm|arco|valero|chevron|shell|76|exxon|mobil|sinclair|"
    r"mini ?mart|minimart|food ?mart|gas|gasoline|quickeroo|stop n go|airgas|"
    r"extramile|extra mile|amar beer|quick stop|quik stop|speedway|love'?s|flyers|mine-mart|"
    r"fast & easy mart|five star food|wine vinegar|rocket|convenience|gas station|fuel|pharmacy)\b",
    re.I,
)

RESTAURANT_RE = re.compile(
    r"\b(restaurant|restaurante|taqueria|cafe|caf\u00e9|grill|birrieria|pizzeria)\b",
    re.I,
)
GROCERY_WORD_RE = re.compile(
    r"\b(market|marketplace|mercado|grocer|grocery|groceries|supermarket|supermercado|carniceria|meats?|"
    r"foods|halal|deli|store|raley'?s)\b",
    re.I,
)

SUPPLEMENT_SHOP_RE = re.compile(
    r"\b(nutrishop|nutrition(?:\s+store|\s+shop)?|gnc|vitamin shoppe|vitamins?|supplements?)\b",
    re.I,
)

WALMART_PICKUP_RE = re.compile(r"\bwalmart\b.*\bpickup\b", re.I)

DISALLOWED_CATEGORIES = {
    "convenience_store",
    "gas_station",
    "liquor_store",
    "tobacco_shop",
    "vape_shop",
    "vitamin_and_supplements_store",
    "health_and_beauty_store",
}

US_STATE_NAME_TO_CODE: dict[str, str] = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}

US_STATE_CODE_TO_NAME: dict[str, str] = {v: k.upper() for k, v in US_STATE_NAME_TO_CODE.items()}


def latest_overture_release() -> str:
    url = (
        "https://overturemaps-us-west-2.s3.amazonaws.com/"
        "?list-type=2&prefix=release/&delimiter=/"
    )
    resp = requests.get(url, timeout=60, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    prefixes = [
        p.find("s3:Prefix", ns).text
        for p in root.findall("s3:CommonPrefixes", ns)
        if p.find("s3:Prefix", ns) is not None
    ]
    releases = sorted(p.rstrip("/").split("/")[-1] for p in prefixes if p)
    if not releases:
        raise RuntimeError("Could not list Overture releases on S3")
    return releases[-1]


def places_glob(release: str) -> str:
    return f"{S3_BUCKET}/release/{release}/theme=places/type=place/*"


def normalize_us_state(region: Optional[str]) -> str:
    if not region:
        return ""
    raw = region.strip()
    if not raw:
        return ""
    key = re.sub(r"\s+", " ", raw.lower())
    if key in US_STATE_NAME_TO_CODE:
        return US_STATE_NAME_TO_CODE[key]
    if len(raw) == 2 and raw.isalpha():
        # Reject Title-case truncations from old ingest (e.g. "De" from Delaware, "Ca" from California).
        if raw[0].isupper() and raw[1].islower():
            return ""
        code = raw.upper()
        return code if code in US_STATE_CODE_TO_NAME else ""
    return ""


def state_sql_filter(state: Optional[str]) -> str:
    if not state:
        return ""
    code = state.strip().upper()
    if len(code) != 2 or not code.isalpha():
        raise SystemExit("--state must be a 2-letter USPS code (e.g. CA)")
    full = US_STATE_CODE_TO_NAME.get(code, "").upper()
    if full:
        return f"AND upper(trim(addresses[1].region)) IN ('{code}', '{full}')"
    return f"AND upper(trim(addresses[1].region)) = '{code}'"


def name_allowed(name: str) -> bool:
    if not name or not name.strip():
        return False
    if WALMART_PICKUP_RE.search(name):
        return False
    if NAME_EXCLUDE.search(name):
        return False
    if SUPPLEMENT_SHOP_RE.search(name) and not GROCERY_WORD_RE.search(name):
        return False
    if RESTAURANT_RE.search(name) and not GROCERY_WORD_RE.search(name):
        return False
    if re.search(r"\bfood mart\b", name, re.I):
        return False
    return True


def category_allowed(category: str, name: str) -> bool:
    cat = (category or "").strip().lower()
    trimmed = name.strip()
    if CHAIN_NAME_RE.match(trimmed) and cat in CHAIN_OK_CATEGORIES:
        return True
    if cat in DISALLOWED_CATEGORIES:
        return False
    if cat == "convenience_store":
        return False
    if cat in GROCERY_CATEGORIES:
        return True
    return False


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def rough_distance_m(a: StoreRow, b: StoreRow) -> float:
    dlat = (a.lat - b.lat) * 111_320
    dlng = (a.lng - b.lng) * 111_320 * max(0.3, abs(math.cos(a.lat * math.pi / 180)))
    return (dlat * dlat + dlng * dlng) ** 0.5


@dataclass
class StoreRow:
    id: str
    name: str
    brand: Optional[str]
    category: Optional[str]
    address_line: str
    city: str
    state: str
    zip: str
    lat: float
    lng: float
    phone: Optional[str]
    website: Optional[str]
    opening_hours: Optional[str]
    sources: list[str]

    def to_sql_values(self) -> str:
        def q(v: Optional[str]) -> str:
            if v is None:
                return "NULL"
            return "'" + v.replace("'", "''") + "'"

        src = "ARRAY[" + ",".join(q(s) for s in self.sources) + "]"
        geom = f"ST_SetSRID(ST_MakePoint({self.lng}, {self.lat}), 4326)::geography"
        return (
            f"({q(self.id)}, {q(self.name)}, {q(self.brand)}, {q(self.category)}, "
            f"{q(self.address_line)}, {q(self.city)}, {q(self.state)}, {q(self.zip)}, "
            f"{self.lat}, {self.lng}, {geom}, {q(self.phone)}, {q(self.website)}, "
            f"{q(self.opening_hours)}, {src}, now())"
        )


def fetch_overture_rows(release: str, state: Optional[str]) -> list[StoreRow]:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("INSTALL spatial; LOAD spatial;")
    glob = places_glob(release)
    state_filter = state_sql_filter(state)

    cat_list = ", ".join(f"'{c}'" for c in sorted(GROCERY_CATEGORIES))
    chain_prefix = (
        "walmart|target|costco|sam.?s club|winco|dollar general market|grocery outlet|raley|bel air|"
        "nob hill|save mart|foodmaxx|lucky|safeway|vons|pavilions|albertsons|ralphs|food 4 less|foods co|"
        "smart ?& ?final|sprouts|trader joe|whole foods|aldi|stater bros|kroger|fred meyer|king soopers|"
        "fry.?s|smith.?s|qfc|h-e-b|heb|publix|meijer|hy-vee|wegmans|giant|food lion|harris teeter|"
        "piggly wiggly|ingles|winn-dixie|shoprite|stop & shop|hannaford|price chopper|market basket|"
        "jewel-osco|acme|tops|weis|save-a-lot|save a lot|lidl|natural grocers|cardenas|vallarta|"
        "northgate|el super|99 ranch|h mart|food city|brookshire|united supermarkets|super target"
    )
    category_sql_filter = f"""
      AND (
        lower(COALESCE(taxonomy.primary, basic_category, '')) IN ({cat_list})
        OR regexp_matches(lower(names.primary), '^({chain_prefix})')
      )
      AND COALESCE(operating_status, '') <> 'permanently_closed'
    """

    query = f"""
    SELECT
      id,
      names.primary as name,
      COALESCE(brand.names.primary, '') as brand,
      COALESCE(taxonomy.primary, basic_category) as category,
      addresses[1].freeform as address_line,
      addresses[1].locality as city,
      addresses[1].region as state,
      addresses[1].postcode as zip,
      ST_Y(geometry) as lat,
      ST_X(geometry) as lng,
      phones[1] as phone,
      websites[1] as website,
      confidence
    FROM read_parquet('{glob}', filename=true, hive_partitioning=true)
    WHERE addresses[1].country = 'US'
      {state_filter}
      AND confidence >= 0.5
      AND names.primary IS NOT NULL
      {category_sql_filter}
    """
    raw = con.execute(query).fetchall()
    out: list[StoreRow] = []
    for row in raw:
        oid, name, brand, category, address_line, city, st, zip_code, lat, lng, phone, website, _confidence = row
        name_s = str(name or "").strip()
        if not name_allowed(name_s):
            continue
        if not category_allowed(str(category or ""), name_s):
            continue
        zip_s = str(zip_code or "").strip()[:10]
        st_s = normalize_us_state(str(st) if st is not None else None)
        out.append(
            StoreRow(
                id=f"ovt-{oid}",
                name=name_s[:200],
                brand=(brand or "").strip()[:120] or None,
                category=(str(category or "").strip()[:80] or None),
                address_line=(str(address_line or "").strip()[:240] or ""),
                city=(str(city or "").strip()[:80] or ""),
                state=st_s,
                zip=zip_s,
                lat=float(lat),
                lng=float(lng),
                phone=(str(phone).strip()[:40] if phone else None),
                website=(str(website).strip()[:500] if website else None),
                opening_hours=None,
                sources=["overture"],
            )
        )
    return out


def drop_walmart_pickup_near_store(rows: list[StoreRow], radius_m: float = 250.0) -> list[StoreRow]:
    """Drop Walmart Grocery Pickup rows when a Walmart supercenter/neighborhood market is nearby."""
    walmarts = [
        r
        for r in rows
        if re.match(r"^walmart(\s|$)", r.name, re.I) and not WALMART_PICKUP_RE.search(r.name)
    ]
    kept: list[StoreRow] = []
    for row in rows:
        if WALMART_PICKUP_RE.search(row.name):
            if any(rough_distance_m(row, w) <= radius_m for w in walmarts):
                continue
            continue
        kept.append(row)
    return kept


def dedupe_nearby(rows: list[StoreRow], radius_m: float = 150.0) -> list[StoreRow]:
    kept: list[StoreRow] = []
    by_name: dict[str, list[StoreRow]] = {}
    for row in rows:
        key = normalize_name(row.name)
        dup = False
        for k in by_name.get(key, []):
            if rough_distance_m(row, k) <= radius_m:
                dup = True
                break
        if not dup:
            kept.append(row)
            by_name.setdefault(key, []).append(row)
    return kept


def estimate_size_bytes(rows: list[StoreRow]) -> int:
    sample = json.dumps([r.__dict__ for r in rows[: min(50, len(rows))]])
    per = len(sample) / max(1, min(50, len(rows)))
    return int(per * len(rows))


WEBSITE_CHECK_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
)
WEBSITE_CHECK_TIMEOUT = 8.0


def _normalize_website_url(website: Optional[str]) -> Optional[str]:
    if not website:
        return None
    raw = website.strip()
    if not raw:
        return None
    if not re.match(r"^https?://", raw, re.I):
        raw = f"https://{raw.lstrip('/')}"
    return raw[:500]


def _website_alive(url: str) -> bool:
    headers = {"User-Agent": WEBSITE_CHECK_UA}
    try:
        head = requests.head(url, headers=headers, timeout=WEBSITE_CHECK_TIMEOUT, allow_redirects=True)
        if head.status_code == 405 or head.status_code >= 500:
            get = requests.get(
                url,
                headers=headers,
                timeout=WEBSITE_CHECK_TIMEOUT,
                allow_redirects=True,
                stream=True,
            )
            get.close()
            return get.status_code < 400
        return head.status_code < 400
    except requests.RequestException:
        return False


def null_dead_websites(rows: list[StoreRow], workers: int = 16) -> list[StoreRow]:
    """Set website to NULL when HEAD/GET fails (DNS, timeout, 4xx/5xx)."""
    urls: dict[str, list[StoreRow]] = {}
    for row in rows:
        url = _normalize_website_url(row.website)
        if url:
            urls.setdefault(url, []).append(row)

    if not urls:
        return rows

    alive: dict[str, bool] = {}
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(_website_alive, url): url for url in urls}
        for fut in as_completed(futures):
            url = futures[fut]
            try:
                alive[url] = fut.result()
            except Exception:
                alive[url] = False

    nulled = 0
    for url, group in urls.items():
        if alive.get(url):
            continue
        for row in group:
            row.website = None
            nulled += 1
    print(f"Website check: nulled {nulled} dead URLs ({len(urls)} unique checked)", file=sys.stderr)
    return rows


def upsert_postgres(rows: list[StoreRow], database_url: str, batch_size: int) -> None:
    import psycopg2

    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    cur = conn.cursor()
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        values = ",\n".join(r.to_sql_values() for r in chunk)
        sql = f"""
        INSERT INTO public.stores (
          id, name, brand, category, address_line, city, state, zip,
          lat, lng, geom, phone, website, opening_hours, sources, updated_at
        ) VALUES {values}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          brand = EXCLUDED.brand,
          category = EXCLUDED.category,
          address_line = EXCLUDED.address_line,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          geom = EXCLUDED.geom,
          phone = EXCLUDED.phone,
          website = EXCLUDED.website,
          opening_hours = EXCLUDED.opening_hours,
          sources = EXCLUDED.sources,
          updated_at = now();
        """
        cur.execute(sql)
        conn.commit()
        print(f"Upserted {i + len(chunk)} / {len(rows)}", file=sys.stderr)
    cur.close()
    conn.close()


def upsert_supabase_api(rows: list[StoreRow], project_ref: str, token: str, batch_size: int) -> None:
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        values = ",\n".join(r.to_sql_values() for r in chunk)
        query = textwrap.dedent(
            f"""
            INSERT INTO public.stores (
              id, name, brand, category, address_line, city, state, zip,
              lat, lng, geom, phone, website, opening_hours, sources, updated_at
            ) VALUES {values}
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              brand = EXCLUDED.brand,
              category = EXCLUDED.category,
              address_line = EXCLUDED.address_line,
              city = EXCLUDED.city,
              state = EXCLUDED.state,
              zip = EXCLUDED.zip,
              lat = EXCLUDED.lat,
              lng = EXCLUDED.lng,
              geom = EXCLUDED.geom,
              phone = EXCLUDED.phone,
              website = EXCLUDED.website,
              opening_hours = EXCLUDED.opening_hours,
              sources = EXCLUDED.sources,
              updated_at = now();
            """
        ).strip()
        resp = None
        for attempt in range(8):
            try:
                resp = requests.post(url, headers=headers, json={"query": query}, timeout=180)
            except (requests.Timeout, requests.ConnectionError) as exc:
                # Upsert is idempotent, so re-sending the batch is safe.
                wait = min(120, 10 * 2**attempt)
                print(f"{type(exc).__name__}; retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            if resp.status_code not in (429, 502, 503, 504):
                break
            wait = float(resp.headers.get("Retry-After") or min(120, 10 * 2**attempt))
            print(f"HTTP {resp.status_code}; retrying in {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
        if resp is None:
            raise RuntimeError("Supabase API request failed after retries (timeout/connection)")
        if resp.status_code >= 400:
            raise RuntimeError(f"Supabase API error {resp.status_code}: {resp.text[:500]}")
        print(f"Upserted {i + len(chunk)} / {len(rows)}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Overture grocery stores into Supabase")
    parser.add_argument("--release", help="Overture release id (default: latest on S3)")
    parser.add_argument("--state", help="US state code filter, e.g. CA")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mode", choices=["postgres", "supabase-api"], default="supabase-api")
    parser.add_argument("--project-ref", default=os.environ.get("SUPABASE_PROJECT_REF"))
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument(
        "--check-websites",
        action="store_true",
        help="Concurrently verify store websites; set website to NULL when unreachable",
    )
    parser.add_argument("--website-check-workers", type=int, default=16)
    args = parser.parse_args()

    release = args.release or latest_overture_release()
    print(f"Overture release: {release}", file=sys.stderr)
    rows = fetch_overture_rows(release, args.state)
    rows = drop_walmart_pickup_near_store(rows)
    rows = dedupe_nearby(rows)
    if args.check_websites:
        rows = null_dead_websites(rows, workers=args.website_check_workers)
    est = estimate_size_bytes(rows)
    print(f"Rows after filter/dedupe: {len(rows)}")
    print(f"Estimated JSON payload ~{est / 1024:.1f} KiB ({est / (1024*1024):.2f} MiB)")

    if args.dry_run:
        return

    if args.mode == "postgres":
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            raise SystemExit("DATABASE_URL required for postgres mode")
        upsert_postgres(rows, db_url, args.batch_size)
    else:
        token = os.environ.get("SUPABASE_ACCESS_TOKEN")
        ref = args.project_ref
        if not token or not ref:
            raise SystemExit("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF required for supabase-api mode")
        upsert_supabase_api(rows, ref, token, args.batch_size)


if __name__ == "__main__":
    main()
