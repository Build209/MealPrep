import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  importAllowanceFor,
  importTierFor,
  type ImportAllowance,
} from '../recipes/import/allowance';
import { draftProblems, recipeInsertFromDraft, type RecipeDraft } from '../recipes/import/draft';
import { IMPORT_UPLOAD_BUCKET, MAX_VIDEO_BYTES } from '../recipes/import/request';
import { currentUsagePeriod } from '../scan/allowance';
import { DataError, offlineError, retryUnlessPermanent, run, toDataError } from './errors';
import { SIGNED_OUT } from './keys';
import { isOnlineNow } from './online';
import { useProfile } from './profile';
import { requireClient, requireUserId, useSessionUserId } from './session';

/**
 * Recipe import: this month's import count, uploads the recipe-import function reads, and saving
 * the reviewed recipe as the person's own row in `recipes`.
 *
 * The live function reads the recipe and counts the import (claim_recipe_import, given back when
 * nothing came out); it never saves the recipe. Saving is this file's upsert, exactly as the old app
 * (upsertLinkImportedRecipe): is_master false, created_by = the person, creator credit in source_*.
 * Row level security only lets a person write rows they created that are not master recipes.
 */

// ---------------------------------------------------------------------- usage

/** This month's imports used, from the person's own recipe_import_usage row (only the function writes it). No row: 0. */
export async function fetchImportsUsed(userId: string | null | undefined, period: string): Promise<number> {
  const client = requireClient();
  const id = requireUserId(userId);
  let response: { data: unknown; error: unknown };
  try {
    response = await client.from('recipe_import_usage').select('imports').eq('user_id', id).eq('period', period).maybeSingle();
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  const imports = (response.data as { imports?: unknown } | null)?.imports;
  return typeof imports === 'number' && Number.isFinite(imports) ? imports : 0;
}

export const importUsageKey = (userId: string | null | undefined, period: string) =>
  ['recipe-import-usage', userId ? userId : SIGNED_OUT, period] as const;
export const importUsageAllKey = ['recipe-import-usage'] as const;

/** What the Import button says. 'unknown' while loading or when a read fails: it never promises an import. */
export function useImportAllowance(): ImportAllowance {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  const profile = useProfile();
  const period = currentUsagePeriod();
  const usage = useQuery({
    queryKey: importUsageKey(userId, period),
    queryFn: () => fetchImportsUsed(userId, period),
    enabled: !session.isPending && userId !== null,
    retry: retryUnlessPermanent,
  });
  const tier = profile.data ? importTierFor(profile.data) : null;
  return importAllowanceFor(tier, usage.data ?? null);
}

// -------------------------------------------------------------------- uploads

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extensionFor(mimeType: string, name?: string): string {
  const fromName = name?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName) && fromName !== name?.toLowerCase()) return fromName;
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'jpg';
}

async function upload(path: string, body: Blob | Uint8Array, contentType: string): Promise<string> {
  if (!isOnlineNow()) throw offlineError();
  const client = requireClient();
  let result: { error: unknown };
  try {
    result = await client.storage.from(IMPORT_UPLOAD_BUCKET).upload(path, body, { contentType, upsert: false });
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (result.error) throw toDataError(result.error);
  return path;
}

/**
 * Uploads prepared photos (base64 JPEG/PNG/WebP) to <user id>/photo-<time>-<n>.<ext>, the old app's
 * paths. The function reads them and deletes them afterwards.
 */
export async function uploadImportPhotos(userId: string | null | undefined, photos: Array<{ base64: string; mimeType: string }>): Promise<string[]> {
  const owner = requireUserId(userId);
  const stamp = Date.now();
  const paths: string[] = [];
  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i]!;
    paths.push(await upload(`${owner}/photo-${stamp}-${i}.${extensionFor(photo.mimeType)}`, bytesFromBase64(photo.base64), photo.mimeType));
  }
  return paths;
}

/** Uploads a picked video to <user id>/video-<time>.<ext> (old app's uploadRecipeImportVideo). */
export async function uploadImportVideo(
  userId: string | null | undefined,
  file: { uri: string; mimeType: string; name: string; size?: number },
): Promise<string> {
  const owner = requireUserId(userId);
  if (file.size != null && file.size > MAX_VIDEO_BYTES) throw new DataError('invalid', 'That video is too large. Choose one under 100 MB.');
  let blob: Blob;
  try {
    blob = await (await fetch(file.uri)).blob();
  } catch (thrown) {
    throw new DataError('invalid', "Couldn't read that video. Try another one.", { cause: thrown });
  }
  if (blob.size > MAX_VIDEO_BYTES) throw new DataError('invalid', 'That video is too large. Choose one under 100 MB.');
  return upload(`${owner}/video-${Date.now()}.${extensionFor(file.mimeType, file.name)}`, blob, file.mimeType);
}

// ----------------------------------------------------------------------- save

/**
 * Saves the reviewed draft as the person's own recipe and returns the new row's id.
 * An upsert on slug, as the old app: importing the same link again refreshes the earlier copy.
 */
export async function saveImportedRecipe(userId: string | null | undefined, draft: RecipeDraft): Promise<{ id: string }> {
  const owner = requireUserId(userId);
  if (!isOnlineNow()) throw offlineError();
  if (Object.keys(draftProblems(draft)).length > 0) throw new DataError('invalid', 'Fix the fields marked below, then save.');
  const client = requireClient();
  const payload = recipeInsertFromDraft(draft, owner);
  const row = await run<{ id: string }>(client.from('recipes').upsert(payload, { onConflict: 'slug' }).select('id').single());
  return { id: row.id };
}

/** Every query whose key starts with "recipe" (the recipe lists other screens own) is refetched after a save. */
const isRecipeQuery = (query: { queryKey: readonly unknown[] }) =>
  typeof query.queryKey[0] === 'string' && (query.queryKey[0] as string).startsWith('recipe');

export function useSaveImportedRecipe() {
  const queryClient = useQueryClient();
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useMutation({
    mutationKey: ['recipes', 'save-import'] as const,
    mutationFn: (draft: RecipeDraft) => saveImportedRecipe(userId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: isRecipeQuery });
    },
  });
}
