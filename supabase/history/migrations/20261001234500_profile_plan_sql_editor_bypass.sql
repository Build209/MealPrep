-- SQL Editor / service_role may change profiles.plan and profiles.role on UPDATE when auth.uid() is null.
-- Signup (handle_new_user) runs with auth.uid() null: do not bypass role checks on INSERT.
-- New profiles always start on plan free; paid tier is set via admin or SQL Editor UPDATE only.

create or replace function public.enforce_profile_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.plan := 'free';
    return new;
  end if;

  if tg_op = 'UPDATE' and new.plan is distinct from old.plan then
    if auth.uid() is null then
      return new;
    end if;
    if not public.is_admin() then
      raise exception 'Only admins can change subscription plans';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_plan_change on public.profiles;
create trigger enforce_profile_plan_change
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_plan_change();

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

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if auth.uid() is null then
      return new;
    end if;
    if not public.is_admin() then
      raise exception 'Only admins can change user roles';
    end if;
  end if;

  return new;
end;
$$;
