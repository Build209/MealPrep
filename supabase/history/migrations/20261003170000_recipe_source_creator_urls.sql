-- Creator profile / channel URLs for imported recipes (attribution links in app UI).

alter table public.recipes
  add column if not exists source_channel_url text,
  add column if not exists source_author_url text;
