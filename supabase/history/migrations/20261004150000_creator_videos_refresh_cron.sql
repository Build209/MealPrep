-- Schedule creator-videos refresh (~every 12h) via pg_cron + pg_net.
-- Admin auth: store CREATOR_ADMIN_SECRET in Vault (never paste into this file).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Replace job if this migration is re-applied.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'creator-videos-refresh-12h'
  limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'creator-videos-refresh-12h',
  '0 */12 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'supabase_project_url'
      limit 1
    ) || '/functions/v1/creator-videos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
        ''
      ),
      'x-creator-admin-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'creator_admin_secret'
        limit 1
      )
    ),
    body := '{"action":"refresh"}'::jsonb
  ) as request_id;
  $$
);
