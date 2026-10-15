-- 209 Meal Prep — idempotent Supabase setup (paste into SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS where needed.

do $$
begin
  create type public.user_role as enum ('admin', 'member');
exception
  when duplicate_object then null;
end $$;

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
  origin text not null default 'plan' check (origin in ('plan', 'add_missing', 'manual')),
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

-- Block self-promotion via the client; SQL Editor / service role (auth.uid() is null) may change roles.
create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS policies (drop + recreate for idempotency)
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profiles_admin_all on public.profiles;

drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags
  for select using (auth.role() = 'authenticated');

drop policy if exists feature_flags_admin_write on public.feature_flags;
create policy feature_flags_admin_write on public.feature_flags
  for all using (public.is_admin());

drop policy if exists pantry_owner on public.pantry_items;
create policy pantry_owner on public.pantry_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists pantry_admin_read on public.pantry_items;
drop policy if exists pantry_admin_write on public.pantry_items;

drop policy if exists recipes_read on public.recipes;
create policy recipes_read on public.recipes
  for select
  to authenticated
  using (
    auth.role() = 'authenticated'
    and (is_master or created_by = auth.uid())
  );

drop policy if exists recipes_admin_write on public.recipes;
drop policy if exists recipes_admin_master_all on public.recipes;
create policy recipes_admin_master_all on public.recipes
  for all
  to authenticated
  using (public.is_admin() and is_master)
  with check (public.is_admin() and is_master);

drop policy if exists recipes_user_insert on public.recipes;
create policy recipes_user_insert on public.recipes
  for insert
  with check (auth.uid() = created_by and is_master = false);

drop policy if exists recipes_user_update on public.recipes;
create policy recipes_user_update on public.recipes
  for update
  using (auth.uid() = created_by and is_master = false)
  with check (auth.uid() = created_by and is_master = false);

drop policy if exists recipes_user_delete on public.recipes;
create policy recipes_user_delete on public.recipes
  for delete
  using (auth.uid() = created_by and is_master = false);

drop policy if exists grocery_owner on public.grocery_list_items;
create policy grocery_owner on public.grocery_list_items
  for all using (auth.uid() = user_id);

-- Optional global feature-flag defaults (matches mobile/app config keys)
insert into public.feature_flags (key, enabled) values
  ('photoScan', true),
  ('grocerySync', true),
  ('maintenanceMode', false),
  ('recipeMasterEdit', true)
on conflict (key) do nothing;

-- Optional master recipe catalog seed (slug matches demo IDs in the mobile app)
insert into public.recipes (slug, name, tag, description, servings, minutes, calories, protein, is_master, ingredients, steps)
values
  (
    'brisket',
    'Smoked Lean Brisket & Sweet Potato',
    'Signature Smoked',
    'Slow-smoked brisket with roasted sweet potato and green beans.',
    4, 45, 520, 45, true,
    '[{"ingredientId":"brisket-meat","name":"Smoked brisket","quantity":24,"unit":"oz"},{"ingredientId":"sweet-potato","name":"Sweet potato","quantity":2,"unit":"each"},{"ingredientId":"green-beans","name":"Green beans","quantity":12,"unit":"oz"}]'::jsonb,
    '["Prep vegetables","Reheat brisket","Plate and serve"]'::jsonb
  ),
  (
    'lemon-chicken',
    'Grilled Lemon Herb Chicken',
    'Lean & Clean',
    'Chicken over jasmine rice with garlic broccoli.',
    4, 35, 480, 42, true,
    '[{"ingredientId":"chicken-breast","name":"Chicken breast","quantity":24,"unit":"oz"},{"ingredientId":"jasmine-rice","name":"Jasmine rice","quantity":2,"unit":"cups"},{"ingredientId":"broccoli","name":"Broccoli","quantity":16,"unit":"oz"}]'::jsonb,
    '["Grill chicken","Steam rice","Sauté broccoli"]'::jsonb
  ),
  (
    'pulled-pork',
    'Pulled Pork Bowl',
    'Low Carb',
    'Pulled pork over cauliflower rice with cilantro-lime slaw.',
    4, 30, 440, 38, true,
    '[{"ingredientId":"pulled-pork","name":"Pulled pork","quantity":20,"unit":"oz"},{"ingredientId":"cauliflower-rice","name":"Cauliflower rice","quantity":4,"unit":"cups"},{"ingredientId":"lime","name":"Limes","quantity":2,"unit":"each"}]'::jsonb,
    '["Warm pork","Prepare slaw","Assemble bowls"]'::jsonb
  )
on conflict (slug) do nothing;

-- After you sign up once, promote your account to admin (run in SQL Editor):
-- update public.profiles set role = 'admin' where email = 'you@example.com';
