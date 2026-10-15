-- Scheduled meal calendar dates + optional slot (idempotent)

alter table public.meal_plan_items
  add column if not exists scheduled_on date;

alter table public.meal_plan_items
  add column if not exists meal_slot text;

alter table public.meal_plan_items
  drop constraint if exists meal_plan_items_meal_slot_check;

alter table public.meal_plan_items
  add constraint meal_plan_items_meal_slot_check
  check (meal_slot is null or meal_slot in ('breakfast', 'lunch', 'dinner', 'snack'));

create index if not exists meal_plan_items_user_scheduled_on_idx
  on public.meal_plan_items (user_id, scheduled_on);

alter table public.meal_plan_items
  add column if not exists leftover_of_id uuid;

alter table public.meal_plan_items
  add column if not exists linked_leftover_id uuid;

create index if not exists meal_plan_items_leftover_of_id_idx
  on public.meal_plan_items (leftover_of_id)
  where leftover_of_id is not null;
