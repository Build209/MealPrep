// Delete scan photos older than 30 days, as the privacy page promises.
//
// Called once a day by pg_cron (job `scan-photos-retention-daily`, migration
// 20261013030000_scan_photo_retention.sql). Not called by the app.
//
// Deploy: Actions -> "Deploy Supabase function" -> scan-photo-retention (gateway JWT verification OFF;
// the shared secret below is the check).
//
// Secrets: SCAN_RETENTION_SECRET (same value as the vault secret `scan_retention_secret` that the
//          cron job sends), SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (defaults).
//
// Safe to run any number of times: it only removes objects past the retention window. Without the
// secret set, every call is refused and nothing is deleted.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  isScanPhotoObjectPath,
  SCAN_PHOTO_BUCKET,
  SCAN_RETENTION_BATCH,
  SCAN_RETENTION_DAYS,
  SCAN_RETENTION_MAX_BATCHES,
  SCAN_RETENTION_SECRET_HEADER,
  secretsMatch,
} from '../_shared/scanRetention.ts';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const expected = Deno.env.get('SCAN_RETENTION_SECRET') ?? '';
  const provided = req.headers.get(SCAN_RETENTION_SECRET_HEADER) ?? '';
  if (!secretsMatch(expected, provided)) return json(401, { error: 'Unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(503, { error: 'Server not configured' });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let removed = 0;
  let skipped = 0;
  let batches = 0;

  for (; batches < SCAN_RETENTION_MAX_BATCHES; batches += 1) {
    const { data, error } = await admin.rpc('list_expired_scan_photos', {
      p_days: SCAN_RETENTION_DAYS,
      p_limit: SCAN_RETENTION_BATCH,
    });
    if (error) {
      console.error('scan-photo-retention: list failed', error.message);
      return json(500, { error: 'list failed', removed, batches });
    }
    const rows = (data ?? []) as { name: string }[];
    if (rows.length === 0) break;

    const paths = rows.map((row) => row.name).filter(isScanPhotoObjectPath);
    skipped += rows.length - paths.length;
    if (paths.length === 0) break;

    const { error: removeError } = await admin.storage.from(SCAN_PHOTO_BUCKET).remove(paths);
    if (removeError) {
      console.error('scan-photo-retention: remove failed', removeError.message);
      return json(500, { error: 'remove failed', removed, batches });
    }
    removed += paths.length;

    // Saved records that pointed at a removed photo now have nothing to open.
    for (const table of ['pantry_items', 'store_deals']) {
      const { error: clearError } = await admin
        .from(table)
        .update({ scan_photo_path: null })
        .in('scan_photo_path', paths);
      if (clearError) console.error(`scan-photo-retention: clear ${table} failed`, clearError.message);
    }

    if (rows.length < SCAN_RETENTION_BATCH) {
      batches += 1;
      break;
    }
  }

  // Numbers only: no paths or account ids in the log.
  console.log(`scan-photo-retention: ok removed=${removed} skipped=${skipped} batches=${batches}`);
  return json(200, { ok: true, removed, skipped, batches });
});
