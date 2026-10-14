-- 209 Meal Prep — owner SQL bundle (paste entire file into Supabase SQL Editor once; safe to re-run)
-- Order: (1) kitchen catalog import, (2) recipe discovery RLS policies

-- 209 Meal Prep — kitchen catalog import (idempotent)
-- Paste into Supabase SQL Editor after setup.sql. Safe to re-run.
-- Adds carbs/fat columns and upserts all recipes from New/recipes.js RECIPE_CATALOG.

alter table public.recipes add column if not exists carbs int not null default 0;
alter table public.recipes add column if not exists fat int not null default 0;
alter table public.recipes add column if not exists nutrition_source text default '';
alter table public.recipes add column if not exists nutrition_citation text default '';
alter table public.recipes add column if not exists nutrition_sourced_at timestamptz;

insert into public.recipes (
  slug, name, tag, description, servings, minutes, calories, protein, carbs, fat,
  is_master, ingredients, steps
)
values
  (
    'brisket',
    'Smoked Lean Brisket & Sweet Potato',
    'Signature Smoked',
    'Slow-smoked sliced brisket served with roasted sweet potato wedges and steamed green beans.',
    4,
    45,
    520,
    45,
    38,
    18,
    true,
    '[{"ingredientId":"brisket-meat","name":"Smoked brisket","quantity":24,"unit":"oz"},{"ingredientId":"sweet-potato","name":"Sweet potato","quantity":2,"unit":"each"},{"ingredientId":"green-beans","name":"Green beans","quantity":12,"unit":"oz"}]'::jsonb,
    '["Prep vegetables","Reheat brisket","Plate and serve"]'::jsonb
  ),
  (
    'lemon-chicken',
    'Grilled Lemon Herb Chicken',
    'Lean & Clean',
    'Char-grilled chicken breast over Jasmine rice with garlic broccoli and citrus drizzle.',
    4,
    35,
    480,
    42,
    42,
    12,
    true,
    '[{"ingredientId":"chicken-breast","name":"Chicken breast","quantity":24,"unit":"oz"},{"ingredientId":"jasmine-rice","name":"Jasmine rice","quantity":2,"unit":"cups"},{"ingredientId":"broccoli","name":"Broccoli","quantity":16,"unit":"oz"}]'::jsonb,
    '["Grill chicken","Steam rice","Sauté broccoli"]'::jsonb
  ),
  (
    'pulled-pork',
    'Pulled Pork Bowl',
    'Low Carb',
    'Tender slow-smoked pulled pork served over seasoned cauliflower rice with cilantro-lime slaw.',
    4,
    30,
    440,
    38,
    22,
    20,
    true,
    '[{"ingredientId":"pulled-pork","name":"Pulled pork","quantity":20,"unit":"oz"},{"ingredientId":"cauliflower-rice","name":"Cauliflower rice","quantity":4,"unit":"cups"},{"ingredientId":"lime","name":"Limes","quantity":2,"unit":"each"}]'::jsonb,
    '["Warm pork","Prepare slaw","Assemble bowls"]'::jsonb
  ),
  (
    'turkey-rice',
    'Smoked Turkey & Wild Rice',
    'Signature Smoked',
    'Sliced smoked turkey breast with wild rice pilaf, roasted carrots, and a light herb gravy.',
    4,
    40,
    470,
    44,
    45,
    10,
    true,
    '[{"ingredientId":"turkey-breast","name":"Smoked turkey breast","quantity":24,"unit":"oz"},{"ingredientId":"wild-rice","name":"Wild rice blend","quantity":2,"unit":"cups"},{"ingredientId":"carrots","name":"Carrots","quantity":12,"unit":"oz"},{"ingredientId":"herb-gravy","name":"Light herb gravy","quantity":8,"unit":"oz"}]'::jsonb,
    '["Cook wild rice pilaf","Roast carrots","Slice turkey and plate with gravy"]'::jsonb
  ),
  (
    'chipotle-shrimp',
    'Chipotle Lime Shrimp',
    'Lean & Clean',
    'Chili-lime shrimp over cilantro rice with black beans, grilled corn, and avocado salsa.',
    4,
    35,
    430,
    36,
    48,
    12,
    true,
    '[{"ingredientId":"shrimp","name":"Shrimp","quantity":20,"unit":"oz"},{"ingredientId":"cilantro-rice","name":"Cilantro rice","quantity":2,"unit":"cups"},{"ingredientId":"black-beans","name":"Black beans","quantity":2,"unit":"cups"},{"ingredientId":"corn","name":"Grilled corn","quantity":2,"unit":"cups"},{"ingredientId":"avocado-salsa","name":"Avocado salsa","quantity":12,"unit":"oz"}]'::jsonb,
    '["Cook cilantro rice","Sauté shrimp with chipotle-lime","Assemble with beans, corn, and salsa"]'::jsonb
  ),
  (
    'herb-salmon',
    'Herb Salmon & Asparagus',
    'Lean & Clean',
    'Oven-finished salmon with garlic asparagus, lemon quinoa, and a dill yogurt sauce.',
    4,
    35,
    510,
    40,
    36,
    22,
    true,
    '[{"ingredientId":"salmon","name":"Salmon fillet","quantity":24,"unit":"oz"},{"ingredientId":"asparagus","name":"Asparagus","quantity":16,"unit":"oz"},{"ingredientId":"quinoa","name":"Lemon quinoa","quantity":2,"unit":"cups"},{"ingredientId":"dill-yogurt","name":"Dill yogurt sauce","quantity":8,"unit":"oz"}]'::jsonb,
    '["Roast salmon","Cook quinoa and asparagus","Finish with dill yogurt sauce"]'::jsonb
  ),
  (
    'steak-tips',
    'Steak Tips & Garlic Potatoes',
    'Signature Smoked',
    'Smoked sirloin tips with roasted garlic potatoes, green beans, and peppercorn jus.',
    4,
    45,
    560,
    46,
    40,
    24,
    true,
    '[{"ingredientId":"sirloin-tips","name":"Smoked sirloin tips","quantity":24,"unit":"oz"},{"ingredientId":"garlic-potatoes","name":"Roasted garlic potatoes","quantity":24,"unit":"oz"},{"ingredientId":"green-beans","name":"Green beans","quantity":12,"unit":"oz"},{"ingredientId":"peppercorn-jus","name":"Peppercorn jus","quantity":6,"unit":"oz"}]'::jsonb,
    '["Reheat steak tips","Roast garlic potatoes","Steam green beans and add jus"]'::jsonb
  ),
  (
    'buffalo-chicken',
    'Buffalo Chicken Bowl',
    'High Protein',
    'Grilled chicken tossed in buffalo sauce over rice with celery slaw and ranch drizzle.',
    4,
    30,
    490,
    48,
    44,
    14,
    true,
    '[{"ingredientId":"chicken-breast","name":"Grilled chicken","quantity":24,"unit":"oz"},{"ingredientId":"buffalo-sauce","name":"Buffalo sauce","quantity":6,"unit":"oz"},{"ingredientId":"jasmine-rice","name":"Rice","quantity":2,"unit":"cups"},{"ingredientId":"celery-slaw","name":"Celery slaw","quantity":12,"unit":"oz"},{"ingredientId":"ranch","name":"Ranch drizzle","quantity":4,"unit":"oz"}]'::jsonb,
    '["Grill and toss chicken in buffalo sauce","Cook rice","Top with celery slaw and ranch"]'::jsonb
  ),
  (
    'carnitas',
    'Carnitas Street Bowl',
    'Signature Smoked',
    'Crispy smoked carnitas with cilantro-lime rice, pico de gallo, and pickled onions.',
    4,
    35,
    530,
    41,
    52,
    18,
    true,
    '[{"ingredientId":"carnitas","name":"Smoked carnitas","quantity":22,"unit":"oz"},{"ingredientId":"cilantro-rice","name":"Cilantro-lime rice","quantity":2,"unit":"cups"},{"ingredientId":"pico","name":"Pico de gallo","quantity":12,"unit":"oz"},{"ingredientId":"pickled-onions","name":"Pickled onions","quantity":6,"unit":"oz"}]'::jsonb,
    '["Crisp carnitas","Cook cilantro-lime rice","Assemble with pico and pickled onions"]'::jsonb
  ),
  (
    'korean-beef',
    'Korean BBQ Beef',
    'Signature Smoked',
    'Marinated smoked beef with steamed rice, sesame broccoli, and a gochujang glaze.',
    4,
    40,
    540,
    43,
    46,
    20,
    true,
    '[{"ingredientId":"korean-beef","name":"Marinated smoked beef","quantity":24,"unit":"oz"},{"ingredientId":"jasmine-rice","name":"Steamed rice","quantity":2,"unit":"cups"},{"ingredientId":"broccoli","name":"Sesame broccoli","quantity":16,"unit":"oz"},{"ingredientId":"gochujang","name":"Gochujang glaze","quantity":4,"unit":"oz"}]'::jsonb,
    '["Warm smoked beef","Steam rice","Sauté broccoli with sesame and gochujang glaze"]'::jsonb
  ),
  (
    'smash-burger',
    'Smash Burger Bowl',
    'High Protein',
    'Seasoned beef, roasted potatoes, pickle slaw, and special sauce without the bun.',
    4,
    35,
    580,
    42,
    38,
    28,
    true,
    '[{"ingredientId":"ground-beef","name":"Seasoned beef","quantity":24,"unit":"oz"},{"ingredientId":"roasted-potatoes","name":"Roasted potatoes","quantity":20,"unit":"oz"},{"ingredientId":"pickle-slaw","name":"Pickle slaw","quantity":12,"unit":"oz"},{"ingredientId":"special-sauce","name":"Special sauce","quantity":6,"unit":"oz"}]'::jsonb,
    '["Brown seasoned beef","Roast potatoes","Assemble with pickle slaw and sauce"]'::jsonb
  ),
  (
    'veggie-power',
    'Roasted Veggie Power Bowl',
    'Plant Forward',
    'Smoked chickpeas, quinoa, roasted squash, kale, and tahini lemon dressing.',
    4,
    40,
    460,
    24,
    58,
    16,
    true,
    '[{"ingredientId":"chickpeas","name":"Smoked chickpeas","quantity":16,"unit":"oz"},{"ingredientId":"quinoa","name":"Quinoa","quantity":2,"unit":"cups"},{"ingredientId":"squash","name":"Roasted squash","quantity":16,"unit":"oz"},{"ingredientId":"kale","name":"Kale","quantity":12,"unit":"oz"},{"ingredientId":"tahini-lemon","name":"Tahini lemon dressing","quantity":6,"unit":"oz"}]'::jsonb,
    '["Roast squash and chickpeas","Cook quinoa","Massage kale and dress with tahini lemon"]'::jsonb
  )
on conflict (slug) do update set
  name = excluded.name,
  tag = excluded.tag,
  description = excluded.description,
  servings = excluded.servings,
  minutes = excluded.minutes,
  calories = excluded.calories,
  protein = excluded.protein,
  carbs = excluded.carbs,
  fat = excluded.fat,
  is_master = excluded.is_master,
  ingredients = excluded.ingredients,
  steps = excluded.steps;

-- --- Recipe discovery (member personal imports; master catalog unchanged) ---
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
