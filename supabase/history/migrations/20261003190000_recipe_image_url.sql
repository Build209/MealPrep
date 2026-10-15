-- Cover image URL for saved recipes (import thumbnails, og:image, etc.).

alter table public.recipes
  add column if not exists image_url text;
