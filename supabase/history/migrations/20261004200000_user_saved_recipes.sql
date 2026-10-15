-- Per-user saved recipes (bookmarks) — kitchen imports, creator videos, TheMealDB classics.

create table if not exists public.user_saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ref_key text not null,
  source_type text not null check (source_type in ('kitchen', 'creator_video', 'mealdb')),
  kitchen_recipe_id uuid references public.recipes (id) on delete set null,
  creator_video_id text,
  creator_watch_url text,
  mealdb_id text,
  title text not null,
  image_url text,
  preview jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create index if not exists user_saved_recipes_user_created_idx
  on public.user_saved_recipes (user_id, created_at desc);

alter table public.user_saved_recipes enable row level security;

drop policy if exists user_saved_recipes_owner on public.user_saved_recipes;
create policy user_saved_recipes_owner on public.user_saved_recipes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
