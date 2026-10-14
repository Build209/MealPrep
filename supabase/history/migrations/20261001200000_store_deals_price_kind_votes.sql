-- Price kind (regular vs sale) + block voting on your own reported prices.

alter table public.store_deals
  add column if not exists price_kind text not null default 'regular'
  check (price_kind in ('regular', 'sale'));

drop policy if exists store_deal_votes_write on public.store_deal_votes;

drop policy if exists store_deal_votes_insert on public.store_deal_votes;
create policy store_deal_votes_insert on public.store_deal_votes
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.store_deals d
      where d.id = deal_id and d.reported_by = auth.uid()
    )
  );

drop policy if exists store_deal_votes_update on public.store_deal_votes;
create policy store_deal_votes_update on public.store_deal_votes
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.store_deals d
      where d.id = deal_id and d.reported_by = auth.uid()
    )
  );

drop policy if exists store_deal_votes_delete on public.store_deal_votes;
create policy store_deal_votes_delete on public.store_deal_votes
  for delete using (auth.uid() = user_id);
