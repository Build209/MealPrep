import { useQuery } from '@tanstack/react-query';
import {
  AVATAR_BUCKET,
  AVATAR_SIGNED_URL_SECONDS,
  AVATAR_URL_STALE_MS,
  avatarObjectPath,
  avatarUrlKey,
} from '../account/profile/avatar';
import { getSupabase } from '../lib/supabase';

/**
 * A signed address for an uploaded avatar (the bucket may be public or private; a signed URL
 * works for both). Returns null while loading, on any error, and for none or a preset, so the
 * caller shows the initial tile and never a broken image. A preset never reaches storage.
 */
export function useAvatarUrl(avatarPath: string | null | undefined): string | null {
  const objectPath = avatarObjectPath(avatarPath);
  const query = useQuery({
    queryKey: avatarUrlKey(objectPath),
    enabled: objectPath !== null,
    staleTime: AVATAR_URL_STALE_MS,
    gcTime: AVATAR_URL_STALE_MS * 2,
    retry: 1,
    queryFn: async () => {
      const client = getSupabase();
      if (!client || !objectPath) throw new Error('No storage client.');
      const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(objectPath, AVATAR_SIGNED_URL_SECONDS);
      if (error || !data?.signedUrl) throw new Error('Could not sign the avatar address.');
      return data.signedUrl;
    },
  });
  return objectPath !== null && query.data ? query.data : null;
}
