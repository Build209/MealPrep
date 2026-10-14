-- Per-user diet and allergy preferences (client rule-based recipe tagging).

create table if not exists public.user_diet_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  diets text[] not null default '{}',
  allergens text[] not null default '{}',
  dislikes text[] not null default '{}',
  hide_conflicts boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_diet_prefs enable row level security;

drop policy if exists user_diet_prefs_select on public.user_diet_prefs;
create policy user_diet_prefs_select on public.user_diet_prefs
  for select
  using (auth.uid() = user_id);

drop policy if exists user_diet_prefs_insert on public.user_diet_prefs;
create policy user_diet_prefs_insert on public.user_diet_prefs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_diet_prefs_update on public.user_diet_prefs;
create policy user_diet_prefs_update on public.user_diet_prefs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
