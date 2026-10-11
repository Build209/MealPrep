-- Weekly recap (learning step 5): a signed-in person's own activity, counted per week.
--
-- Reads only the caller's rows in app_events (row level security applies: the function runs with
-- the caller's rights, not the owner's). Returns counts, never item names. Needs the app_events
-- table from 20261011070000_app_events.sql.
--
-- Weeks start on Monday in the caller's time zone, so "this week" matches their calendar.
-- An unknown time zone name falls back to UTC instead of failing.

create or replace function public.my_kitchen_weeks(p_tz text default 'UTC', p_weeks integer default 8)
returns table (
  week_start date,
  meals_made integer,
  items_scanned integer,
  lists_completed integer,
  items_ticked integer,
  meals_planned integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text := coalesce(nullif(trim(p_tz), ''), 'UTC');
  v_weeks integer := least(greatest(coalesce(p_weeks, 8), 1), 26);
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;

  return query
  select
    date_trunc('week', e.created_at at time zone v_tz)::date as week_start,
    (count(*) filter (where e.name = 'meal_made'))::integer as meals_made,
    coalesce(sum(
      case
        when e.name = 'scan_saved' and jsonb_typeof(e.props -> 'count') = 'number'
          then least((e.props ->> 'count')::numeric, 500)
        else 0
      end
    ), 0)::integer as items_scanned,
    (count(*) filter (where e.name = 'grocery_list_completed'))::integer as lists_completed,
    coalesce(sum(
      case
        when e.name = 'grocery_item_checked' and jsonb_typeof(e.props -> 'count') = 'number'
          then least((e.props ->> 'count')::numeric, 500)
        when e.name = 'grocery_item_checked' then 1
        else 0
      end
    ), 0)::integer as items_ticked,
    (count(*) filter (where e.name = 'meal_planned'))::integer as meals_planned
  from public.app_events e
  where e.user_id = (select auth.uid())
    and e.created_at >= (date_trunc('week', now() at time zone v_tz) - make_interval(weeks => v_weeks - 1)) at time zone v_tz
    and e.name in ('meal_made', 'scan_saved', 'grocery_list_completed', 'grocery_item_checked', 'meal_planned')
  group by 1
  order by 1 desc;
end;
$$;

comment on function public.my_kitchen_weeks(text, integer) is
  'Weekly recap: the caller''s own activity counts per week (Monday start, caller''s time zone). Counts only.';

revoke all on function public.my_kitchen_weeks(text, integer) from public, anon;
grant execute on function public.my_kitchen_weeks(text, integer) to authenticated;
