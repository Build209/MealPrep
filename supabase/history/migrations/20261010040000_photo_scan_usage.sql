-- Photo scans (pantry shelves, receipts, shelf price tags): per-user allowance and token log.
--
-- One row per user per period:
--   '2026-10'      Plus: shelf and receipt scans in that calendar month (UTC)
--   '2026-10|tag'  Plus: shelf price-tag scans in that month (small, cheap calls; counted apart)
--   'free'         free plan: one-time shelf scans for the life of the account
--
-- The pantry-vision Edge Function claims a scan BEFORE it calls the AI model, so an account can
-- never run up more scans than its allowance, gives the scan back if the model call fails, and
-- writes token counts afterwards so the real cost per scan can be measured.
--
-- Nothing here stores photos, item names or anything read from a photo.

create table if not exists public.photo_scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,
  scans integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

comment on table public.photo_scan_usage is
  'Photo scan allowance and token counts per user per period. Written only by the pantry-vision function.';

alter table public.photo_scan_usage enable row level security;

-- A signed-in user can read their own counts (the app shows how many free scans are left).
drop policy if exists photo_scan_usage_select_own on public.photo_scan_usage;
create policy photo_scan_usage_select_own on public.photo_scan_usage
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.photo_scan_usage from anon, authenticated;
grant select on public.photo_scan_usage to authenticated;
grant select, insert, update, delete on public.photo_scan_usage to service_role;

-- Takes one scan from the allowance. Returns how many are left afterwards, or -1 when the
-- allowance is already used up (nothing is taken in that case). Safe under concurrent calls.
create or replace function public.claim_photo_scan(p_user_id uuid, p_period text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
  return p_limit - v_scans;
end;
$$;

-- Called after the model answers (token counts) or fails (p_refund gives the scan back).
create or replace function public.settle_photo_scan(
  p_user_id uuid,
  p_period text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_refund boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.photo_scan_usage
     set scans = case when p_refund then greatest(scans - 1, 0) else scans end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
$$;

revoke all on function public.claim_photo_scan(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.settle_photo_scan(uuid, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.claim_photo_scan(uuid, text, integer) to service_role;
grant execute on function public.settle_photo_scan(uuid, text, integer, integer, boolean) to service_role;
