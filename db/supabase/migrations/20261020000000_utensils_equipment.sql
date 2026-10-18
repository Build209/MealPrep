-- Utensils: equipment picker and smart recipe matching (additive only).
--
-- ON LIVE since 2026-10-17 (applied by the manager session on the owner's say-so, as the two live
-- migrations `utensils_equipment_schema` 20261017085237 and `utensils_equipment_seed` 20261017085249).
-- This file is those two statements joined, so CI tests what is live. Do NOT apply it to live again.
-- Nothing here changes existing rows; no recipe is tagged yet and no app code uses these tables yet.
--
-- Notes (not live behaviour):
-- - Brand names (Instant Pot, Crock-Pot) appear only in `aliases` (what people type). Display wording
--   stays neutral until compliance clears the labels (rule 5).
-- - The swap qualities and the air fryer rule of thumb are provisional and untested with real food.

create table public.equipment (
  slug text primary key,
  name text not null,
  category text not null check (category in ('heat','pots_pans','tools','eating')),
  aliases text[] not null default '{}',
  provides text[] not null default '{}',
  sort_order int not null default 0
);
alter table public.equipment enable row level security;
create policy equipment_read on public.equipment for select to anon, authenticated using (true);

create table public.user_equipment (
  user_id uuid not null references public.profiles(id) on delete cascade,
  equipment_slug text not null references public.equipment(slug) on delete cascade,
  source text not null default 'picked' check (source in ('picked','typed')),
  created_at timestamptz not null default now(),
  primary key (user_id, equipment_slug)
);
create index user_equipment_slug_idx on public.user_equipment (equipment_slug);
alter table public.user_equipment enable row level security;
create policy user_equipment_own on public.user_equipment for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Null means the person never answered the picker: show everything, no filtering.
alter table public.profiles add column equipment_set_at timestamptz;

create table public.equipment_swaps (
  needs text not null references public.equipment(slug) on delete cascade,
  can_use text not null references public.equipment(slug) on delete cascade,
  quality text not null check (quality in ('good','ok','poor')),
  note text,
  primary key (needs, can_use)
);
create index equipment_swaps_can_use_idx on public.equipment_swaps (can_use);
alter table public.equipment_swaps enable row level security;
create policy equipment_swaps_read on public.equipment_swaps for select to anon, authenticated using (true);

-- Typed-in gear, counted with no user attached; written only by a server function.
create table public.equipment_requests (
  id bigint generated always as identity primary key,
  raw_text text not null unique check (char_length(raw_text) between 2 and 60 and raw_text = lower(btrim(raw_text))),
  matched_slug text references public.equipment(slug) on delete set null,
  times_seen int not null default 1,
  first_seen timestamptz not null default now()
);
create index equipment_requests_matched_idx on public.equipment_requests (matched_slug);
alter table public.equipment_requests enable row level security;

-- Gear tags on recipes. Empty array with null tagged_at means untagged.
alter table public.library_recipes
  add column equipment_required text[] not null default '{}',
  add column equipment_tagged_at timestamptz,
  add column equipment_tag_source text check (equipment_tag_source in ('keyword','ai','manual'));
alter table public.recipes
  add column equipment_required text[] not null default '{}',
  add column equipment_tagged_at timestamptz,
  add column equipment_tag_source text check (equipment_tag_source in ('keyword','ai','manual'));
create index library_recipes_equipment_gin on public.library_recipes using gin (equipment_required);
create index recipes_equipment_gin on public.recipes using gin (equipment_required);

-- Adapted versions of recipes (shared, reviewed before users see them).
create table public.recipe_adaptations (
  id bigint generated always as identity primary key,
  library_recipe_id uuid references public.library_recipes(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  for_equipment text not null references public.equipment(slug),
  steps jsonb not null,
  note text,
  model text,
  status text not null default 'draft' check (status in ('draft','approved')),
  created_at timestamptz not null default now(),
  check ((library_recipe_id is null) <> (recipe_id is null)),
  unique nulls not distinct (library_recipe_id, recipe_id, for_equipment)
);
create index recipe_adaptations_lib_idx on public.recipe_adaptations (library_recipe_id);
create index recipe_adaptations_recipe_idx on public.recipe_adaptations (recipe_id);
create index recipe_adaptations_equipment_idx on public.recipe_adaptations (for_equipment);
alter table public.recipe_adaptations enable row level security;
create policy recipe_adaptations_read on public.recipe_adaptations for select to authenticated using (status = 'approved');

-- Reference data only.
insert into public.equipment (slug, name, category, aliases, provides, sort_order) values
('oven','Oven','heat','{"conventional oven","range oven"}','{"dry_heat","bake","roast","broil"}',1),
('stovetop','Stovetop','heat','{"stove","stove top","range","cooktop"}','{"stovetop_heat","boil","simmer","fry"}',2),
('microwave','Microwave','heat','{"microwave oven"}','{"microwave"}',3),
('air_fryer','Air fryer','heat','{"airfryer","air-fryer"}','{"dry_heat","roast","crisp"}',4),
('grill','Grill','heat','{"bbq","barbecue","barbeque"}','{"grill_heat"}',5),
('smoker','Smoker','heat','{"meat smoker"}','{"smoke"}',6),
('slow_cooker','Slow cooker','heat','{"crock pot","crock-pot","crockpot"}','{"slow_cook"}',7),
('pressure_cooker','Pressure cooker','heat','{"instant pot","instapot","insta pot","multicooker","multi cooker"}','{"pressure_cook"}',8),
('toaster_oven','Toaster oven','heat','{"countertop oven"}','{"dry_heat","toast"}',9),
('rice_cooker','Rice cooker','heat','{"rice maker"}','{"steam","rice"}',10),
('skillet','Skillet','pots_pans','{"frying pan","fry pan","cast iron","cast iron skillet"}','{"pan_fry"}',11),
('saucepan','Saucepan','pots_pans','{"sauce pan"}','{"simmer"}',12),
('stockpot','Stockpot','pots_pans','{"stock pot","soup pot","large pot"}','{"boil","simmer"}',13),
('dutch_oven','Dutch oven','pots_pans','{"cocotte"}','{"braise"}',14),
('sheet_pan','Sheet pan','pots_pans','{"baking sheet","cookie sheet","baking tray"}','{"sheet_pan_roast"}',15),
('baking_dish','Baking dish','pots_pans','{"casserole dish","baking pan","9x13"}','{"bake"}',16),
('wok','Wok','pots_pans','{"stir fry pan"}','{"stir_fry"}',17),
('griddle','Griddle','pots_pans','{"flat top","flat-top"}','{"griddle"}',18),
('chef_knife','Chef''s knife','tools','{"knife","knives","kitchen knife"}','{"cut"}',19),
('cutting_board','Cutting board','tools','{"chopping board"}','{"cut"}',20),
('whisk','Whisk','tools','{"whisks"}','{"whisk"}',21),
('tongs','Tongs','tools','{"tong"}','{"turn"}',22),
('blender','Blender','tools','{"smoothie blender"}','{"blend"}',23),
('food_processor','Food processor','tools','{"processor"}','{"blend","chop"}',24),
('stand_mixer','Stand mixer','tools','{"mixer"}','{"mix"}',25),
('fork','Forks','eating','{"fork"}','{"eat"}',26),
('chopsticks','Chopsticks','eating','{"chop sticks"}','{"eat"}',27),
('bowls','Bowls','eating','{"bowl"}','{"eat"}',28);

-- Starting swap rules. Qualities are provisional until tested with real food.
insert into public.equipment_swaps (needs, can_use, quality, note) values
('oven','air_fryer','good','Good for roasting and small batches; poor for cakes and bread. Untested rule of thumb: slightly lower heat, shorter time.'),
('oven','toaster_oven','good','Smaller space; watch batch size.'),
('sheet_pan','air_fryer','ok','Smaller batches.'),
('slow_cooker','pressure_cooker','good','Use the slow-cook setting, or shorten the time under pressure.'),
('pressure_cooker','slow_cooker','ok','Takes much longer.'),
('skillet','wok','good',null),
('wok','skillet','good',null),
('blender','food_processor','ok','Thin liquids may need smaller batches.');
