-- Community-reported store deals + confirm / expired votes (idempotent)

create table if not exists public.store_deals (
  id uuid primary key default gen_random_uuid(),
  store_key text not null,
  osm_store_id text,
  store_name text,
  item_name text not null,
  price numeric not null check (price >= 0),
  unit text,
  note text,
  valid_until date default (current_date + 7),
  reported_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists store_deals_store_key_idx on public.store_deals (store_key);
create index if not exists store_deals_valid_until_idx on public.store_deals (valid_until);

create table if not exists public.store_deal_votes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.store_deals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vote text not null check (vote in ('confirm', 'expired')),
  created_at timestamptz not null default now(),
  unique (deal_id, user_id)
);

create index if not exists store_deal_votes_deal_id_idx on public.store_deal_votes (deal_id);

alter table public.store_deals enable row level security;
alter table public.store_deal_votes enable row level security;

drop policy if exists store_deals_read on public.store_deals;
create policy store_deals_read on public.store_deals
  for select using (
    auth.role() = 'authenticated'
    and (valid_until is null or valid_until >= current_date)
  );

drop policy if exists store_deals_insert on public.store_deals;
create policy store_deals_insert on public.store_deals
  for insert with check (auth.uid() = reported_by);

drop policy if exists store_deals_update_own on public.store_deals;
create policy store_deals_update_own on public.store_deals
  for update using (auth.uid() = reported_by)
  with check (auth.uid() = reported_by);

drop policy if exists store_deals_delete_own on public.store_deals;
create policy store_deals_delete_own on public.store_deals
  for delete using (auth.uid() = reported_by);

drop policy if exists store_deals_admin_delete on public.store_deals;
create policy store_deals_admin_delete on public.store_deals
  for delete using (public.is_admin());

drop policy if exists store_deal_votes_read on public.store_deal_votes;
create policy store_deal_votes_read on public.store_deal_votes
  for select using (auth.role() = 'authenticated');

drop policy if exists store_deal_votes_write on public.store_deal_votes;
create policy store_deal_votes_write on public.store_deal_votes
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
