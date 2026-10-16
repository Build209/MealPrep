import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AVATAR_BUCKET, isOwnStoragePath, newAvatarPath, parseAvatarPath } from '../account/profile/avatar';
import { run, toDataError } from './errors';
import { keys } from './keys';
import { refuseWhenOffline } from './online';
import { requireClient, requireUserId, useSessionUserId } from './session';

/** The profile fields the profile form may change. Plan, role and the other protected columns are never sent. */
export type ProfileFieldsUpdate = { name: string; householdSize: number; dietaryNotes: string };

/** Saves name, household size and dietary notes on the person's own profiles row. */
export function useUpdateProfileFields() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  return useMutation({
    mutationFn: async (fields: ProfileFieldsUpdate) => {
      refuseWhenOffline();
      const client = requireClient();
      const id = requireUserId(session.data);
      await run<unknown>(
        client
          .from('profiles')
          .update({ name: fields.name, household_size: fields.householdSize, dietary_notes: fields.dietaryNotes })
          .eq('id', id)
          .select('id')
          .single(),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.profile.all }),
  });
}

export type AvatarChange =
  | { kind: 'upload'; bytes: ArrayBuffer; currentPath: string | null }
  | { kind: 'preset'; path: string; currentPath: string | null }
  | { kind: 'remove'; currentPath: string | null };

/**
 * Changes the picture. Order matters so a failure never leaves a broken avatar:
 * 1. upload the new object, 2. save avatar_path, 3. only then delete the old object (best effort).
 * A 'preset:' value is only ever saved to the row; it never touches storage.
 */
export function useChangeAvatar() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  return useMutation({
    mutationFn: async (change: AvatarChange) => {
      refuseWhenOffline();
      const client = requireClient();
      const userId = requireUserId(session.data);
      let nextPath: string | null;
      if (change.kind === 'upload') {
        nextPath = newAvatarPath(userId);
        const uploaded = await client.storage
          .from(AVATAR_BUCKET)
          .upload(nextPath, change.bytes, { contentType: 'image/jpeg', upsert: false });
        if (uploaded.error) throw toDataError(uploaded.error);
      } else if (change.kind === 'preset') {
        nextPath = change.path;
      } else {
        nextPath = null;
      }
      try {
        await run<unknown>(client.from('profiles').update({ avatar_path: nextPath }).eq('id', userId).select('id').single());
      } catch (error) {
        // The row did not change, so do not leave the new object behind.
        if (change.kind === 'upload' && nextPath) {
          await client.storage.from(AVATAR_BUCKET).remove([nextPath]).catch(() => undefined);
        }
        throw error;
      }
      const old = change.currentPath;
      if (old && old !== nextPath && parseAvatarPath(old).kind === 'photo' && isOwnStoragePath(old, userId)) {
        // Best effort: an old file left behind is harmless, so a failed delete must not fail the change.
        await client.storage.from(AVATAR_BUCKET).remove([old]).catch(() => undefined);
      }
      return nextPath;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.profile.all }),
  });
}
