-- New accounts must start on the free plan, and the payment backend must be able to change plans.
--
-- Live drift this corrects (checked 2026-10-08):
--   * profiles.plan defaulted to 'paid', so every new sign-up got MealPlanatic Plus for free.
--   * enforce_profile_plan_change only ran on UPDATE and had no service-role path, so a payment
--     webhook (service role, auth.uid() is null) could not change a plan.
--
-- Existing rows are NOT changed: anyone already on 'paid' stays on 'paid'.
-- Idempotent. Does not touch enforce_profile_role_change.

alter table public.profiles alter column plan set default 'free';

create or replace function public.enforce_profile_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sign-up and any other insert always starts free, whatever the caller sent.
  if tg_op = 'INSERT' then
    new.plan := 'free';
    return new;
  end if;

  if tg_op = 'UPDATE' and new.plan is distinct from old.plan then
    -- Service role / SQL editor (no end-user session). Signed-out API callers cannot reach
    -- this: there is no anon UPDATE policy on profiles.
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

-- Trigger functions are not callable through the API (matches the function lockdown).
revoke all on function public.enforce_profile_plan_change() from public, anon, authenticated;
