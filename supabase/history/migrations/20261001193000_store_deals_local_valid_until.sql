-- Community deals: let the app filter valid_until in the user's local timezone.
-- (UTC current_date in RLS hid deals after ~5 PM Pacific on the last valid day.)

drop policy if exists store_deals_read on public.store_deals;
create policy store_deals_read on public.store_deals
  for select using (auth.role() = 'authenticated');

-- Reporters cannot vote on their own deals (confirm / expired).

drop policy if exists store_deal_votes_write on public.store_deal_votes;
create policy store_deal_votes_insert on public.store_deal_votes
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.store_deals d
      where d.id = deal_id and d.reported_by = auth.uid()
    )
  );

create policy store_deal_votes_update on public.store_deal_votes
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.store_deals d
      where d.id = deal_id and d.reported_by = auth.uid()
    )
  );

create policy store_deal_votes_delete on public.store_deal_votes
  for delete using (auth.uid() = user_id);
