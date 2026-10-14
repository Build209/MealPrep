#!/usr/bin/env bash
# Cloud Agent bootstrap: Node deps + Supabase CLI (Management API / functions deploy).
set -euo pipefail

SUPABASE_CLI_VERSION="${SUPABASE_CLI_VERSION:-v2.120.0}"

if ! command -v supabase >/dev/null 2>&1; then
  curl -fsSL \
    "https://github.com/supabase/cli/releases/download/${SUPABASE_CLI_VERSION}/supabase_linux_amd64.tar.gz" \
    -o /tmp/supabase.tgz
  sudo tar -xzf /tmp/supabase.tgz -C /usr/local/bin supabase
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}/app"
if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  PROJECT_REF="${SUPABASE_PROJECT_REF:-okkwapgyadpaifpmkcex}"
  if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    supabase link --project-ref "${PROJECT_REF}" --password "${SUPABASE_DB_PASSWORD}" </dev/null || true
  else
    supabase link --project-ref "${PROJECT_REF}" </dev/null || true
  fi
fi
