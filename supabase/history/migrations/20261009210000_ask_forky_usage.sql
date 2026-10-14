-- Ask Forky (AI chat): per-user message allowance and token log.
--
-- One row per user per period. Plus accounts use the calendar month ('2026-10'); free accounts use
-- a single lifetime row ('free'). The ask-forky Edge Function claims a message BEFORE it calls the
-- AI model, so an account can never run up more calls than its allowance, and writes token counts
-- afterwards so the real cost per message can be measured.
--
-- Nothing here stores the questions or answers. Chat text is not kept on the server.

create table if not exists public.forky_chat_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,
  messages integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

comment on table public.forky_chat_usage is
  'Ask Forky allowance and token counts per user per period. Written only by the ask-forky function.';

alter table public.forky_chat_usage enable row level security;

drop policy if exists forky_chat_usage_select_own on public.forky_chat_usage;
create policy forky_chat_usage_select_own on public.forky_chat_usage
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.forky_chat_usage from anon, authenticated;
grant select on public.forky_chat_usage to authenticated;
grant select, insert, update, delete on public.forky_chat_usage to service_role;

-- Takes one message from the allowance. Returns how many are left afterwards, or -1 when the
-- allowance is already used up (nothing is taken in that case). Safe under concurrent calls.
create or replace function public.claim_forky_message(p_user_id uuid, p_period text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
  return p_limit - v_messages;
end;
$$;

-- Called after the model answers (token counts) or fails (p_refund gives the message back).
create or replace function public.settle_forky_message(
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
  update public.forky_chat_usage
     set messages = case when p_refund then greatest(messages - 1, 0) else messages end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
$$;

revoke all on function public.claim_forky_message(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.settle_forky_message(uuid, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.claim_forky_message(uuid, text, integer) to service_role;
grant execute on function public.settle_forky_message(uuid, text, integer, integer, boolean) to service_role;

-- Off until the owner turns it on in Admin. Admin accounts can try it while it is off.
insert into public.feature_flags (key, enabled)
values ('askForky', false)
on conflict (key) do nothing;
