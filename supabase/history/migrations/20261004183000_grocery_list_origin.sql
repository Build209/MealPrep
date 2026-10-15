-- Track how each grocery row was added so meal-plan rebuild only replaces plan-generated lines.
alter table public.grocery_list_items
  add column if not exists origin text not null default 'plan';

alter table public.grocery_list_items
  drop constraint if exists grocery_list_items_origin_check;

alter table public.grocery_list_items
  add constraint grocery_list_items_origin_check
  check (origin in ('plan', 'add_missing', 'manual'));

update public.grocery_list_items
set origin = 'manual'
where origin = 'plan' and ingredient_id like 'manual-%';
