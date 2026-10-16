import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESET_AVATARS,
  AVATAR_SIGNED_URL_SECONDS,
  AVATAR_URL_STALE_MS,
  avatarObjectPath,
  avatarUrlKey,
  findPreset,
  initialFor,
  isOwnStoragePath,
  newAvatarPath,
  parseAvatarPath,
  presetPath,
} from '../src/account/profile/avatar';

const UID = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://abc.supabase.co';

test('there are 12 distinct presets with readable labels', () => {
  assert.equal(PRESET_AVATARS.length, 12);
  assert.equal(new Set(PRESET_AVATARS.map((p) => p.key)).size, 12);
  for (const p of PRESET_AVATARS) {
    assert.match(p.key, /^[a-z]+$/);
    assert.ok(p.label && p.emoji && /^#[0-9A-F]{6}$/i.test(p.bg));
  }
});

test('presetPath and parseAvatarPath round trip', () => {
  for (const p of PRESET_AVATARS) {
    const parsed = parseAvatarPath(presetPath(p.key));
    assert.equal(parsed.kind, 'preset');
    if (parsed.kind === 'preset') assert.equal(parsed.preset.key, p.key);
  }
  assert.equal(presetPath('taco'), 'preset:taco');
});

test('parseAvatarPath: empty is none, unknown preset is none (never a storage path), a path is a photo', () => {
  assert.deepEqual(parseAvatarPath(null), { kind: 'none' });
  assert.deepEqual(parseAvatarPath(undefined), { kind: 'none' });
  assert.deepEqual(parseAvatarPath('   '), { kind: 'none' });
  assert.deepEqual(parseAvatarPath('preset:nope'), { kind: 'none' });
  assert.deepEqual(parseAvatarPath('preset:'), { kind: 'none' });
  assert.deepEqual(parseAvatarPath(`${UID}/avatar-1.jpg`), { kind: 'photo', path: `${UID}/avatar-1.jpg` });
  assert.equal(findPreset('nope'), null);
});

test('avatarObjectPath gives a storage path only for a real photo, never for a preset, an unknown preset or nothing', () => {
  assert.equal(avatarObjectPath('preset:taco'), null);
  assert.equal(avatarObjectPath('preset:nope'), null);
  assert.equal(avatarObjectPath(null), null);
  assert.equal(avatarObjectPath('  '), null);
  assert.equal(avatarObjectPath(`${UID}/avatar-1.jpg`), `${UID}/avatar-1.jpg`);
});

test('signed avatar URLs: one hour, cached 50 minutes, keyed by object path', () => {
  assert.equal(AVATAR_SIGNED_URL_SECONDS, 3600);
  assert.equal(AVATAR_URL_STALE_MS, 50 * 60 * 1000);
  assert.ok(AVATAR_URL_STALE_MS < AVATAR_SIGNED_URL_SECONDS * 1000);
  assert.deepEqual(avatarUrlKey(`${UID}/avatar-1.jpg`), ['avatar-url', `${UID}/avatar-1.jpg`]);
  assert.notDeepEqual(avatarUrlKey(`${UID}/avatar-1.jpg`), avatarUrlKey(`${UID}/avatar-2.jpg`));
});

test('newAvatarPath is <uid>/avatar-<ts>.jpg and counts as the own path', () => {
  const path = newAvatarPath(UID, 1760000000000);
  assert.equal(path, `${UID}/avatar-1760000000000.jpg`);
  assert.ok(isOwnStoragePath(path, UID));
});

test('isOwnStoragePath refuses presets, other folders, traversal and empties', () => {
  assert.equal(isOwnStoragePath('preset:taco', UID), false);
  assert.equal(isOwnStoragePath('someone-else/avatar-1.jpg', UID), false);
  assert.equal(isOwnStoragePath(`${UID}/../x/avatar.jpg`, UID), false);
  assert.equal(isOwnStoragePath(null, UID), false);
  assert.equal(isOwnStoragePath(`${UID}/a.jpg`, ''), false);
});

test('initialFor uses the name, then the email, then a question mark', () => {
  assert.equal(initialFor(' dana', 'x@y.z'), 'D');
  assert.equal(initialFor('', 'sam@y.z'), 'S');
  assert.equal(initialFor('', ''), '?');
});
