-- YouTube attribution metadata (30-day refresh policy) + TikTok/Instagram source types.

alter table public.recipes
  add column if not exists source_channel_name text,
  add column if not exists source_metadata_refreshed_at timestamptz;

alter table public.recipes drop constraint if exists recipes_source_type_check;

alter table public.recipes
  add constraint recipes_source_type_check
  check (
    source_type is null
    or source_type in ('youtube', 'web', 'tiktok', 'instagram')
  );
