-- Account deletion: FK behavior + service-role RPC (idempotent).
-- Community deals stay published with reporter anonymized; personal data is removed.

-- ---------------------------------------------------------------------------
-- recipes.created_by — do not block profile/auth deletion
-- ---------------------------------------------------------------------------
alter table public.recipes drop constraint if exists recipes_created_by_fkey;
alter table public.recipes
  add constraint recipes_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- store_deals.reported_by — anonymize on user delete (keep shared price rows)
-- ---------------------------------------------------------------------------
alter table public.store_deals alter column reported_by drop not null;

alter table public.store_deals drop constraint if exists store_deals_reported_by_fkey;
alter table public.store_deals
  add constraint store_deals_reported_by_fkey
  foreign key (reported_by) references auth.users (id) on delete set null;

comment on column public.store_deals.reported_by is
  'Reporter auth user; null after account deletion (deal row may remain for the community).';

-- ---------------------------------------------------------------------------
-- Explicit pre-delete cleanup (service role). Storage is purged in Edge Function.
-- ---------------------------------------------------------------------------
drop function if exists public.delete_user_owned_data(uuid);

create or replace function public.delete_user_owned_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- Community: remove personal votes; keep deal rows but clear reporter link
  delete from public.store_deal_votes where user_id = p_user_id;
  update public.store_deals set reported_by = null where reported_by = p_user_id;

  -- Personal kitchen (also cascade when profiles row is removed; explicit for safety)
  delete from public.meal_plan_items where user_id = p_user_id;
  delete from public.pantry_items where user_id = p_user_id;
  delete from public.grocery_list_items where user_id = p_user_id;
  delete from public.user_favorite_stores where user_id = p_user_id;

  -- Non-master recipes owned by the user
  delete from public.recipes where created_by = p_user_id and is_master = false;

  delete from public.profiles where id = p_user_id;
end;
$$;

-- Supabase default privileges grant EXECUTE to anon/authenticated on new public functions.
revoke all on function public.delete_user_owned_data(uuid) from public;
revoke execute on function public.delete_user_owned_data(uuid) from anon, authenticated;
grant execute on function public.delete_user_owned_data(uuid) to service_role;
