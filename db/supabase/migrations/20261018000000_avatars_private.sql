-- Private avatars: the `avatars` storage bucket stops being public. A person can read only the
-- files in their own <uid>/ folder, and the app shows them through signed URLs
-- (supabase.storage.from('avatars').createSignedUrl, see app/src/data/avatarUrl.ts).
--
-- NOT on live. Owner approval needed before live (charter: any live database change needs the
-- owner's yes). Ship order: merge the app change first (it works with a public or private
-- bucket), then apply this. Once applied, every old public avatar link
-- (/storage/v1/object/public/avatars/...) stops working.
--
-- ROLLBACK (run by hand if needed):
--   update storage.buckets set public = true where id = 'avatars';
--   drop policy if exists avatars_select_own on storage.objects;
--   create policy avatars_select_public on storage.objects as permissive for select to public
--     using (bucket_id = 'avatars'::text);
--
-- Existing state (baseline 20261013000000_live_baseline.sql): bucket public = true, and
-- policy avatars_select_public (SELECT to public, bucket_id = 'avatars'). The insert, update
-- and delete policies (avatars_insert_own / avatars_update_own / avatars_delete_own) are
-- unchanged. No later migration touches the avatars bucket.
--
-- The auth call is wrapped as (select auth.uid()) so Postgres evaluates it once per query,
-- the same pattern as 20261017000000_rls_perf.sql.

update storage.buckets set public = false where id = 'avatars';

-- Remove the policy that let anyone (including anon) list and read every avatar.
drop policy if exists avatars_select_public on storage.objects;

-- Signed URLs are created by the signed-in owner, so creating one needs SELECT on the object.
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects as permissive for select to authenticated
  using (bucket_id = 'avatars'::text and (storage.foldername(name))[1] = (select auth.uid())::text);
