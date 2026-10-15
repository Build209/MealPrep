-- 209 Meal Prep — core schema + RLS (run in Supabase SQL editor or CLI)

create type public.user_role as enum ('admin', 'member');

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  role public.user_role not null default 'member',
  photo_url text,
  household_size int not null default 2,
  dietary_notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ingredient_id text not null,
  name text not null,
  category text not null,
  quantity numeric not null default 0,
  unit text not null,
  location text default '',
  photo_url text,
  expires_on date,
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  tag text default '',
  description text default '',
  servings int not null default 4,
  minutes int not null default 30,
  calories int not null default 0,
  protein int not null default 0,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  is_master boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ingredient_id text not null,
  name text not null,
  category text not null,
  quantity numeric not null,
  unit text not null,
  checked boolean not null default false,
  source_recipe_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.feature_flags enable row level security;
alter table public.pantry_items enable row level security;
alter table public.recipes enable row level security;
alter table public.grocery_list_items enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Profiles: users read/update self; admins read all
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id);

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin());

-- Feature flags: everyone reads; only admins write
create policy feature_flags_read on public.feature_flags
  for select using (auth.role() = 'authenticated');

create policy feature_flags_admin_write on public.feature_flags
  for all using (public.is_admin());

-- Pantry: owner CRUD; admins read all
create policy pantry_owner on public.pantry_items
  for all using (auth.uid() = user_id);

create policy pantry_admin_read on public.pantry_items
  for select using (public.is_admin());

-- Recipes: authenticated read; admins manage master catalog
create policy recipes_read on public.recipes
  for select using (auth.role() = 'authenticated');

create policy recipes_admin_write on public.recipes
  for all using (public.is_admin());

-- Grocery: owner CRUD
create policy grocery_owner on public.grocery_list_items
  for all using (auth.uid() = user_id);

-- Block self-promotion: role is stored on profiles and checked by is_admin(), not client JWT user_metadata.
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'admin' and not public.is_admin() then
      new.role := 'member';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change user roles';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_role_change on public.profiles;
create trigger enforce_profile_role_change
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role_change();

-- Sync role to JWT app_metadata on profile change (server-side only; clients must not trust JWT for authorization)
create or replace function public.sync_role_to_jwt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  after insert or update of role on public.profiles
  for each row execute function public.sync_role_to_jwt();
