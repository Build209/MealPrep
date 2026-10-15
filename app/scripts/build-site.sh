#!/usr/bin/env bash
# Builds the whole GitHub Pages site for https://mealplanatic.app from the new app (app/).
#
# Site layout (same public addresses as today's .github/workflows/pages.yml):
#   /                      MealPlanatic app (Expo web export of app/, output "single")
#   /404.html              copy of index.html, so direct links like /pantry open the app
#   /terms.html, /privacy.html, /terms/, /privacy/   legal pages (app/public, verbatim)
#   /accessibility.html    accessibility statement (app/public, verbatim)
#   /209/                  209 Meal Prep static site (New/), plus redirects from its old root pages
#   /app/...               redirect stubs for links to the old /MealPrep/app/ address
#   /recipes, /smart-shop, ...   redirect stubs for old-app routes the new app does not have
#   /sw.js, /app/sw.js     clean-up service worker for browsers that installed the old app's worker
#   /CNAME, /.nojekyll
#
# Usage (from anywhere):
#   app/scripts/build-site.sh            # runs `npm run export:web` in app/, then assembles
#   SKIP_EXPORT=1 app/scripts/build-site.sh   # reuse an existing app/dist (CI reuse, local tests)
#   SITE_DIR=/tmp/site app/scripts/build-site.sh   # write somewhere other than app/site
#
# The export reads EXPO_PUBLIC_* settings from the environment (set them in the workflow).
# This script never deploys anything.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"
DIST_DIR="${DIST_DIR:-$APP_DIR/dist}"
SITE_DIR="${SITE_DIR:-$APP_DIR/site}"
SITE_ORIGIN="https://mealplanatic.app"
DOMAIN="mealplanatic.app"

fail() {
  echo "build-site: $*" >&2
  exit 1
}

# 1. Web export -------------------------------------------------------------------------------
if [ "${SKIP_EXPORT:-0}" != "1" ]; then
  (cd "$APP_DIR" && rm -rf "$DIST_DIR" && npm run export:web)
fi
[ -f "$DIST_DIR/index.html" ] || fail "missing $DIST_DIR/index.html (did the web export run?)"

rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR"
cp -a "$DIST_DIR/." "$SITE_DIR/"
cd "$SITE_DIR"

# Files that come from app/public through the export. Legal pages are copied byte for byte
# from mobile/public (approved wording); this script does not touch them.
for f in terms.html privacy.html accessibility.html sw.js pwa-register.js zcta-centroids.json; do
  [ -f "$f" ] || fail "export is missing $f (expected from app/public)"
done

# 2. Static host basics -----------------------------------------------------------------------
# GitHub Pages serves 404.html for any unknown address: the app then opens on that route.
cp index.html 404.html
# _expo/ starts with an underscore; Jekyll would drop it.
touch .nojekyll
# Custom domain. GitHub ignores this file for Actions-based deploys (the domain is the Pages
# setting), but it does no harm and documents the domain.
printf '%s\n' "$DOMAIN" > CNAME

# 3. Redirect stubs (same mechanism as today's pages.yml, plus a no-script fallback) -----------
# $1 = output file, $2 = JS expression for the new path, $3 = plain path for the no-script
# fallback and the canonical link.
redirect_page() {
  [ ! -e "$1" ] || fail "$1 already exists in the export; pick another redirect path"
  mkdir -p "$(dirname "$1")"
  printf '%s\n' '<!doctype html><meta charset="utf-8"><title>MealPlanatic</title>' \
    '<meta name="robots" content="noindex">' \
    "<link rel=\"canonical\" href=\"$SITE_ORIGIN$3\">" \
    "<meta http-equiv=\"refresh\" content=\"0; url=$3\">" \
    "<script>location.replace($2 + location.search + location.hash);</script>" \
    "<p><a href=\"$3\">Continue to MealPlanatic</a></p>" > "$1"
}

# Legal pages at /terms/ and /privacy/ too, as today (copies, not edits).
for page in terms privacy; do
  mkdir -p "$page"
  cp "$page.html" "$page/index.html"
done
# Their relative links ("terms.html" inside /privacy/) would otherwise land on the app's 404.
redirect_page privacy/terms.html "'/terms.html'" /terms.html
redirect_page terms/privacy.html "'/privacy.html'" /privacy.html

# Old-app routes that the new app does not have. old path -> new path.
# (/pantry, /grocery, /stores, /delete-account exist in the new app and open through 404.html.)
retired_routes=(
  "recipes:/recipes/search"
  "discover-recipes:/recipes/search"
  "smart-shop:/stores"
  "pantry-staples:/pantry"
  "profile:/account"
  "admin:/"
  "preview/video-recipe-detail:/"
)
for entry in "${retired_routes[@]}"; do
  old="${entry%%:*}"
  new="${entry#*:}"
  # Both /old and /old/ (today's site served both forms).
  redirect_page "$old.html" "'$new'" "$new"
  redirect_page "$old/index.html" "'$new'" "$new"
done

# Old /app/* links forward to the same path at the root (then on through the stubs above).
# The trailing slash GitHub Pages adds (/app/pantry -> /app/pantry/) is dropped: /pantry, not /pantry/.
# (The old the209bbq.github.io address stopped forwarding when the GitHub user was renamed to Build209.)
[ ! -e app ] || fail "app export now has an /app path; pick another redirect folder"
app_routes="admin pantry grocery recipes smart-shop discover-recipes privacy terms delete-account stores profile pantry-staples"
redirect_page app/index.html "location.pathname.replace(/^\\/app\\/?/, '/').replace(/(.)\\/\$/, '\$1')" /
for route in $app_routes; do
  redirect_page "app/$route/index.html" "location.pathname.replace(/^\\/app\\/?/, '/').replace(/(.)\\/\$/, '\$1')" "/$route"
done

# 4. Clean-up service worker at the old worker's address ---------------------------------------
# The old app registered /sw.js (scope /); /sw.js comes from app/public. A copy at /app/sw.js
# covers any browser that registered the worker while the app lived under /app/ (precaution).
cp sw.js app/sw.js
cp pwa-register.js app/pwa-register.js

# 5. 209 Meal Prep site -------------------------------------------------------------------------
[ ! -e 209 ] || fail "app export now has a /209 path"
mkdir -p 209
cp -a "$REPO_DIR/New/." 209/
# Old 209 Meal Prep links: pages that used to sit at the site root now live under /209/.
for page in 209/*.html; do
  name="$(basename "$page")"
  if [ ! -e "$name" ]; then
    redirect_page "$name" "'/209/$name'" "/209/$name"
  fi
done

# 6. Self-check ---------------------------------------------------------------------------------
required=(index.html 404.html terms.html privacy.html accessibility.html terms/index.html privacy/index.html
  CNAME .nojekyll sw.js app/sw.js pwa-register.js 209/index.html app/index.html)
for entry in "${retired_routes[@]}"; do
  old="${entry%%:*}"
  required+=("$old.html" "$old/index.html")
done
for route in $app_routes; do
  required+=("app/$route/index.html")
done
for f in "${required[@]}"; do
  [ -f "$f" ] || fail "missing $f in the site"
done
cmp -s index.html 404.html || fail "404.html differs from index.html"
cmp -s terms.html "$REPO_DIR/app/public/terms.html" || fail "terms.html differs from app/public"
cmp -s privacy.html "$REPO_DIR/app/public/privacy.html" || fail "privacy.html differs from app/public"
cmp -s accessibility.html "$REPO_DIR/app/public/accessibility.html" || fail "accessibility.html differs from app/public"
grep -q 'unregister' sw.js || fail "sw.js is not the clean-up worker"

echo "build-site: site ready in $SITE_DIR ($(find . -type f | wc -l | tr -d ' ') files)"
