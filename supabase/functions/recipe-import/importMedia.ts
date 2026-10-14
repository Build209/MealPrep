import { validateUserImportStoragePath } from './storagePathValidation.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const IMPORT_UPLOAD_BUCKET = 'recipe-import-uploads';
const INLINE_VIDEO_MAX_BYTES = 6 * 1024 * 1024;
const STALE_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;

export interface ImportImagePayload {
  mimeType: string;
  base64: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function serviceStorageHeaders(serviceKey: string): Record<string, string> {
  return { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
}

export { validateUserImportStoragePath };

export async function cleanupStaleUserImportUploads(
  userId: string,
  maxAgeMs: number = STALE_UPLOAD_MAX_AGE_MS,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  const listUrl = `${supabaseUrl}/storage/v1/object/list/${IMPORT_UPLOAD_BUCKET}`;
  let response: Response;
  try {
    response = await fetch(listUrl, {
      method: 'POST',
      headers: {
        ...serviceStorageHeaders(serviceKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prefix: `${userId}/`,
        limit: 100,
        sortBy: { column: 'created_at', order: 'asc' },
      }),
    });
  } catch {
    return;
  }
  if (!response.ok) return;

  const rows = (await response.json()) as Array<{ name?: string; created_at?: string }>;
  const cutoff = Date.now() - maxAgeMs;
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;
    const createdAt = row.created_at ? Date.parse(row.created_at) : NaN;
    if (!Number.isFinite(createdAt) || createdAt >= cutoff) continue;
    const path = `${userId}/${name}`;
    if (!validateUserImportStoragePath(userId, path)) continue;
    await deleteUserImportObject(userId, path);
  }
}

export async function downloadUserImportObject(
  userId: string,
  storagePath: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!validateUserImportStoragePath(userId, storagePath)) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;

  const normalized = storagePath.replace(/^\/+/, '');
  const objectUrl = `${supabaseUrl}/storage/v1/object/${IMPORT_UPLOAD_BUCKET}/${normalized}`;
  const response = await fetch(objectUrl, {
    headers: serviceStorageHeaders(serviceKey),
  });
  if (!response.ok) return null;

  const mimeType = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]!
    .trim();
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > 104_857_600) return null;
  return { bytes: buffer, mimeType };
}

/** @deprecated use downloadUserImportObject */
export async function downloadUserImportVideo(
  userId: string,
  storagePath: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  return downloadUserImportObject(userId, storagePath);
}

export async function deleteUserImportObject(userId: string, storagePath: string): Promise<void> {
  if (!validateUserImportStoragePath(userId, storagePath)) return;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;
  const normalized = storagePath.replace(/^\/+/, '');
  await fetch(`${supabaseUrl}/storage/v1/object/${IMPORT_UPLOAD_BUCKET}/${normalized}`, {
    method: 'DELETE',
    headers: serviceStorageHeaders(serviceKey),
  });
}

/** @deprecated use deleteUserImportObject */
export async function deleteUserImportVideo(storagePath: string): Promise<void> {
  const segments = storagePath.replace(/^\/+/, '').split('/');
  const userId = segments[0];
  if (!userId) return;
  await deleteUserImportObject(userId, storagePath);
}

export async function downloadUserImportImages(
  userId: string,
  storagePaths: string[],
): Promise<ImportImagePayload[] | null> {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const out: ImportImagePayload[] = [];
  for (const path of storagePaths) {
    const downloaded = await downloadUserImportObject(userId, path);
    if (!downloaded) return null;
    const mime = downloaded.mimeType.toLowerCase();
    if (!allowed.has(mime)) return null;
    out.push({ mimeType: mime, base64: bytesToBase64(downloaded.bytes) });
  }
  return out.length > 0 ? out : null;
}

export async function uploadVideoToGeminiFiles(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ fileUri: string; fileName: string } | null> {
  const start = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(bytes.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'recipe-import-video' } }),
    },
  );
  if (!start.ok) return null;
  const uploadTarget = start.headers.get('X-Goog-Upload-URL');
  if (!uploadTarget) return null;

  const upload = await fetch(uploadTarget, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': mimeType,
    },
    body: bytes,
  });
  if (!upload.ok) return null;
  const body = (await upload.json()) as { file?: { name?: string; uri?: string } };
  const fileName = body.file?.name;
  const fileUri = body.file?.uri;
  if (!fileName || !fileUri) return null;
  return { fileUri, fileName };
}

export async function deleteGeminiFile(apiKey: string, fileName: string): Promise<void> {
  await fetch(`${GEMINI_API_BASE}/${fileName}?key=${encodeURIComponent(apiKey)}`, {
    method: 'DELETE',
  });
}

export function buildGeminiPartsForVideo(
  bytes: Uint8Array,
  mimeType: string,
  prompt: string,
  fileUri?: string,
): Record<string, unknown>[] {
  if (fileUri) {
    return [{ file_data: { mime_type: mimeType, file_uri: fileUri } }, { text: prompt }];
  }
  return [
    { inline_data: { mime_type: mimeType, data: bytesToBase64(bytes) } },
    { text: prompt },
  ];
}

export function shouldUseGeminiFileApi(byteLength: number): boolean {
  return byteLength > INLINE_VIDEO_MAX_BYTES;
}

export function validatePhotoStoragePaths(userId: string, paths: string[]): boolean {
  if (paths.length === 0 || paths.length > 4) return false;
  return paths.every((path) => validateUserImportStoragePath(userId, path));
}
