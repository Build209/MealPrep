-- Private scan photos (pantry + shelf-tag) with per-user storage paths (idempotent).

-- ---------------------------------------------------------------------------
-- DB columns (optional path on saved records)
-- ---------------------------------------------------------------------------
alter table public.pantry_items
  add column if not exists scan_photo_path text;

alter table public.store_deals
  add column if not exists scan_photo_path text;

comment on column public.pantry_items.scan_photo_path is
  'Storage object path under bucket scan-photos, e.g. <uid>/pantry/<ts>.jpg';
comment on column public.store_deals.scan_photo_path is
  'Storage object path under bucket scan-photos, e.g. <uid>/price-tag/<ts>.jpg';

-- ---------------------------------------------------------------------------
-- Storage bucket (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scan-photos',
  'scan-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- RLS: authenticated users only their own folder (first path segment = auth.uid())
-- Admins have no cross-user access (no admin policies here).
-- ---------------------------------------------------------------------------
drop policy if exists scan_photos_insert_own on storage.objects;
create policy scan_photos_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'scan-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists scan_photos_select_own on storage.objects;
create policy scan_photos_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'scan-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists scan_photos_delete_own on storage.objects;
create policy scan_photos_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'scan-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Retention (~30 days): run on a schedule with the service role (Dashboard → Cron or pg_cron).
-- Safe to rerun; only deletes objects older than the retention window.
--
--   delete from storage.objects
--   where bucket_id = 'scan-photos'
--     and created_at < now() - interval '30 days';
--
-- Orphan cleanup (optional, after retention): clear DB paths that no longer have objects.
-- ---------------------------------------------------------------------------
