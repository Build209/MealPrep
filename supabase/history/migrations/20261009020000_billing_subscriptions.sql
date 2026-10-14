-- Paywall step 2: where Stripe subscription state lives, and how it drives profiles.plan.
--
-- profiles.plan stays the single flag the app and pantry-vision read. From here on it is
-- DERIVED: 'paid' when an admin has comped the account (plan_comp) or a live Stripe
-- subscription exists, otherwise 'free'. Nothing writes plan directly except
-- recompute_user_plan().
--
-- Billing rows are kept when an account is deleted (user link is cleared, not the row):
-- consumer and tax rules require subscription and consent records to outlive the account.
-- They hold Stripe ids, prices and dates only. No card data, no kitchen data.
--
-- Idempotent. Not applied automatically; run against the project with the owner's approval.

-- 1. Manual grants ------------------------------------------------------------------------

alter table public.profiles
  add column if not exists plan_comp boolean not null default false;

comment on column public.profiles.plan_comp is
  'Admin-granted Plus (comp). Survives Stripe cancellations. Set only via admin_set_user_plan.';

-- 2. Stripe state (service role writes; a user may read their own subscription row) ---------

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text,
  price_id text,
  billing_interval text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_subscriptions is
  'One row per Stripe customer. status is Stripe''s subscription status. Written by stripe-webhook.';

create index if not exists billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);

alter table public.billing_subscriptions enable row level security;
revoke all on public.billing_subscriptions from public, anon, authenticated;
grant select on public.billing_subscriptions to authenticated;
-- Explicit, so the webhook works even if default privileges differ on this project.
grant select, insert, update, delete on public.billing_subscriptions to service_role;

drop policy if exists billing_subscriptions_select_self on public.billing_subscriptions;
create policy billing_subscriptions_select_self on public.billing_subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

-- What the customer agreed to at checkout. Kept at least 3 years (California automatic
-- renewal law); never exposed to clients.
create table if not exists public.billing_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text not null unique,
  price_id text,
  billing_interval text,
  amount_cents integer,
  currency text,
  terms_version text,
  disclosure_version text,
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.billing_consents is
  'Proof of consent to automatic renewal: price, period and wording version agreed at checkout.';

alter table public.billing_consents enable row level security;
revoke all on public.billing_consents from public, anon, authenticated;
-- Explicit, so the webhook works even if default privileges differ on this project.
grant select, insert, update, delete on public.billing_consents to service_role;

-- Webhook idempotency log.
create table if not exists public.stripe_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;
-- Explicit, so the webhook works even if default privileges differ on this project.
grant select, insert, update, delete on public.stripe_events to service_role;

-- 3. Users can never change plan or plan_comp on their own row -----------------------------

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
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.plan is distinct from old.plan or new.plan_comp is distinct from old.plan_comp) then
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

-- 4. The one place that derives the flag ---------------------------------------------------

create or replace function public.recompute_user_plan(p_user_id uuid)
returns public.user_plan
language plpgsql
security definer
set search_path = public
as $$
declare
  applied public.user_plan;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  update public.profiles p
  set plan = case
    when p.plan_comp
      or exists (
        select 1
        from public.billing_subscriptions b
        where b.user_id = p.id
          -- past_due keeps Plus while Stripe retries the card; canceled / unpaid end it.
          and b.status in ('active', 'trialing', 'past_due')
      )
    then 'paid'::public.user_plan
    else 'free'::public.user_plan
  end
  where p.id = p_user_id
  returning p.plan into applied;

  return applied;
end;
$$;

revoke all on function public.recompute_user_plan(uuid) from public, anon, authenticated;
grant execute on function public.recompute_user_plan(uuid) to service_role;

-- 5. Admin screen: "Plus" now means a comp; "Free" removes the comp ------------------------
-- Returns the plan actually in effect, which stays 'paid' if the user also has a live
-- subscription.

create or replace function public.admin_set_user_plan(p_user_id uuid, p_plan public.user_plan)
returns public.user_plan
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
  set plan_comp = (p_plan = 'paid')
  where id = p_user_id;

  if not found then
    raise exception 'profile not found';
  end if;

  return public.recompute_user_plan(p_user_id);
end;
$$;

revoke all on function public.admin_set_user_plan(uuid, public.user_plan) from public, anon;
grant execute on function public.admin_set_user_plan(uuid, public.user_plan) to authenticated;

-- 6. Existing Plus accounts become comps --------------------------------------------------
-- Everyone on 'paid' before Stripe exists got it by hand or by the old default. Keeping them
-- as comps means the first recompute does not silently downgrade them. Review the list in the
-- admin screen and set any non-testers to Free. Safe to re-run: no subscription rows exist
-- before the first checkout, and afterwards paid-by-Stripe users are excluded.

update public.profiles p
set plan_comp = true
where p.plan = 'paid'
  and not p.plan_comp
  and not exists (
    select 1 from public.billing_subscriptions b where b.user_id = p.id
  );
