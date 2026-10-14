-- Recipe privacy: a signed-in person reads master recipes and their own recipes only.
--
-- Before: policy recipes_read let every signed-in person read every row of public.recipes,
-- including other people's imported recipes. Both apps already filter to master + own in their
-- queries, so nothing on screen changes; this makes the database enforce it.
--
-- Admins keep full access through the existing recipes_admin_write policy (is_admin()).
-- Server functions using the service role are not affected (they bypass row level security).
-- Approved by the owner on 2026-10-14. Applied to live the same day.

drop policy if exists recipes_read on public.recipes;

create policy recipes_read on public.recipes as permissive for select to authenticated
  using (is_master or created_by = (select auth.uid()));
