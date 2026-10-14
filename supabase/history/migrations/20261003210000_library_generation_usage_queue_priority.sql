-- Token usage tracking + varied queue processing order for library generation.

alter table public.library_recipes
  add column if not exists generation_usage jsonb;

comment on column public.library_recipes.generation_usage is
  'Gemini author/critic/image usageMetadata and estimated USD cost per generation run.';

alter table public.library_dish_queue
  add column if not exists priority integer not null default (floor(random() * 1000000))::integer;

-- Reshuffle existing rows so early batches are not strictly alphabetical.
update public.library_dish_queue
set priority = (floor(random() * 1000000))::integer;

drop index if exists public.library_dish_queue_status_idx;
create index if not exists library_dish_queue_status_priority_idx
  on public.library_dish_queue (status, priority);
