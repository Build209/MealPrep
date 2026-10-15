/** Ensure storage object path is under the authenticated user's folder only. */
export function validateUserImportStoragePath(userId: string, storagePath: string): boolean {
  if (!userId.trim()) return false;
  const normalized = storagePath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..')) return false;
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) return false;
  if (segments[0] !== userId) return false;
  return segments.every((segment) => segment !== '.' && segment !== '..');
}
