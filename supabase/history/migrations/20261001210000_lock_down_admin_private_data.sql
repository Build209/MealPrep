-- Lock down admin cross-user access to private data (idempotent).
-- Keeps admin control of shared master recipes, feature flags, and moderating community deals.

-- ---------------------------------------------------------------------------
-- profiles: self-only read/update; role changes via SECURITY DEFINER RPC
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- pantry_items: owner only (remove admin read/write)
-- ---------------------------------------------------------------------------
drop policy if exists pantry_admin_read on public.pantry_items;
drop policy if exists pantry_admin_write on public.pantry_items;

drop policy if exists pantry_owner on public.pantry_items;
create policy pantry_owner on public.pantry_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_favorite_stores: owner only
-- ---------------------------------------------------------------------------
drop policy if exists user_favorite_stores_admin_read on public.user_favorite_stores;

-- ---------------------------------------------------------------------------
-- recipes: no admin blanket read of personal imports; master catalog admin CRUD
-- ---------------------------------------------------------------------------
drop policy if exists recipes_read on public.recipes;
create policy recipes_read on public.recipes
  for select
  to authenticated
  using (
    auth.role() = 'authenticated'
    and (
      is_master
      or created_by = auth.uid()
    )
  );

drop policy if exists recipes_admin_write on public.recipes;
drop policy if exists recipes_admin_master_all on public.recipes;
create policy recipes_admin_master_all on public.recipes
  for all
  to authenticated
  using (public.is_admin() and is_master)
  with check (public.is_admin() and is_master);

-- grocery_list_items, meal_plan_items: already owner-only (no admin policies)

-- ---------------------------------------------------------------------------
-- Admin analytics (aggregates only; no per-user rows or emails)
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'user_count', (select count(*)::bigint from public.profiles),
    'admin_count', (select count(*)::bigint from public.profiles where role = 'admin'),
    'member_count', (select count(*)::bigint from public.profiles where role = 'member'),
    'pantry_items_total', (select count(*)::bigint from public.pantry_items),
    'recipes_total', (select count(*)::bigint from public.recipes),
    'grocery_open_total', (
      select count(*)::bigint from public.grocery_list_items where checked = false
    ),
    'meal_plan_items_total', (select count(*)::bigint from public.meal_plan_items)
  );
end;
$$;

revoke all on function public.admin_analytics() from public;
grant execute on function public.admin_analytics() to authenticated;

-- Promote/demote without granting admins SELECT on all profiles
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user id required';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id;

  if not found then
    raise exception 'profile not found';
  end if;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, public.user_role) from public;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
