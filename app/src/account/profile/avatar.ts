/**
 * Avatar values, pure (tests/profile-avatar.test.ts). profiles.avatar_path holds one of:
 *  - null: no avatar, show the first letter of the name
 *  - 'preset:<key>': one of the built-in tiles below (no storage, no network)
 *  - '<uid>/avatar-<ts>.jpg': an object in the private `avatars` bucket, shown through a short-lived signed URL (src/data/avatarUrl.ts)
 * Nothing here touches React or the network, so 'preset:' can never reach storage.
 */

export const PRESET_PREFIX = 'preset:';
export const AVATAR_BUCKET = 'avatars';
/** The bucket refuses files over 1 MB; stay under with room to spare. */
export const AVATAR_MAX_BYTES = 900_000;
export const AVATAR_EDGE = 512;

export type PresetAvatar = { key: string; label: string; emoji: string; bg: string; fg: string };

/** 12 plain tiles: a colour and a food emoji. Text colours are ink or white, picked for contrast on each ground. */
export const PRESET_AVATARS: readonly PresetAvatar[] = [
  { key: 'tomato', label: 'Tomato', emoji: '🍅', bg: '#FBE0DB', fg: '#1B1F3B' },
  { key: 'banana', label: 'Banana', emoji: '🍌', bg: '#FFD12E', fg: '#1B1F3B' },
  { key: 'avocado', label: 'Avocado', emoji: '🥑', bg: '#D5EFDD', fg: '#1B1F3B' },
  { key: 'carrot', label: 'Carrot', emoji: '🥕', bg: '#FDECC8', fg: '#1B1F3B' },
  { key: 'pepper', label: 'Pepper', emoji: '🌶️', bg: '#B32413', fg: '#FFFFFF' },
  { key: 'broccoli', label: 'Broccoli', emoji: '🥦', bg: '#0E7C3F', fg: '#FFFFFF' },
  { key: 'pizza', label: 'Pizza', emoji: '🍕', bg: '#E6E9EE', fg: '#1B1F3B' },
  { key: 'taco', label: 'Taco', emoji: '🌮', bg: '#FDECC8', fg: '#1B1F3B' },
  { key: 'cupcake', label: 'Cupcake', emoji: '🧁', bg: '#F6D5E8', fg: '#1B1F3B' },
  { key: 'lemon', label: 'Lemon', emoji: '🍋', bg: '#FFF1A8', fg: '#1B1F3B' },
  { key: 'blueberry', label: 'Blueberry', emoji: '🫐', bg: '#1B1F3B', fg: '#FFFFFF' },
  { key: 'eggplant', label: 'Eggplant', emoji: '🍆', bg: '#DCD3F2', fg: '#1B1F3B' },
];

export type AvatarValue =
  | { kind: 'none' }
  | { kind: 'preset'; preset: PresetAvatar }
  | { kind: 'photo'; path: string };

export function presetPath(key: string): string {
  return `${PRESET_PREFIX}${key}`;
}

export function findPreset(key: string): PresetAvatar | null {
  return PRESET_AVATARS.find((p) => p.key === key) ?? null;
}

/** Reads avatar_path. An unknown preset key (an older or newer app wrote it) is treated as no avatar, never as a storage path. */
export function parseAvatarPath(path: string | null | undefined): AvatarValue {
  const value = (path ?? '').trim();
  if (!value) return { kind: 'none' };
  if (value.startsWith(PRESET_PREFIX)) {
    const preset = findPreset(value.slice(PRESET_PREFIX.length));
    return preset ? { kind: 'preset', preset } : { kind: 'none' };
  }
  return { kind: 'photo', path: value };
}

/** True only for an object path under the person's own folder, the one place the RLS lets them write or delete. */
export function isOwnStoragePath(path: string | null | undefined, userId: string): boolean {
  if (!path || !userId) return false;
  if (path.startsWith(PRESET_PREFIX)) return false;
  return path.startsWith(`${userId}/`) && !path.includes('..');
}

/** Signed URLs last an hour; the app asks again a little before that (react-query staleTime). */
export const AVATAR_SIGNED_URL_SECONDS = 3600;
export const AVATAR_URL_STALE_MS = 50 * 60 * 1000;

/** The storage object path to sign, or null for none, a preset or an unknown preset: those never touch storage. */
export function avatarObjectPath(path: string | null | undefined): string | null {
  const parsed = parseAvatarPath(path);
  return parsed.kind === 'photo' ? parsed.path : null;
}

/** react-query key for a signed avatar URL, by object path (a new upload is a new path, so it is a new entry). */
export function avatarUrlKey(objectPath: string | null) {
  return ['avatar-url', objectPath] as const;
}

/** A fresh object path: <uid>/avatar-<ts>.jpg (the timestamp makes every upload a new address, so caches never show the old photo). */
export function newAvatarPath(userId: string, now: number = Date.now()): string {
  return `${userId}/avatar-${now}.jpg`;
}

/** The letter shown when there is no avatar. */
export function initialFor(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const first = Array.from(source)[0];
  return first ? first.toUpperCase() : '?';
}
