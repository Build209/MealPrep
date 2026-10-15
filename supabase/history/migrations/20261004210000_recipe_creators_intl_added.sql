-- Allow 'intl_added' creator source and add 8 international creators.
alter table public.recipe_creators drop constraint if exists recipe_creators_source_check;
alter table public.recipe_creators add constraint recipe_creators_source_check check (
  source is null or source in ('top25', 'below_cutoff', 'david_pick', 'intl_added')
);

insert into public.recipe_creators (
  youtube_channel_id, display_name, handle, channel_url, subscriber_count, total_views,
  avg_views, avg_likes, rank, fit, source, enabled, notes
) values
  ('UCgpnjdjVpDEFtp1EtmPyLzQ', 'RecipeTin Eats (Nagi Maehashi)', '@RecipeTinEats', 'https://www.youtube.com/@RecipeTinEats', 835000, 275724536, 36585, 531, null, 'High', 'intl_added', true, 'weeknight dinners with complete written recipes, posted almost daily'),
  ('UCqRdvREgI2qLnKtiMfswzZQ', 'Chef Jack Ovens', '@ChefJackOvens', 'https://www.youtube.com/@ChefJackOvens', 1660000, 179681355, 70546, 1240, null, 'High', 'intl_added', true, 'meal prep, budget and dinner focus with exact quantities'),
  ('UC0alwLbzL_MzSRfV-eQTALw', 'Kitchen Sanctuary', '@Kitchensanctuary', 'https://www.youtube.com/@Kitchensanctuary', 520000, 91156995, 22572, 707, null, 'High', 'intl_added', true, 'quick dinner recipes with written ingredients (smaller reach)'),
  ('UCy_iF2lqOucgmK1BLCl-6vQ', 'Recipe30 (Joel Mielle)', '@recipe30', 'https://www.youtube.com/@recipe30', 1650000, 228643490, 66094, 1997, null, 'Medium/High', 'intl_added', true, 'dinner focus with written recipes, but ingredients aren''t in the description'),
  ('UC19OYOBqkgVqgTIQxbsPdlw', 'ThatDudeCanCook (Sonny Hurrell)', '@thatdudecancook', 'https://www.youtube.com/@thatdudecancook', 2520000, 844502928, 234266, 6706, null, 'Medium/High', 'intl_added', true, 'strong engagement and dinner recipes, but written ingredients are inconsistent'),
  ('UCsU15yvILBmnHPeAf4SFVaQ', 'Glen And Friends Cooking', '@GlenAndFriendsCooking', 'https://www.youtube.com/@GlenAndFriendsCooking', 671000, 125596480, 32509, 2430, null, 'Medium/High', 'intl_added', true, 'budget and ''use what you have'' dinners with written method; smaller reach but very high like ratio'),
  ('UCpSgg_ECBj25s9moCDfSTsA', 'Jamie Oliver', '@jamieoliver', 'https://www.youtube.com/@jamieoliver', 6220000, 1105267979, 47929, 504, null, 'Medium', 'intl_added', true, 'quick-meal focus and huge catalog, but no written ingredients on YouTube'),
  ('UCqNkn5PNeSqbQTAR5RP-L-Q', 'Andy Cooks (Andy Hearnden)', '@andy_cooks', 'https://www.youtube.com/@andy_cooks', 6320000, 3807441399, 566064, 6708, null, 'Medium', 'intl_added', true, 'big engagement and dinner recipes, but a pro-chef lens and recipes off-platform')
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
