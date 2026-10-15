-- Idempotent fix: pantry INSERT/UPDATE must pass explicit WITH CHECK (owner + admin write).
-- Paste into Supabase SQL Editor if scan save fails with RLS or returns zero rows.

drop policy if exists pantry_owner on public.pantry_items;
create policy pantry_owner on public.pantry_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists pantry_admin_read on public.pantry_items;
create policy pantry_admin_read on public.pantry_items
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists pantry_admin_write on public.pantry_items;
create policy pantry_admin_write on public.pantry_items
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
