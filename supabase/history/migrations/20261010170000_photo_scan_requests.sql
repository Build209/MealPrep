-- Photo scans in progress and just finished, so the same request sent twice is one scan.
--
-- A phone browser resends a scan request when its connection drops while the scan is still running
-- (opening the camera for the next photo is enough). Each request to the pantry-vision Edge
-- Function runs in its own worker with its own memory, so the two requests can only find each
-- other here. The first request takes the row and writes its answer to it; the repeat waits for
-- that answer instead of calling the AI model and using up a second scan.
--
-- A row holds the answer of one scan (the item list the app is about to show) for a short time.
-- Rows are deleted an hour after they are created. No photo is stored here.

create table if not exists public.photo_scan_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  request_key text not null,
  status text not null default 'running' check (status in ('running', 'done')),
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (user_id, request_key)
);

comment on table public.photo_scan_requests is
  'Scans in progress or just finished, per account and photo. Written only by the pantry-vision function; rows live at most an hour.';

create index if not exists photo_scan_requests_created_at_idx on public.photo_scan_requests (created_at);

-- No policies: the app never reads this table. Only the Edge Function (service role) does.
alter table public.photo_scan_requests enable row level security;
revoke all on public.photo_scan_requests from anon, authenticated;
grant select, insert, update, delete on public.photo_scan_requests to service_role;

-- Called at the start of a scan and again while waiting. Returns:
--   {"state":"started"}             this request runs the scan (first one, or the earlier one died)
--   {"state":"running"}             another request is scanning this photo: wait and ask again
--   {"state":"done","result":{...}} the answer of a scan of this photo finished in the last p_reuse_seconds
create or replace function public.begin_photo_scan_request(
  p_user_id uuid,
  p_key text,
  p_stale_seconds integer,
  p_reuse_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.photo_scan_requests%rowtype;
  v_inserted integer;
begin
  if p_user_id is null or p_key is null or p_key = '' then
    return jsonb_build_object('state', 'started');
  end if;

  -- Housekeeping: nothing is kept longer than an hour.
  delete from public.photo_scan_requests where created_at < now() - interval '1 hour';

  insert into public.photo_scan_requests (user_id, request_key)
  values (p_user_id, p_key)
  on conflict (user_id, request_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    return jsonb_build_object('state', 'started');
  end if;

  select * into v_row
    from public.photo_scan_requests
   where user_id = p_user_id and request_key = p_key
     for update;

  if not found then
    -- The other request failed and removed its row between the two statements: take over.
    insert into public.photo_scan_requests (user_id, request_key)
    values (p_user_id, p_key)
    on conflict (user_id, request_key) do nothing;
    return jsonb_build_object('state', 'started');
  end if;

  if v_row.status = 'done' then
    if v_row.finished_at > now() - make_interval(secs => greatest(coalesce(p_reuse_seconds, 0), 0)) then
      return jsonb_build_object('state', 'done', 'result', v_row.result);
    end if;
    -- An old answer: scan again.
    update public.photo_scan_requests
       set status = 'running', result = null, created_at = now(), finished_at = null
     where user_id = p_user_id and request_key = p_key;
    return jsonb_build_object('state', 'started');
  end if;

  if v_row.created_at < now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 0), 1)) then
    -- The request that took the row never finished (worker stopped): take over.
    update public.photo_scan_requests
       set created_at = now()
     where user_id = p_user_id and request_key = p_key;
    return jsonb_build_object('state', 'started');
  end if;

  return jsonb_build_object('state', 'running');
end;
$$;

-- The scan finished: keep its answer for a repeat of the same request. A null result means the
-- scan failed or was refused: the row is removed so the next request runs on its own.
create or replace function public.finish_photo_scan_request(p_user_id uuid, p_key text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_result is null then
    delete from public.photo_scan_requests
     where user_id = p_user_id and request_key = p_key and status = 'running';
  else
    update public.photo_scan_requests
       set status = 'done', result = p_result, finished_at = now()
     where user_id = p_user_id and request_key = p_key;
  end if;
end;
$$;

revoke all on function public.begin_photo_scan_request(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_photo_scan_request(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.begin_photo_scan_request(uuid, text, integer, integer) to service_role;
grant execute on function public.finish_photo_scan_request(uuid, text, jsonb) to service_role;
