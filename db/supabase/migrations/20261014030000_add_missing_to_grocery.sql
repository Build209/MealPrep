-- Rebuild phase 3 (Recipes): "Add N missing to grocery list" in ONE step on the server.
--
-- NOT APPLIED TO LIVE. Local stacks (CI, `supabase start`) run it; the live project needs the
-- owner's yes first (db/README.md rules, charter).
--
-- Why a function: the old app merged missing ingredients into its local copy of the grocery list
-- and synced it (mobile/lib/recipeMatch/groceryFromMissing.ts), so two devices or a double tap
-- could add rows or quantities twice. Here each call, in one transaction, for every missing line:
--   - finds an UNTICKED row of the caller's with the same unit (case and outer spaces ignored)
--     and the same ingredient id or the same name;
--   - if that row already lists this recipe in source_recipe_ids, leaves it alone (this recipe's
--     need is already on the list: a repeat tap adds nothing);
--   - otherwise adds the quantity to it and appends the recipe id (origin becomes 'add_missing'
--     unless the row was typed by hand, which stays 'manual', as the old preferGroceryOrigin did);
--   - if there is no such row, inserts one (origin 'add_missing', source_recipe_ids [recipe id]).
-- Ticked rows are never changed (they are already in the pantry).
--
-- p_recipe_id is the app's recipe id (r_<uuid> / l_<uuid>, see app/src/data/recipeRows.ts).
-- p_items: [{ ingredient_id, name, category, quantity, unit }], at most 100.
--
-- SECURITY INVOKER: runs as the signed-in person, so the grocery_owner policy still applies, and
-- each query also filters by auth.uid(). Anonymous callers cannot execute it.

create or replace function public.add_missing_to_grocery(
  p_recipe_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_name text;
  v_unit text;
  v_ingredient text;
  v_category text;
  v_qty numeric;
  g public.grocery_list_items%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_added int := 0;
  v_merged int := 0;
  v_unchanged int := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to change your list.' using errcode = '42501';
  end if;
  if p_recipe_id is null or btrim(p_recipe_id) = '' or length(p_recipe_id) > 200 then
    raise exception 'A recipe id is required.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Too many items at once.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    continue when jsonb_typeof(v_item) <> 'object';

    v_name := btrim(coalesce(v_item ->> 'name', ''));
    continue when v_name = '' or length(v_name) > 200;
    v_unit := coalesce(nullif(btrim(coalesce(v_item ->> 'unit', '')), ''), 'each');
    v_ingredient := coalesce(
      nullif(btrim(coalesce(v_item ->> 'ingredient_id', '')), ''),
      trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')))
    );
    v_category := coalesce(nullif(btrim(coalesce(v_item ->> 'category', '')), ''), 'dry_goods');
    v_qty := case
      when jsonb_typeof(v_item -> 'quantity') = 'number' then (v_item ->> 'quantity')::numeric
      else null
    end;
    if v_qty is null or v_qty <= 0 then
      v_qty := 1;
    end if;
    v_qty := round(v_qty, 2);

    -- Same lock key as tick_grocery_item (person, name, unit): an add and a tick of the same
    -- thing, or two adds, run one after the other.
    perform pg_advisory_xact_lock(
      hashtextextended(v_uid::text || '|' || lower(v_name) || '|' || lower(v_unit), 0)
    );

    select * into g from public.grocery_list_items
     where user_id = v_uid
       and checked = false
       and lower(btrim(unit)) = lower(v_unit)
       and (ingredient_id = v_ingredient or lower(btrim(name)) = lower(v_name))
     order by updated_at desc, id
     limit 1
     for update;

    if found then
      if jsonb_typeof(g.source_recipe_ids) = 'array' and g.source_recipe_ids ? p_recipe_id then
        v_unchanged := v_unchanged + 1;
      else
        update public.grocery_list_items
           set quantity = quantity + v_qty,
               source_recipe_ids =
                 (case when jsonb_typeof(source_recipe_ids) = 'array' then source_recipe_ids else '[]'::jsonb end)
                 || jsonb_build_array(p_recipe_id),
               origin = case when origin = 'manual' then 'manual' else 'add_missing' end,
               updated_at = now()
         where id = g.id
         returning * into g;
        v_merged := v_merged + 1;
      end if;
    else
      insert into public.grocery_list_items (user_id, ingredient_id, name, category, quantity, unit, checked, source_recipe_ids, origin)
      values (v_uid, v_ingredient, v_name, v_category, v_qty, v_unit, false, jsonb_build_array(p_recipe_id), 'add_missing')
      returning * into g;
      v_added := v_added + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(to_jsonb(g));
  end loop;

  return jsonb_build_object('rows', v_rows, 'added', v_added, 'merged', v_merged, 'unchanged', v_unchanged);
end;
$$;

comment on function public.add_missing_to_grocery(text, jsonb) is
  'Adds a recipe''s missing ingredients to the caller''s grocery list in one transaction: merges into an unticked row with the same unit and ingredient id or name (adding the quantity once per recipe), else inserts an add_missing row. A repeat call for the same recipe adds nothing.';

-- Supabase gives new functions EXECUTE for anon and authenticated by default; only signed-in
-- people may call this.
revoke all on function public.add_missing_to_grocery(text, jsonb) from public, anon;
grant execute on function public.add_missing_to_grocery(text, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
