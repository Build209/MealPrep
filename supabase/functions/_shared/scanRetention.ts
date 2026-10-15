// Pure helpers for the scan photo retention job (no Deno or network imports, so checks can run them).
//
// The privacy page promises scan photos are deleted after about 30 days. Supabase blocks deleting
// storage rows with SQL (trigger storage.protect_delete), so the job lists expired objects through a
// service-role-only database function and removes them through the Storage API.

export const SCAN_PHOTO_BUCKET = 'scan-photos';
export const SCAN_RETENTION_DAYS = 30;
/** Objects removed per Storage API call (the API accepts up to 1,000). */
export const SCAN_RETENTION_BATCH = 500;
/** Upper bound on batches per run, so one run cannot loop forever. */
export const SCAN_RETENTION_MAX_BATCHES = 20;
export const SCAN_RETENTION_SECRET_HEADER = 'x-retention-secret';

/** Object paths look like `<userId>/<folder>/<timestamp>.jpg`. Anything else is skipped. */
export function isScanPhotoObjectPath(objectPath: string): boolean {
  if (!objectPath || objectPath.includes('..') || objectPath.startsWith('/')) return false;
  const parts = objectPath.split('/');
  return parts.length >= 2 && parts.every((part) => part.length > 0);
}

/** Constant-time secret comparison; lives in secrets.ts, re-exported here for existing imports. */
export { secretsMatch } from './secrets.ts';
