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
} from '../supabase/functions/_shared/scanRetention.ts';
import { SCAN_PHOTOS } from '../config/scanPhotos.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// Same bucket and window as the app and the privacy page.
assert.equal(SCAN_PHOTO_BUCKET, SCAN_PHOTOS.bucketId);
assert.equal(SCAN_RETENTION_DAYS, SCAN_PHOTOS.retentionDays);
assert.match(read('public/privacy.html'), /<strong>30 days<\/strong>/);

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
const fn = read('supabase/functions/scan-photo-retention/index.ts');
assert.match(fn, /secretsMatch\(expected, provided\)/);
assert.match(fn, /storage\.from\(SCAN_PHOTO_BUCKET\)\.remove\(paths\)/);
assert.match(fn, /list_expired_scan_photos/);
assert.doesNotMatch(fn, /console\.log\([^)]*paths/);

// Migration: service role only, never under 30 days, no SQL delete on storage, daily job.
const sql = read('supabase/migrations/20261013030000_scan_photo_retention.sql');
assert.match(sql, /revoke all on function public\.list_expired_scan_photos\(integer, integer\) from public, anon, authenticated/);
assert.match(sql, /grant execute on function public\.list_expired_scan_photos\(integer, integer\) to service_role/);
assert.match(sql, /greatest\(p_days, 30\)/);
assert.match(sql, /security definer/);
assert.match(sql, /set search_path = ''/);
assert.doesNotMatch(sql, /^\s*delete\s+from\s+storage\.objects/im);
assert.match(sql, /'scan-photos-retention-daily'/);
assert.match(sql, /\/functions\/v1\/scan-photo-retention/);

// Deploy workflow knows the function and leaves gateway JWT checks off for it (cron sends no token).
const workflow = read('../.github/workflows/deploy-function.yml');
assert.match(workflow, /- scan-photo-retention/);
assert.match(workflow, /\|scan-photo-retention\)|scan-photo-retention\|/);

console.log('scan-photo-retention-check: ok');
