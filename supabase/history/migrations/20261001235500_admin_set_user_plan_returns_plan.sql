-- PostgREST clients handle a scalar return more reliably than void for admin_set_user_plan.

create or replace function public.admin_set_user_plan(p_user_id uuid, p_plan public.user_plan)
returns public.user_plan
language plpgsql
security definer
set search_path = public
as $$
declare
  applied public.user_plan;
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

  select p.plan into applied from public.profiles p where p.id = p_user_id;
  return applied;
end;
$$;

revoke all on function public.admin_set_user_plan(uuid, public.user_plan) from public;
grant execute on function public.admin_set_user_plan(uuid, public.user_plan) to authenticated;
