#!/usr/bin/env bash
# Builds a database from the baseline (if it is not built yet) and runs the baseline checks.
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres db/scripts/check-baseline.sh
#       Supabase local database (supabase db start). This is what CI runs.
#
#   DB_URL=postgresql://localhost/scratch db/scripts/check-baseline.sh --plain
#       A bare, empty Postgres with no Docker: loads small stand-ins for Supabase's auth and
#       storage schemas first. PostGIS is usually missing there, so the stores.geom column
#       becomes bytea and its map index is skipped. Quick local use only.
#
# Never point DB_URL at the live project.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
baseline="$here/supabase/migrations/20261013000000_live_baseline.sql"
: "${DB_URL:?set DB_URL to a local database}"

case "$DB_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    echo "Refusing to run against a hosted Supabase database." >&2
    exit 2
    ;;
esac

psql_run() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"; }

if [[ "${1:-}" == "--plain" ]]; then
  psql_run -f "$here/tests/plain-postgres-stubs.sql"
  if [[ "$(psql "$DB_URL" -tAc "select count(*) from pg_available_extensions where name = 'postgis'")" == "0" ]]; then
    echo "PostGIS not available: stores.geom loaded as bytea, map index skipped."
    tmp="$(mktemp)"
    sed -e 's/geom geography(Point,4326) not null/geom bytea not null/' \
        -e '/stores_geom_gist_idx/d' "$baseline" > "$tmp"
    baseline="$tmp"
  fi
fi

built="$(psql "$DB_URL" -tAc "select to_regclass('public.profiles') is not null")"
if [[ "$built" == "t" ]]; then
  echo "Baseline already applied (supabase db start runs migrations); checking it."
else
  echo "Applying baseline..."
  psql_run -f "$baseline"
  # Later migrations in this folder, in name order (supabase db start applies them itself).
  for later in "$here"/supabase/migrations/*.sql; do
    [[ "$(basename "$later")" == "20261013000000_live_baseline.sql" ]] && continue
    echo "Applying $(basename "$later")..."
    psql_run -f "$later"
  done
fi

psql_run -f "$here/tests/baseline_check.sql"
psql_run -f "$here/tests/grocery_tick_check.sql"
psql_run -f "$here/tests/recipes_read_check.sql"
psql_run -f "$here/tests/add_missing_check.sql"
psql_run -f "$here/tests/daily_caps_check.sql"
psql_run -f "$here/tests/db_hardening_check.sql"
psql_run -f "$here/tests/ai_rate_limits_check.sql"
psql_run -f "$here/tests/security_hardening_check.sql"
