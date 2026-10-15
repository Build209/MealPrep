-- Let reporters read (and delete via existing policy) their own expired deals.

drop policy if exists store_deals_read on public.store_deals;
create policy store_deals_read on public.store_deals
  for select using (
    auth.role() = 'authenticated'
    and (
      valid_until is null
      or valid_until >= current_date
      or auth.uid() = reported_by
    )
  );
