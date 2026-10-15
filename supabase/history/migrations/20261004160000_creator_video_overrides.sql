-- Manual hide/show overrides for cached creator videos (service-role writes only).

create table if not exists public.creator_video_overrides (
  video_id text primary key,
  action text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_video_overrides_action_check check (action in ('hide', 'show'))
);

create index if not exists creator_video_overrides_action_idx
  on public.creator_video_overrides (action);

alter table public.creator_video_overrides enable row level security;

revoke all on table public.creator_video_overrides from anon, authenticated;
grant select, insert, update, delete on table public.creator_video_overrides to service_role;
