import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export type CreatorVideoOverrideAction = 'hide' | 'show';

export interface CreatorVideoOverrideRow {
  video_id: string;
  action: CreatorVideoOverrideAction;
  note: string | null;
}

export async function loadCreatorVideoOverrides(
  admin: SupabaseClient,
  videoIds?: readonly string[],
): Promise<Map<string, CreatorVideoOverrideAction>> {
  let query = admin.from('creator_video_overrides').select('video_id, action');
  if (videoIds && videoIds.length > 0) {
    query = query.in('video_id', [...videoIds]);
  }
  const { data, error } = await query;
  if (error) throw error;
  const map = new Map<string, CreatorVideoOverrideAction>();
  for (const row of data ?? []) {
    const videoId = (row as CreatorVideoOverrideRow).video_id;
    const action = (row as CreatorVideoOverrideRow).action;
    if (action === 'hide' || action === 'show') {
      map.set(videoId, action);
    }
  }
  return map;
}

export function applyHideOverrides<T extends { video_id: string }>(
  rows: readonly T[],
  overrides: ReadonlyMap<string, CreatorVideoOverrideAction>,
): T[] {
  if (overrides.size === 0) return [...rows];
  return rows.filter((row) => overrides.get(row.video_id) !== 'hide');
}

export function shouldPersistVideoOnRefresh(
  videoId: string,
  title: string,
  description: string,
  overrides: ReadonlyMap<string, CreatorVideoOverrideAction>,
  isRecipeLike: (title: string, description: string) => boolean,
): boolean {
  const action = overrides.get(videoId);
  if (action === 'hide') return false;
  if (action === 'show') return true;
  return isRecipeLike(title, description);
}
