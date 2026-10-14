/**
 * Checks for the scan photo retention job (privacy page: photos deleted after about 30 days).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isScanPhotoObjectPath,
  SCAN_PHOTO_BUCKET,
  SCAN_RETENTION_DAYS,
  secretsMatch,
} from '../functions/_shared/scanRetention.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// Same bucket and window as the app and the privacy page: checked in
// mobile/scripts/scan-photo-retention-mobile-check.ts while those live in mobile/.

// Paths.
assert.equal(isScanPhotoObjectPath('aaaa-bbbb/pantry/1700000000000.jpg'), true);
assert.equal(isScanPhotoObjectPath('aaaa-bbbb/price-tag/1.jpg'), true);
assert.equal(isScanPhotoObjectPath(''), false);
assert.equal(isScanPhotoObjectPath('/abs/path.jpg'), false);
assert.equal(isScanPhotoObjectPath('a/../b.jpg'), false);
assert.equal(isScanPhotoObjectPath('a//b.jpg'), false);
assert.equal(isScanPhotoObjectPath('loose.jpg'), false);

// Secret.
assert.equal(secretsMatch('abc123', 'abc123'), true);
assert.equal(secretsMatch('abc123', ' abc123 '), true);
assert.equal(secretsMatch('abc123', 'abc124'), false);
assert.equal(secretsMatch('abc123', 'abc12'), false);
assert.equal(secretsMatch('', ''), false, 'an unset secret must refuse every call');
assert.equal(secretsMatch('abc123', ''), false);

// Function: refuses without the secret, removes through the Storage API, logs no paths.
const fn = read('functions/scan-photo-retention/index.ts');
assert.match(fn, /secretsMatch\(expected, provided\)/);
assert.match(fn, /storage\.from\(SCAN_PHOTO_BUCKET\)\.remove\(paths\)/);
assert.match(fn, /list_expired_scan_photos/);
assert.doesNotMatch(fn, /console\.log\([^)]*paths/);

// Migration (mobile/supabase/migrations): checked in mobile/scripts/scan-photo-retention-mobile-check.ts.

// Deploy workflow knows the function and leaves gateway JWT checks off for it (cron sends no token).
const workflow = read('../.github/workflows/deploy-function.yml');
assert.match(workflow, /- scan-photo-retention/);
assert.match(workflow, /\|scan-photo-retention\)|scan-photo-retention\|/);

console.log('scan-photo-retention-check: ok');
