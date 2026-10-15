-- Subscription plan tier per user (free vs paid). Idempotent.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_plan' and typnamespace = 'public'::regnamespace) then
    create type public.user_plan as enum ('free', 'paid');
  end if;
end
$$;

alter table public.profiles
  add column if not exists plan public.user_plan not null default 'free';

comment on column public.profiles.plan is 'Subscription tier: free or paid (MealPlanatic Plus). Changed by admins via RPC only.';

-- Block self-service plan changes (same pattern as role)
create or replace function public.enforce_profile_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.plan is distinct from old.plan and not public.is_admin() then
    raise exception 'Only admins can change subscription plans';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_plan_change on public.profiles;
create trigger enforce_profile_plan_change
  before update on public.profiles
  for each row execute function public.enforce_profile_plan_change();

create or replace function public.admin_set_user_plan(p_user_id uuid, p_plan public.user_plan)
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

  if p_plan is null then
    raise exception 'plan required';
  end if;

  update public.profiles
  set plan = p_plan
  where id = p_user_id;

  if not found then
    raise exception 'profile not found';
  end if;
end;
$$;

revoke all on function public.admin_set_user_plan(uuid, public.user_plan) from public;
grant execute on function public.admin_set_user_plan(uuid, public.user_plan) to authenticated;

create or replace function public.admin_lookup_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  name text,
  role public.user_role,
  plan public.user_plan
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'email required';
  end if;

  return query
    select p.id, p.email, p.name, p.role, p.plan
    from public.profiles p
    where lower(trim(p.email)) = lower(trim(p_email))
    order by p.created_at desc
    limit 10;
end;
$$;

revoke all on function public.admin_lookup_user_by_email(text) from public;
grant execute on function public.admin_lookup_user_by_email(text) to authenticated;
