-- Import from anywhere: facebook + photo/video source types, temporary import uploads bucket.

alter table public.recipes drop constraint if exists recipes_source_type_check;

alter table public.recipes
  add constraint recipes_source_type_check
  check (
    source_type is null
    or source_type in ('youtube', 'web', 'tiktok', 'instagram', 'facebook', 'photo', 'video')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-import-uploads',
  'recipe-import-uploads',
  false,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists recipe_import_uploads_insert_own on storage.objects;
create policy recipe_import_uploads_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recipe-import-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recipe_import_uploads_select_own on storage.objects;
create policy recipe_import_uploads_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-import-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists recipe_import_uploads_delete_own on storage.objects;
create policy recipe_import_uploads_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recipe-import-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
