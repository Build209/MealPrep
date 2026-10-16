import { expect, test } from '@playwright/test';
import { adminClient, freshEmail, localUrl, userClient } from './local-supabase';

/**
 * The avatars bucket is private (migration 20261018000000_avatars_private.sql, applied by
 * `supabase start` here). API only, no browser: the owner's signed URL works, the plain public
 * address is refused, and another signed-in person cannot sign or read the object.
 */
const password = 'e2e-Avatar-Private-123';
// Tiny payload; the bucket checks the declared content type, not the bytes.
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

async function signedIn(label: string) {
  const email = freshEmail(label);
  const created = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const client = userClient();
  const signed = await client.auth.signInWithPassword({ email, password });
  expect(signed.error).toBeNull();
  return { client, userId: created.data.user!.id };
}

test('avatars: bucket is private, owner gets a signed URL, public URL and other people are refused', async () => {
  const owner = await signedIn('avatar-private-owner');
  const other = await signedIn('avatar-private-other');
  const path = `${owner.userId}/avatar-${Date.now()}.jpg`;

  const bucket = await adminClient().storage.getBucket('avatars');
  expect(bucket.data?.public).toBe(false);

  const up = await owner.client.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg' });
  expect(up.error).toBeNull();

  const signed = await owner.client.storage.from('avatars').createSignedUrl(path, 3600);
  expect(signed.error).toBeNull();
  const ok = await fetch(signed.data!.signedUrl);
  expect(ok.status).toBe(200);

  const publicUrl = `${localUrl().replace(/\/+$/, '')}/storage/v1/object/public/avatars/${path}`;
  const refused = await fetch(publicUrl);
  expect(refused.ok).toBe(false);

  const otherSign = await other.client.storage.from('avatars').createSignedUrl(path, 3600);
  expect(otherSign.data?.signedUrl ?? null).toBeNull();
  const otherRead = await other.client.storage.from('avatars').download(path);
  expect(otherRead.error).not.toBeNull();

  await owner.client.storage.from('avatars').remove([path]);
});
