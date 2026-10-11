import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swSource = fs.readFileSync(path.join(mobileRoot, 'public/sw.js'), 'utf8');
const exportScript = fs.readFileSync(
  path.join(mobileRoot, 'scripts/apply-pwa-export.mjs'),
  'utf8',
);

assert.match(swSource, /NAV_POLICY_VERSION = '7'/);
// Pages are asked for fresh from the server: the browser's ten-minute copy showed the old app after an update.
assert.match(swSource, /fetch\(request, \{ cache: 'no-store' \}\)\.catch\(\(\) => fetch\(request\)\)/);
assert.match(swSource, /function networkFirst\(request, offlineFallback\) \{\s*return fetchFresh\(request\)/);
const registerSource = fs.readFileSync(path.join(mobileRoot, 'public/pwa-register.js'), 'utf8');
// A page already open when a new version takes over reloads (untouched) or offers to (in use).
assert.match(registerSource, /if \(!pending\) \{\s*onNewVersionTookOver\(\);/);
assert.match(registerSource, /function onNewVersionTookOver\(\) \{\s*if \(!hadControllerOnLoad\) return;\s*if \(userInteracted\) \{\s*showUpdateBanner/);
assert.match(registerSource, /registration\.update\(\)/);
assert.match(swSource, /function cacheFirst\(/);
assert.match(swSource, /function networkFirst\(/);
assert.doesNotMatch(swSource, /function staleWhileRevalidate\(/);
assert.match(swSource, /isImmutableHashedAsset/);
assert.match(swSource, /isSwBootstrapAsset[\s\S]*networkFirst\(request\)/);
assert.match(swSource, /request\.mode === 'navigate'[\s\S]*networkFirst\(request, cachedAppShell\)/);
assert.match(swSource, /if \(!allOk\)[\s\S]*caches\.delete\(SHELL_CACHE\)/);
assert.doesNotMatch(swSource, /cache\.add\(url\)\.catch\(\(\) => \{/);
assert.doesNotMatch(swSource, /cache\.addAll\(/);
assert.match(swSource, /PRECACHE_URLS\.map\(\(url\) => precacheUrl\(url\)\)/);

assert.match(exportScript, /shouldPrecacheExpoStatic/);
assert.match(exportScript, /heic2any/);
assert.match(exportScript, /shouldPrecacheHtml/);
assert.doesNotMatch(
  exportScript,
  /for \(const route of ROUTE_NAMES\)[\s\S]*urls\.add\(toPublicUrl\(`\$\{route\}\/index\.html`\)\)/,
  'route HTML shells should not be precached',
);

console.log('pwa-sw-check: ok');
