-- Link grocery rows to scheduled meal plan entries (day / slot grouping in the app).
alter table public.grocery_list_items
  add column if not exists planned_meal_links jsonb not null default '[]'::jsonb;
