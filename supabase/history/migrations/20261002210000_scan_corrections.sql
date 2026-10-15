-- Pantry scan correction feedback (text-only rows + optional opt-in training photos).

-- ---------------------------------------------------------------------------
-- Correction log (no user_id column — insert-only for members, admin read)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'scan_correction_kind') then
    create type public.scan_correction_kind as enum ('rename', 'removed', 'added');
  end if;
end $$;

create table if not exists public.scan_corrections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  scan_id text not null,
  kind public.scan_correction_kind not null,
  ai_name text,
  user_name text,
  storage_location text,
  model text,
  training_photo_path text
);

create index if not exists scan_corrections_created_at_idx on public.scan_corrections (created_at desc);
create index if not exists scan_corrections_scan_id_idx on public.scan_corrections (scan_id);
create index if not exists scan_corrections_kind_idx on public.scan_corrections (kind);

comment on table public.scan_corrections is
  'Anonymous pantry scan feedback: renames, false-positive removals, and manual adds. Linked to opt-in training photos via scan_id.';

alter table public.scan_corrections enable row level security;

drop policy if exists scan_corrections_insert_authenticated on public.scan_corrections;
create policy scan_corrections_insert_authenticated on public.scan_corrections
  for insert
  to authenticated
  with check (true);

drop policy if exists scan_corrections_admin_select on public.scan_corrections;
create policy scan_corrections_admin_select on public.scan_corrections
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.scan_corrections from anon;
grant insert on public.scan_corrections to authenticated;
grant select on public.scan_corrections to authenticated;

-- ---------------------------------------------------------------------------
-- Admin summary (aggregates only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_scan_corrections_summary(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'days', greatest(p_days, 1),
    'counts', (
      select coalesce(jsonb_object_agg(kind::text, cnt), '{}'::jsonb)
      from (
        select kind, count(*)::bigint as cnt
        from public.scan_corrections
        where created_at >= since
        group by kind
      ) s
    ),
    'top_renames', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select ai_name, user_name, count(*)::bigint as count
        from public.scan_corrections
        where created_at >= since
          and kind = 'rename'
          and ai_name is not null
          and user_name is not null
        group by ai_name, user_name
        order by count(*) desc
        limit 12
      ) t
    ),
    'training_photo_scans', (
      select count(distinct scan_id)::bigint
      from public.scan_corrections
      where created_at >= since
        and training_photo_path is not null
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_scan_corrections_summary(int) from public;
grant execute on function public.admin_scan_corrections_summary(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Private training photos (opt-in; admin read only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scan-training',
  'scan-training',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists scan_training_insert_own on storage.objects;
create policy scan_training_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'scan-training'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists scan_training_admin_select on storage.objects;
create policy scan_training_admin_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'scan-training'
    and public.is_admin()
  );
