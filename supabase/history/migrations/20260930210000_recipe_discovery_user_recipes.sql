-- Allow members to save imported (non-master) recipes they own; keep master catalog admin-only.
-- Personal RecipeAPI imports use slug recipeapi-{id}--{user_id} in app code (global slug stays unique).

drop policy if exists recipes_read on public.recipes;
drop policy if exists recipes_user_insert on public.recipes;
drop policy if exists recipes_user_update on public.recipes;
drop policy if exists recipes_user_delete on public.recipes;

create policy recipes_read on public.recipes
  for select
  using (
    auth.role() = 'authenticated'
    and (
      is_master
      or created_by = auth.uid()
      or public.is_admin()
    )
  );

create policy recipes_user_insert on public.recipes
  for insert
  with check (
    auth.uid() = created_by
    and is_master = false
  );

create policy recipes_user_update on public.recipes
  for update
  using (auth.uid() = created_by and is_master = false)
  with check (auth.uid() = created_by and is_master = false);

create policy recipes_user_delete on public.recipes
  for delete
  using (auth.uid() = created_by and is_master = false);
