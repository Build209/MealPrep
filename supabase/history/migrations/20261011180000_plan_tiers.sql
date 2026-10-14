-- Plan tiers (Plus, Pro, Family) and a monthly recipe-import allowance.
--
-- profiles.plan stays the paid/free switch that every screen and function already reads.
-- profiles.plan_tier says WHICH paid tier: 'plus', 'pro' or 'family'. It only means something
-- while plan = 'paid', and it is derived the same way plan is: from the live Stripe subscription
-- (stripe-webhook stores the tier it reads from the price's lookup key). An account an admin has
-- comped is Plus. Nothing but recompute_user_plan() and an admin may change it.
--
-- The monthly limits per tier are not in the database: they live in
-- supabase/functions/_shared/planTiers.ts and are printed in the terms.
--
-- Additive and idempotent. No existing row changes its plan: every account already on 'paid'
-- becomes tier 'plus'. Not applied automatically; run against the project with the owner's
-- approval, BEFORE deploying stripe-webhook, stripe-checkout, pantry-vision, ask-forky and
-- recipe-import from the same pull request (they also work before it, treating paid as Plus).

-- 1. Which paid tier ----------------------------------------------------------------------

alter table public.profiles
  add column if not exists plan_tier text not null default 'plus';

alter table public.profiles drop constraint if exists profiles_plan_tier_check;
alter table public.profiles
  add constraint profiles_plan_tier_check check (plan_tier in ('plus', 'pro', 'family'));

comment on column public.profiles.plan_tier is
  'Which paid tier (plus, pro, family). Only meaningful while plan = paid. Derived by recompute_user_plan(); users cannot change it.';

alter table public.billing_subscriptions
  add column if not exists plan_tier text;

alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_plan_tier_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_plan_tier_check
  check (plan_tier is null or plan_tier in ('plus', 'pro', 'family'));

comment on column public.billing_subscriptions.plan_tier is
  'Tier of the subscribed price, from its Stripe lookup key (plus_monthly, pro_yearly, ...). Null for rows written before tiers existed: treated as plus.';

-- 2. Users can never change plan, plan_comp or plan_tier on their own row -------------------

create or replace function public.enforce_profile_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sign-up and any other insert always starts free and un-comped, whatever the caller sent.
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.plan_comp := false;
    new.plan_tier := 'plus';
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.plan is distinct from old.plan
          or new.plan_comp is distinct from old.plan_comp
          or new.plan_tier is distinct from old.plan_tier) then
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

revoke all on function public.enforce_profile_plan_change() from public, anon, authenticated;

-- 3. The one place that derives plan and plan_tier ------------------------------------------
-- plan:      'paid' when comped or a live subscription exists, otherwise 'free' (unchanged).
-- plan_tier: the highest tier among live subscriptions; with none it is 'plus'. A comp is
--            therefore always Plus, and a tier never outlives the subscription that paid for it.

create or replace function public.recompute_user_plan(p_user_id uuid)
returns public.user_plan
language plpgsql
security definer
set search_path = public
as $$
declare
  applied public.user_plan;
  live_tier text;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  select coalesce(b.plan_tier, 'plus')
    into live_tier
    from public.billing_subscriptions b
   where b.user_id = p_user_id
     -- past_due keeps the plan while Stripe retries the card; canceled / unpaid end it.
     and b.status in ('active', 'trialing', 'past_due')
   order by case coalesce(b.plan_tier, 'plus') when 'family' then 3 when 'pro' then 2 else 1 end desc
   limit 1;

  update public.profiles p
  set plan = case
        when p.plan_comp or live_tier is not null then 'paid'::public.user_plan
        else 'free'::public.user_plan
      end,
      plan_tier = coalesce(live_tier, 'plus')
  where p.id = p_user_id
  returning p.plan into applied;

  return applied;
end;
$$;

revoke all on function public.recompute_user_plan(uuid) from public, anon, authenticated;
grant execute on function public.recompute_user_plan(uuid) to service_role;

-- 4. Recipe imports: per-user monthly allowance -----------------------------------------------
-- One row per user per calendar month ('2026-10', UTC). The recipe-import Edge Function claims
-- an import BEFORE it calls the AI model and gives it back when no recipe came out of it.
-- Nothing here stores links, recipe text, photos or anything read from them.

create table if not exists public.recipe_import_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,
  imports integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

comment on table public.recipe_import_usage is
  'Recipe import allowance: a count per user per month. Written only by the recipe-import function.';

alter table public.recipe_import_usage enable row level security;

-- A signed-in user can read their own count (the app shows how many imports are left).
drop policy if exists recipe_import_usage_select_own on public.recipe_import_usage;
create policy recipe_import_usage_select_own on public.recipe_import_usage
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.recipe_import_usage from public, anon, authenticated;
grant select on public.recipe_import_usage to authenticated;
grant select, insert, update, delete on public.recipe_import_usage to service_role;

-- Takes one import from the allowance. Returns how many are left afterwards, or -1 when the
-- allowance is already used up (nothing is taken in that case). Safe under concurrent calls.
create or replace function public.claim_recipe_import(p_user_id uuid, p_period text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imports integer;
begin
  if p_user_id is null or p_period is null or p_limit is null or p_limit <= 0 then
    return -1;
  end if;

  insert into public.recipe_import_usage (user_id, period, imports)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  update public.recipe_import_usage
     set imports = imports + 1,
         updated_at = now()
   where user_id = p_user_id
     and period = p_period
     and imports < p_limit
  returning imports into v_imports;

  if v_imports is null then
    return -1;
  end if;
  return p_limit - v_imports;
end;
$$;

-- Gives one import back (the request produced no recipe, or was answered from the cache).
create or replace function public.refund_recipe_import(p_user_id uuid, p_period text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.recipe_import_usage
     set imports = greatest(imports - 1, 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
$$;

revoke all on function public.claim_recipe_import(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.refund_recipe_import(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_recipe_import(uuid, text, integer) to service_role;
grant execute on function public.refund_recipe_import(uuid, text) to service_role;
