-- Meal plan items per user

create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_slug text,
  recipe_api_id int,
  title text not null,
  image_url text,
  made boolean not null default false,
  added_at timestamptz not null default now(),
  constraint meal_plan_has_ref check (recipe_slug is not null or recipe_api_id is not null)
);

create index if not exists meal_plan_items_user_id_added_at_idx
  on public.meal_plan_items (user_id, added_at desc);

alter table public.meal_plan_items enable row level security;

create policy "meal_plan_select_own"
  on public.meal_plan_items for select
  using (auth.uid() = user_id);

create policy "meal_plan_insert_own"
  on public.meal_plan_items for insert
  with check (auth.uid() = user_id);

create policy "meal_plan_update_own"
  on public.meal_plan_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "meal_plan_delete_own"
  on public.meal_plan_items for delete
  using (auth.uid() = user_id);
