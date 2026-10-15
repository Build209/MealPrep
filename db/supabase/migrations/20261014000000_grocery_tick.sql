-- Rebuild phase 2 (Grocery): tick a grocery item into the pantry, and undo it, in ONE step on
-- the server.
--
-- Applied to live on 2026-10-14 with the owner's yes (as migration "grocery_tick"; the live copy
-- has the same code with the explanatory comments inside the function bodies left out).
--
-- Why a function: the old app added ticked items to its local copy of the pantry and then synced
-- it, which saved different rows from the ones on screen and sometimes added or took out stock
-- twice. Here each call locks the grocery row, changes the pantry and marks the grocery row in
-- one transaction. Ticking an already ticked row (double tap, second device, retry) changes
-- nothing, and so does unticking a row that is not ticked.
--
-- Both functions are SECURITY INVOKER: they run as the signed-in person, so the existing row
-- level security policies (grocery_owner, pantry_owner) still apply, and each query also
-- filters by auth.uid(). Anonymous callers cannot execute them.

-- --------------------------------------------------------------------- tick

create or replace function public.tick_grocery_item(
  p_grocery_id uuid,
  p_pantry_item_id uuid default null,
  p_location text default 'pantry'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.grocery_list_items%rowtype;
  p public.pantry_items%rowtype;
  v_created boolean := false;
  v_location text;
begin
  if v_uid is null then
    raise exception 'Sign in to change your list.' using errcode = '42501';
  end if;

  select * into g from public.grocery_list_items
   where id = p_grocery_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'Grocery item not found.' using errcode = 'P0002';
  end if;

  if g.checked then
    -- Already ticked: the pantry already has it. Nothing is added a second time.
    return jsonb_build_object('grocery', to_jsonb(g), 'pantry', null, 'created', false, 'changed', false);
  end if;

  -- One tick at a time per (person, name, unit), so two ticks of the same thing cannot both
  -- decide to insert a new pantry row.
  perform pg_advisory_xact_lock(
    hashtextextended(v_uid::text || '|' || lower(btrim(g.name)) || '|' || lower(btrim(g.unit)), 0)
  );

  -- 1. The pantry row the screen matched, if it is still this person's and has the same unit.
  if p_pantry_item_id is not null then
    select * into p from public.pantry_items
     where id = p_pantry_item_id and user_id = v_uid
       and lower(btrim(unit)) = lower(btrim(g.unit))
     for update;
  end if;

  -- 2. Otherwise a row with the same name and unit (case and outer spaces ignored).
  if p.id is null then
    select * into p from public.pantry_items
     where user_id = v_uid
       and lower(btrim(name)) = lower(btrim(g.name))
       and lower(btrim(unit)) = lower(btrim(g.unit))
     order by updated_at desc, id
     limit 1
     for update;
  end if;

  if p.id is not null then
    update public.pantry_items
       set quantity = quantity + g.quantity, updated_at = now()
     where id = p.id
     returning * into p;
  else
    v_location := case when p_location in ('pantry', 'fridge', 'spice_rack') then p_location else 'pantry' end;
    insert into public.pantry_items (user_id, ingredient_id, name, category, quantity, unit, location)
    values (v_uid, g.ingredient_id, g.name, g.category, g.quantity, g.unit, v_location)
    returning * into p;
    v_created := true;
  end if;

  update public.grocery_list_items
     set checked = true, updated_at = now()
   where id = g.id
   returning * into g;

  return jsonb_build_object('grocery', to_jsonb(g), 'pantry', to_jsonb(p), 'created', v_created, 'changed', true);
end;
$$;

comment on function public.tick_grocery_item(uuid, uuid, text) is
  'Ticks one of the caller''s grocery rows and adds its quantity to the matching pantry row (hint id, else same name + unit), or inserts a new pantry row. One transaction; ticking a ticked row changes nothing.';

-- ------------------------------------------------------------------- untick

create or replace function public.untick_grocery_item(
  p_grocery_id uuid,
  p_pantry_item_id uuid default null,
  p_created boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.grocery_list_items%rowtype;
  p public.pantry_items%rowtype;
  v_deleted boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to change your list.' using errcode = '42501';
  end if;

  select * into g from public.grocery_list_items
   where id = p_grocery_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'Grocery item not found.' using errcode = 'P0002';
  end if;

  if not g.checked then
    -- Not ticked: nothing was added, so nothing is taken out.
    return jsonb_build_object('grocery', to_jsonb(g), 'pantry', null, 'deleted', false, 'changed', false);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_uid::text || '|' || lower(btrim(g.name)) || '|' || lower(btrim(g.unit)), 0)
  );

  -- The row the tick added to (from the tick's answer), else the same name and unit.
  if p_pantry_item_id is not null then
    select * into p from public.pantry_items
     where id = p_pantry_item_id and user_id = v_uid
       and lower(btrim(unit)) = lower(btrim(g.unit))
     for update;
  end if;
  if p.id is null then
    select * into p from public.pantry_items
     where user_id = v_uid
       and lower(btrim(name)) = lower(btrim(g.name))
       and lower(btrim(unit)) = lower(btrim(g.unit))
     order by updated_at desc, id
     limit 1
     for update;
  end if;

  if p.id is not null then
    if p_created and p.id = p_pantry_item_id and p.quantity <= g.quantity then
      -- The tick made this row and nothing else was added since: take the whole row back out.
      delete from public.pantry_items where id = p.id returning * into p;
      v_deleted := true;
    else
      update public.pantry_items
         set quantity = greatest(quantity - g.quantity, 0), updated_at = now()
       where id = p.id
       returning * into p;
    end if;
  end if;

  update public.grocery_list_items
     set checked = false, updated_at = now()
   where id = g.id
   returning * into g;

  return jsonb_build_object(
    'grocery', to_jsonb(g),
    'pantry', case when p.id is null then null else to_jsonb(p) end,
    'deleted', v_deleted,
    'changed', true
  );
end;
$$;

comment on function public.untick_grocery_item(uuid, uuid, boolean) is
  'Reverses tick_grocery_item for one of the caller''s ticked grocery rows: takes its quantity back out of the pantry row (deletes the row when the tick created it and it is unchanged) and unticks it. Unticking an unticked row changes nothing.';

-- --------------------------------------------------------------- privileges

-- Supabase gives new functions EXECUTE for anon and authenticated by default; only signed-in
-- people may call these.
revoke all on function public.tick_grocery_item(uuid, uuid, text) from public, anon;
revoke all on function public.untick_grocery_item(uuid, uuid, boolean) from public, anon;
grant execute on function public.tick_grocery_item(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.untick_grocery_item(uuid, uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
