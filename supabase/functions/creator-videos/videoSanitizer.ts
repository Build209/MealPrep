import type { VideoUpsertRow } from './youtubeRefresh.ts';

/** Remove NUL bytes and lone UTF-16 surrogates (invalid in Postgres / tsvector). */
export function stripInvalidUnicode(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i]! + input[i + 1]!;
        i += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += input[i]!;
  }
  return out;
}

/** Truncate by Unicode code point count (safe for emoji and combining marks). */
export function truncateByCodePoints(input: string, maxCodePoints: number): string {
  const cleaned = stripInvalidUnicode(input);
  if (maxCodePoints <= 0) return '';
  const points = [...cleaned];
  if (points.length <= maxCodePoints) return cleaned;
  return points.slice(0, maxCodePoints).join('');
}

const MAX_TITLE_CODE_POINTS = 500;
const MAX_DESCRIPTION_CODE_POINTS = 500;

export function sanitizeVideoUpsertRow(row: VideoUpsertRow): VideoUpsertRow {
  const title = truncateByCodePoints(row.title.trim(), MAX_TITLE_CODE_POINTS) || 'Untitled';
  const descriptionRaw = row.description_snippet?.trim() ?? '';
  const description_snippet = descriptionRaw
    ? truncateByCodePoints(descriptionRaw, MAX_DESCRIPTION_CODE_POINTS)
    : null;

  return {
    ...row,
    title,
    description_snippet: description_snippet || null,
    thumbnail_url: stripInvalidUnicode(row.thumbnail_url).trim(),
    url: stripInvalidUnicode(row.url).trim(),
  };
}

/** Last row wins when the uploads playlist returns duplicate video IDs. */
export function dedupeVideoUpsertRows(rows: readonly VideoUpsertRow[]): VideoUpsertRow[] {
  const map = new Map<string, VideoUpsertRow>();
  for (const row of rows) {
    const id = row.video_id.trim();
    if (!id) continue;
    map.set(id, sanitizeVideoUpsertRow({ ...row, video_id: id }));
  }
  return [...map.values()];
}
