-- Rebuild spec v1, section 4: a daily cap on paid plans, next to the monthly limits.
--
-- NOT APPLIED TO LIVE. Needs the owner's yes AND compliance review (it changes what a paid plan
-- includes; terms update needed, rule 11). Local stacks (CI, `supabase start`) run it.
--
-- Per day (resets at midnight America/Los_Angeles). Monthly limits are unchanged.
--
--   Per day     Plus  Pro  Family
--   Scans          5    8      15
--   Imports        3    5     10
--   Ask Forky      8   15     25
--
-- Free accounts have no daily cap (their monthly allowance is already small). Admin accounts
-- (profiles.role = 'admin') get the Family caps, as ask-forky already treats an admin as Family.
-- Comped accounts follow their plan_tier (recompute_user_plan sets plan = 'paid' for them).
-- Price-tag scans (photo_scan_usage period '<month>|tag', a v2 feature) are not capped daily.
--
-- How it works WITHOUT redeploying the edge functions: the deployed functions keep calling the
-- same claim_* / settle_* / refund_* functions with the same arguments. This file replaces their
-- bodies (same signatures, security definer, search_path and grants as live):
--   - claim_photo_scan / claim_recipe_import / claim_forky_message take the monthly use first (as
--     before), then one use from today's row in public.daily_usage. If today's cap is reached
--     the monthly use is put back in the same transaction and the function returns -2.
--     The deployed functions treat any negative number as "refused" (pantry-vision and
--     recipe-import: remaining < 0; ask-forky: remaining < 0), so -2 refuses with no redeploy.
--     -1 still means "monthly limit reached / bad input". A success still returns what is left
--     of the MONTH, as before, so the app's "N of M left this month" stays right.
--   - settle_photo_scan / settle_forky_message (p_refund = true) and refund_recipe_import also give
--     back one use from today's row.
--   Lock order is always month row, then day row (claims and refunds), so they cannot deadlock.
--
-- Known gap until the functions are changed: a daily refusal shows the MONTHLY message
-- ("You have used all N photo scans for this month. They reset on the 1st." / "No questions left
-- this month." / "You have used all N recipe imports for this month."). Follow-up (not done
-- here): in pantry-vision, recipe-import and ask-forky, treat -2 as a daily refusal with its own
-- wording and code (e.g. DAILY_LIMIT_REACHED, "back at midnight Pacific").
--
-- Known edge: a use claimed just before midnight Pacific and refunded just after it is given
-- back to the new day (never below 0). Worst case one extra use that day.

create table public.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('scan', 'import', 'forky')),
  day date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);

comment on table public.daily_usage is
  'Daily cap counters (rebuild spec section 4): uses per account, kind and Pacific day. Written only by the claim_*, settle_* and refund_* allowance functions; users read their own rows.';

alter table public.daily_usage enable row level security;

create policy daily_usage_select_own on public.daily_usage as permissive for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.daily_usage from public, anon, authenticated;
grant select on public.daily_usage to authenticated;
grant all on public.daily_usage to service_role;

-- Today's cap for an account and kind; null = no daily cap (free account, or no profile).
-- Internal helper: called only from the allowance functions below (which run as their owner).
create or replace function public.daily_cap_for(p_user_id uuid, p_kind text)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case p_kind
           when 'scan' then case t.tier when 'plus' then 5 when 'pro' then 8 when 'family' then 15 end
           when 'import' then case t.tier when 'plus' then 3 when 'pro' then 5 when 'family' then 10 end
           when 'forky' then case t.tier when 'plus' then 8 when 'pro' then 15 when 'family' then 25 end
         end
    from (
      select case
               when p.role = 'admin' then 'family'
               when p.plan = 'paid' then
                 -- Same rule as tierForProfile(): a paid account with no known tier is Plus.
                 case when p.plan_tier in ('plus', 'pro', 'family') then p.plan_tier else 'plus' end
             end as tier
        from public.profiles p
       where p.id = p_user_id
    ) t;
$$;

-- Takes one use from today's (Pacific) row. Every account is counted; only capped accounts can be
-- refused. Returns false when today's cap is already reached.
create or replace function public.take_daily_use(p_user_id uuid, p_kind text)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_day date := (now() at time zone 'America/Los_Angeles')::date;
  v_cap integer := public.daily_cap_for(p_user_id, p_kind);
  v_used integer;
begin
  insert into public.daily_usage (user_id, kind, day, used)
  values (p_user_id, p_kind, v_day, 0)
  on conflict (user_id, kind, day) do nothing;

  update public.daily_usage
     set used = used + 1,
         updated_at = now()
   where user_id = p_user_id
     and kind = p_kind
     and day = v_day
     and (v_cap is null or used < v_cap)
  returning used into v_used;

  return v_used is not null;
end;
$$;

-- Gives one use back to today's (Pacific) row, never below 0.
create or replace function public.give_back_daily_use(p_user_id uuid, p_kind text)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.daily_usage
     set used = greatest(used - 1, 0),
         updated_at = now()
   where user_id = p_user_id
     and kind = p_kind
     and day = (now() at time zone 'America/Los_Angeles')::date;
$$;

-- Internal only: no client role may call the helpers (Supabase grants EXECUTE to anon and
-- authenticated on new functions by default).
revoke all on function public.daily_cap_for(uuid, text) from public, anon, authenticated;
revoke all on function public.take_daily_use(uuid, text) from public, anon, authenticated;
revoke all on function public.give_back_daily_use(uuid, text) from public, anon, authenticated;

-- The six allowance functions: same signatures, SECURITY DEFINER and search_path as live.
-- CREATE OR REPLACE keeps their grants (service_role only).

CREATE OR REPLACE FUNCTION public.claim_photo_scan(p_user_id uuid, p_period text, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scans integer;
begin
  if p_user_id is null or p_period is null or p_limit is null or p_limit <= 0 then
    return -1;
  end if;

  insert into public.photo_scan_usage (user_id, period, scans)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  update public.photo_scan_usage
     set scans = scans + 1,
         updated_at = now()
   where user_id = p_user_id
     and period = p_period
     and scans < p_limit
  returning scans into v_scans;

  if v_scans is null then
    return -1;
  end if;

  -- Daily cap (price-tag scans, period '<month>|tag', are not capped daily).
  if p_period not like '%|tag' and not public.take_daily_use(p_user_id, 'scan') then
    update public.photo_scan_usage
       set scans = greatest(scans - 1, 0),
           updated_at = now()
     where user_id = p_user_id
       and period = p_period;
    return -2;
  end if;

  return p_limit - v_scans;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_recipe_import(p_user_id uuid, p_period text, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not public.take_daily_use(p_user_id, 'import') then
    update public.recipe_import_usage
       set imports = greatest(imports - 1, 0),
           updated_at = now()
     where user_id = p_user_id
       and period = p_period;
    return -2;
  end if;

  return p_limit - v_imports;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_forky_message(p_user_id uuid, p_period text, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_messages integer;
begin
  if p_user_id is null or p_period is null or p_limit is null or p_limit <= 0 then
    return -1;
  end if;

  insert into public.forky_chat_usage (user_id, period, messages)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  update public.forky_chat_usage
     set messages = messages + 1,
         updated_at = now()
   where user_id = p_user_id
     and period = p_period
     and messages < p_limit
  returning messages into v_messages;

  if v_messages is null then
    return -1;
  end if;

  if not public.take_daily_use(p_user_id, 'forky') then
    update public.forky_chat_usage
       set messages = greatest(messages - 1, 0),
           updated_at = now()
     where user_id = p_user_id
       and period = p_period;
    return -2;
  end if;

  return p_limit - v_messages;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_photo_scan(p_user_id uuid, p_period text, p_input_tokens integer, p_output_tokens integer, p_refund boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.photo_scan_usage
     set scans = case when p_refund then greatest(scans - 1, 0) else scans end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
  -- A refunded scan also goes back to today's count (price tags are not counted daily).
  select public.give_back_daily_use(p_user_id, 'scan')
   where p_refund and p_period not like '%|tag';
$function$
;

CREATE OR REPLACE FUNCTION public.settle_forky_message(p_user_id uuid, p_period text, p_input_tokens integer, p_output_tokens integer, p_refund boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.forky_chat_usage
     set messages = case when p_refund then greatest(messages - 1, 0) else messages end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
  select public.give_back_daily_use(p_user_id, 'forky')
   where p_refund and p_period is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_recipe_import(p_user_id uuid, p_period text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.recipe_import_usage
     set imports = greatest(imports - 1, 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
  select public.give_back_daily_use(p_user_id, 'import')
   where p_period is not null;
$function$
;
