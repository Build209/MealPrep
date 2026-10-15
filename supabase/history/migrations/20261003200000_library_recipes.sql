-- MealPlanatic shared recipe library (original Gemini-authored recipes + queue).

create table if not exists public.library_recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  dish_name text not null,
  servings int not null default 4 check (servings >= 1),
  prep_minutes int,
  cook_minutes int,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  cuisine text,
  image_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'rejected')),
  review_notes text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists library_recipes_status_created_idx
  on public.library_recipes (status, created_at desc);

create table if not exists public.library_dish_queue (
  dish_name text primary key,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text
);

create index if not exists library_dish_queue_status_idx
  on public.library_dish_queue (status, dish_name);

alter table public.library_recipes enable row level security;
alter table public.library_dish_queue enable row level security;

drop policy if exists library_recipes_read_published on public.library_recipes;
create policy library_recipes_read_published on public.library_recipes
  for select
  to anon, authenticated
  using (status = 'published');

-- No insert/update/delete policies: clients cannot write (service role bypasses RLS).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-recipe-images',
  'library-recipe-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists library_recipe_images_select on storage.objects;
create policy library_recipe_images_select on storage.objects
  for select
  to public
  using (bucket_id = 'library-recipe-images');
