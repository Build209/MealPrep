-- Meal plan made_at + profile grocery auto-add preference (idempotent)

alter table public.meal_plan_items
  add column if not exists made_at timestamptz;

alter table public.profiles
  add column if not exists auto_add_missing_to_grocery boolean not null default true;

-- Backfill made_at from legacy made flag when present
update public.meal_plan_items
set made_at = coalesce(made_at, added_at)
where made = true and made_at is null;
