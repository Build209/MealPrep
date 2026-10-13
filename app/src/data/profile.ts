import { useQuery } from '@tanstack/react-query';
import { retryUnlessPermanent, run } from './errors';
import { keys } from './keys';
import { PROFILE_COLUMNS, profileFromRow, type Profile, type ProfileRow } from './rows';
import { requireClient, requireUserId, useSessionUserId } from './session';

/** Reads the signed-in person's own profiles row. */
export async function fetchOwnProfile(userId: string | null | undefined): Promise<Profile> {
  const client = requireClient();
  const id = requireUserId(userId);
  // profiles_select_self allows own row (admins can read all, so filter by id explicitly).
  const row = await run<ProfileRow>(client.from('profiles').select(PROFILE_COLUMNS).eq('id', id).single());
  return profileFromRow(row);
}

/**
 * The signed-in person's profile. Ends in an error state with a plain message
 * (DataError) when the build has no server settings or nobody is signed in.
 */
export function useProfile() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: keys.profile.own(userId),
    queryFn: () => fetchOwnProfile(userId),
    enabled: !session.isPending,
    retry: retryUnlessPermanent,
  });
}
