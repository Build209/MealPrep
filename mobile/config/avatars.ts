/** Profile avatars in Supabase Storage (`avatars` bucket). */

export const AVATARS = {
  bucketId: 'avatars',
  maxLongEdge: 512,
  jpegQuality: 0.85,
  maxBytes: 900_000,
  migrationFilePath: 'mobile/supabase/migrations/20261002143000_avatars_storage.sql',
  edgeDeleteAccountPath: 'supabase/functions/delete-user-account/index.ts',
  accountDeletionMigrationPath:
    'mobile/supabase/migrations/20261002150000_account_deletion_fks_and_rpc.sql',
} as const;

export function buildAvatarObjectPath(userId: string, timestampMs = Date.now()): string {
  return `${userId}/avatar-${timestampMs}.jpg`;
}
