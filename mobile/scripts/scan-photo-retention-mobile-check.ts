/**
 * Old-app half of supabase/scripts/scan-photo-retention-check.ts: the parts that read files in mobile/.
 * The function checks themselves moved to supabase/scripts/ with the functions.
 * Run from mobile/: npm run test:scan-photo-retention
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCAN_PHOTO_BUCKET, SCAN_RETENTION_DAYS } from '../../supabase/functions/_shared/scanRetention.ts';
import { SCAN_PHOTOS } from '../config/scanPhotos.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// Same bucket and window as the app and the privacy page.
assert.equal(SCAN_PHOTO_BUCKET, SCAN_PHOTOS.bucketId);
assert.equal(SCAN_RETENTION_DAYS, SCAN_PHOTOS.retentionDays);
assert.match(read('public/privacy.html'), /<strong>30 days<\/strong>/);

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

console.log('scan-photo-retention-mobile-check: ok');
