-- Add Old's Cool Kevmo (Chef Kevin Ashton) — david_pick creator.
insert into public.recipe_creators (
  youtube_channel_id,
  display_name,
  handle,
  channel_url,
  subscriber_count,
  total_views,
  avg_views,
  avg_likes,
  rank,
  fit,
  source,
  enabled,
  notes
) values (
  'UCx2cbCojhLK2QFIhwjNQYgA',
  'Old''s Cool Kevmo (Chef Kevin Ashton)',
  '@oldscoolkevmo',
  'https://www.youtube.com/@oldscoolkevmo',
  1660000,
  724570673,
  0,
  0,
  null,
  'High',
  'david_pick',
  true,
  'comfort-food and weeknight dinners; full recipes on kevmoskitchen.com (paid subscription — never imported)'
)
on conflict (youtube_channel_id) do update set
  display_name = excluded.display_name,
  handle = excluded.handle,
  channel_url = excluded.channel_url,
  subscriber_count = excluded.subscriber_count,
  total_views = excluded.total_views,
  avg_views = excluded.avg_views,
  avg_likes = excluded.avg_likes,
  rank = excluded.rank,
  fit = excluded.fit,
  source = excluded.source,
  enabled = excluded.enabled,
  notes = excluded.notes,
  updated_at = now();
