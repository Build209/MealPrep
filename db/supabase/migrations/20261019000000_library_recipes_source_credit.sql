-- Credit fields for library recipes taken from an outside source (e.g. Wikibooks Cookbook, CC BY-SA 4.0).
-- Additive and nullable: existing rows and the app keep working unchanged.
alter table public.library_recipes
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists license text;
