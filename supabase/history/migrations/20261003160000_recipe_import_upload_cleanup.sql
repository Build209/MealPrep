-- Recipe import uploads: allow scan photos + document optional pg_cron orphan cleanup.

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

-- Orphan cleanup: the recipe-import edge function deletes stale objects under each
-- user's prefix on every import call (objects older than ~1 hour). Optional hourly
-- pg_cron (requires pg_cron + service role storage access), paste if enabled:
--
-- select cron.schedule(
--   'recipe-import-upload-orphans',
--   '0 * * * *',
--   $$
--   delete from storage.objects
--   where bucket_id = 'recipe-import-uploads'
--     and created_at < now() - interval '1 hour';
--   $$
-- );
