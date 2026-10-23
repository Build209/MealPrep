-- Defence in depth: take back table privileges nobody should hold.
--
-- Found in the 2026-10-23 audit (read-only, live): the baseline left Supabase's default grants in
-- place, so `anon` (not signed in) holds INSERT/UPDATE/DELETE/TRUNCATE on most public tables and
-- `authenticated` holds TRUNCATE/REFERENCES/TRIGGER. Row level security already blocks every one
-- of those writes today (every public table has RLS on, and no policy lets `anon` write), so this
-- changes nothing the app does. It removes the second lock being the only lock: one wrong policy
-- later would otherwise open a table to the whole internet.
--
-- Kept: SELECT for anon (public reads such as library_recipes, stores, equipment are allowed by
-- their own policies), and everything for authenticated except the three below.
-- Not touched: public.is_admin() stays executable by anon on purpose. RLS policies on profiles and
-- recipes call it while evaluating anon requests, and revoking it would turn an empty answer into
-- a "permission denied" error. It only returns false when nobody is signed in.

revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Tables created later by the migration role start the same way.
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- Undo (restores the old broad grants):
--   grant insert, update, delete, truncate, references, trigger on all tables in schema public to anon;
--   grant truncate, references, trigger on all tables in schema public to authenticated;
