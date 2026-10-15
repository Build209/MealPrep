-- Scan photo retention (#260), recorded here so db/ matches live.
-- Applied to live on 2026-10-14 with the owner's yes (as migration scan_photo_retention), after the
-- scan-photo-retention function was deployed and its secret set (function secret + vault
-- scan_retention_secret). Test call on live: 200 {"ok":true,"removed":0}.
-- Same SQL as mobile/supabase/migrations/20261013030000_scan_photo_retention.sql (history copy).
--
-- Scan photo retention: delete scan photos older than 30 days, as the privacy page promises.
--
-- Supabase blocks DELETE on storage.objects from SQL (trigger storage.protect_delete), so the old
-- commented recipe in 20261001220000_scan_photos_storage.sql cannot work. Instead:
--   1. list_expired_scan_photos() lists expired objects (service role only).
--   2. The edge function `scan-photo-retention` removes them through the Storage API.
--   3. pg_cron calls that function once a day.
--
-- Before applying: deploy `scan-photo-retention`, set its SCAN_RETENTION_SECRET, and add the same
-- value to the vault as `scan_retention_secret`. Without the vault secret the job runs and is refused
-- (401); nothing is deleted. Safe to rerun.

create or replace function public.list_expired_scan_photos(p_days integer default 30, p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'scan-photos'
    and o.created_at < now() - make_interval(days => greatest(p_days, 30))
  order by o.created_at
  limit least(greatest(p_limit, 1), 1000);
$$;

comment on function public.list_expired_scan_photos(integer, integer) is
  'Scan photos past the retention window (never less than 30 days). Called only by the scan-photo-retention function.';

revoke all on function public.list_expired_scan_photos(integer, integer) from public, anon, authenticated;
grant execute on function public.list_expired_scan_photos(integer, integer) to service_role;

-- Daily job. On live this ran as: create extension if not exists pg_cron / pg_net, unschedule any
-- old job, then cron.schedule below. Guarded here (like the baseline's jobs) so a bare Postgres in
-- tests, which has no pg_cron, skips it. The job reads its URL and secret from Vault at run time;
-- on a local database those entries are absent and the call is refused (nothing deleted).
do $do$
declare
  existing_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'scan_photo_retention: pg_cron missing, daily job skipped';
    return;
  end if;

  select jobid into existing_job_id from cron.job where jobname = 'scan-photos-retention-daily' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  -- 10:23 UTC is 3:23 am Pacific (2:23 am in winter).
  perform cron.schedule(
    'scan-photos-retention-daily',
    '23 10 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_project_url' limit 1)
        || '/functions/v1/scan-photo-retention',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-retention-secret', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'scan_retention_secret' limit 1),
          ''
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
    $job$
  );
end
$do$;
