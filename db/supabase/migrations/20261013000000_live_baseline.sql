-- MealPlanatic database baseline
--
-- What this is: the live schema of Supabase project okkwapgyadpaifpmkcex, read on 2026-10-13
-- with read-only catalog queries (pg_get_functiondef, pg_get_constraintdef, pg_policies, ...).
-- Live server: PostgreSQL 17.11. It replaces the 50 drifted files in mobile/supabase/migrations
-- as the starting point for the rebuild. Data is not included; no secrets are included.
--
-- What it covers: the public schema (types, 29 tables, constraints, indexes, 28 functions,
-- triggers incl. the one on auth.users, row level security, 46 policies, grants, comments),
-- the five storage buckets and their 13 policies, and the two pg_cron jobs.
--
-- Not covered: auth and storage internals (owned by Supabase), Vault secrets (values never
-- leave the live project), edge functions, and project settings (auth providers, SMTP, ...).
--
-- NEVER apply this to the live project: everything in it already exists there.

set check_function_bodies = off;
set client_min_messages = warning;

create schema if not exists extensions;

-- Extensions that are installed live (schemas as live). Skipped quietly if a local image lacks one.
do $$
declare
  ext record;
begin
  for ext in
    select * from (values
      ('pgcrypto', 'extensions'),
      ('uuid-ossp', 'extensions'),
      ('pg_stat_statements', 'extensions'),
      ('postgis', 'extensions'),
      ('pg_net', 'extensions'),
      ('pg_cron', 'pg_catalog')
    ) as v(name, schema_name)
  loop
    if exists (select 1 from pg_available_extensions where name = ext.name)
       and not exists (select 1 from pg_extension where extname = ext.name) then
      begin
        execute format('create extension %I with schema %I', ext.name, ext.schema_name);
      exception when others then
        raise warning 'baseline: could not create extension %: %', ext.name, sqlerrm;
      end;
    end if;
  end loop;
end
$$;

set search_path = public, extensions;

create type public.scan_correction_kind as enum ('rename', 'removed', 'added');
create type public.user_plan as enum ('free', 'paid');
create type public.user_role as enum ('admin', 'member');
-- Tables (columns, defaults, generated columns). Constraints follow in 03.

create table public.app_events (
  id bigint generated always as identity not null,
  user_id uuid default auth.uid() not null,
  name text not null,
  props jsonb default '{}'::jsonb not null,
  session_id text,
  platform text,
  created_at timestamp with time zone default now() not null
);

create table public.billing_consents (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text not null,
  price_id text,
  billing_interval text,
  amount_cents integer,
  currency text,
  terms_version text,
  disclosure_version text,
  consented_at timestamp with time zone not null,
  created_at timestamp with time zone default now() not null
);

create table public.billing_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  status text,
  price_id text,
  billing_interval text,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  plan_tier text
);

create table public.creator_video_overrides (
  video_id text not null,
  action text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.creator_videos (
  video_id text not null,
  channel_id text not null,
  title text not null,
  description_snippet text,
  thumbnail_url text not null,
  published_at timestamp with time zone,
  view_count bigint default 0 not null,
  like_count bigint default 0 not null,
  duration_seconds integer,
  is_short boolean default false not null,
  url text not null,
  fetched_at timestamp with time zone default now() not null,
  search_vector tsvector generated always as (to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(description_snippet, ''::text)))) stored
);

create table public.feature_flags (
  key text not null,
  enabled boolean default false not null,
  updated_at timestamp with time zone default now() not null
);

create table public.forky_chat_usage (
  user_id uuid not null,
  period text not null,
  messages integer default 0 not null,
  input_tokens bigint default 0 not null,
  output_tokens bigint default 0 not null,
  updated_at timestamp with time zone default now() not null
);

create table public.grocery_list_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  ingredient_id text not null,
  name text not null,
  category text not null,
  quantity numeric not null,
  unit text not null,
  checked boolean default false not null,
  source_recipe_ids jsonb default '[]'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  origin text default 'plan'::text not null,
  planned_meal_links jsonb default '[]'::jsonb not null
);

create table public.library_dish_queue (
  dish_name text not null,
  status text default 'pending'::text not null,
  attempts integer default 0 not null,
  last_error text,
  priority integer default (floor((random() * (1000000)::double precision)))::integer not null
);

create table public.library_recipes (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  title text not null,
  dish_name text not null,
  servings integer default 4 not null,
  prep_minutes integer,
  cook_minutes integer,
  ingredients jsonb default '[]'::jsonb not null,
  steps jsonb default '[]'::jsonb not null,
  tags text[] default '{}'::text[] not null,
  cuisine text,
  image_url text,
  status text default 'draft'::text not null,
  review_notes text,
  model text,
  created_at timestamp with time zone default now() not null,
  generation_usage jsonb
);

create table public.meal_plan_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  recipe_slug text,
  recipe_api_id integer,
  title text not null,
  image_url text,
  made boolean default false not null,
  added_at timestamp with time zone default now() not null,
  made_at timestamp with time zone,
  scheduled_on date,
  meal_slot text,
  leftover_of_id uuid,
  linked_leftover_id uuid
);

create table public.pantry_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  ingredient_id text not null,
  name text not null,
  category text not null,
  quantity numeric default 0 not null,
  unit text not null,
  location text default ''::text,
  photo_url text,
  expires_on date,
  updated_at timestamp with time zone default now() not null,
  scan_photo_path text
);

create table public.photo_scan_requests (
  user_id uuid not null,
  request_key text not null,
  status text default 'running'::text not null,
  result jsonb,
  created_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone
);

create table public.photo_scan_usage (
  user_id uuid not null,
  period text not null,
  scans integer default 0 not null,
  input_tokens bigint default 0 not null,
  output_tokens bigint default 0 not null,
  updated_at timestamp with time zone default now() not null
);

create table public.profiles (
  id uuid not null,
  email text not null,
  name text not null,
  role user_role default 'member'::user_role not null,
  photo_url text,
  household_size integer default 2 not null,
  dietary_notes text default ''::text,
  created_at timestamp with time zone default now() not null,
  home_zip text,
  home_lat double precision,
  home_lng double precision,
  home_location_updated_at timestamp with time zone,
  auto_add_missing_to_grocery boolean default true not null,
  plan user_plan default 'free'::user_plan not null,
  avatar_path text,
  plan_comp boolean default false not null,
  plan_tier text default 'plus'::text not null
);

create table public.recipe_creators (
  id uuid default gen_random_uuid() not null,
  youtube_channel_id text not null,
  display_name text not null,
  handle text,
  channel_url text not null,
  avatar_url text,
  subscriber_count bigint default 0 not null,
  total_views bigint default 0 not null,
  avg_views bigint default 0 not null,
  avg_likes bigint default 0 not null,
  rank integer,
  fit text default 'Medium'::text not null,
  source text,
  enabled boolean default true not null,
  notes text,
  updated_at timestamp with time zone default now() not null
);

create table public.recipe_import_cache (
  url_hash text not null,
  source_url text not null,
  payload jsonb not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now() not null
);

create table public.recipe_import_usage (
  user_id uuid not null,
  period text not null,
  imports integer default 0 not null,
  updated_at timestamp with time zone default now() not null
);

create table public.recipes (
  id uuid default gen_random_uuid() not null,
  slug text,
  name text not null,
  tag text default ''::text,
  description text default ''::text,
  servings integer default 4 not null,
  minutes integer default 30 not null,
  calories integer default 0 not null,
  protein integer default 0 not null,
  ingredients jsonb default '[]'::jsonb not null,
  steps jsonb default '[]'::jsonb not null,
  is_master boolean default false not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  carbs integer default 0 not null,
  fat integer default 0 not null,
  nutrition_source text default ''::text,
  nutrition_citation text default ''::text,
  nutrition_sourced_at timestamp with time zone,
  source_url text,
  source_type text,
  source_title text,
  prep_minutes integer,
  cook_minutes integer,
  source_channel_name text,
  source_metadata_refreshed_at timestamp with time zone,
  source_channel_url text,
  source_author_url text,
  image_url text
);

create table public.scan_corrections (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  scan_id text not null,
  kind scan_correction_kind not null,
  ai_name text,
  user_name text,
  storage_location text,
  model text,
  training_photo_path text
);

create table public.store_deal_votes (
  id uuid default gen_random_uuid() not null,
  deal_id uuid not null,
  user_id uuid default auth.uid() not null,
  vote text not null,
  created_at timestamp with time zone default now() not null
);

create table public.store_deals (
  id uuid default gen_random_uuid() not null,
  store_key text not null,
  osm_store_id text,
  store_name text,
  item_name text not null,
  price numeric not null,
  unit text,
  note text,
  valid_until date default (CURRENT_DATE + 7),
  reported_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  price_kind text default 'regular'::text not null,
  scan_photo_path text
);

create table public.stores (
  id text not null,
  name text not null,
  brand text,
  category text,
  address_line text default ''::text not null,
  city text default ''::text not null,
  state text default ''::text not null,
  zip text default ''::text not null,
  lat double precision not null,
  lng double precision not null,
  geom geography(Point,4326) not null,
  phone text,
  website text,
  opening_hours text,
  sources text[] default '{}'::text[] not null,
  updated_at timestamp with time zone default now() not null
);

create table public.stripe_events (
  event_id text not null,
  type text not null,
  received_at timestamp with time zone default now() not null
);

create table public.user_diet_prefs (
  user_id uuid not null,
  diets text[] default '{}'::text[] not null,
  allergens text[] default '{}'::text[] not null,
  dislikes text[] default '{}'::text[] not null,
  hide_conflicts boolean default true not null,
  updated_at timestamp with time zone default now() not null
);

create table public.user_favorite_stores (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  store_key text not null,
  name text not null,
  chain text default ''::text not null,
  address_line text default ''::text not null,
  city text default ''::text not null,
  state text default ''::text not null,
  zip text default ''::text not null,
  lat double precision,
  lng double precision,
  kroger_location_id text,
  source text default 'osm'::text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.user_saved_recipes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  ref_key text not null,
  source_type text not null,
  kitchen_recipe_id uuid,
  creator_video_id text,
  creator_watch_url text,
  mealdb_id text,
  title text not null,
  image_url text,
  preview jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.viral_recipe_links (
  category text not null,
  video_id text not null,
  title text not null,
  thumbnail_url text not null,
  channel_id text not null,
  channel_title text not null,
  channel_url text not null,
  watch_url text not null,
  view_count bigint default 0 not null,
  published_at timestamp with time zone,
  sort_rank integer default 0 not null,
  cached_at timestamp with time zone default now() not null
);

create table public.viral_recipes_cache_meta (
  id smallint default 1 not null,
  refreshed_at timestamp with time zone default '1970-01-01 00:00:00+00'::timestamp with time zone not null,
  refreshing_until timestamp with time zone,
  refresh_backoff_until timestamp with time zone
);
-- Primary keys, unique and check constraints, foreign keys, then indexes.

alter table public.app_events add constraint app_events_pkey PRIMARY KEY (id);
alter table public.billing_consents add constraint billing_consents_pkey PRIMARY KEY (id);
alter table public.billing_subscriptions add constraint billing_subscriptions_pkey PRIMARY KEY (id);
alter table public.creator_video_overrides add constraint creator_video_overrides_pkey PRIMARY KEY (video_id);
alter table public.creator_videos add constraint creator_videos_pkey PRIMARY KEY (video_id);
alter table public.feature_flags add constraint feature_flags_pkey PRIMARY KEY (key);
alter table public.forky_chat_usage add constraint forky_chat_usage_pkey PRIMARY KEY (user_id, period);
alter table public.grocery_list_items add constraint grocery_list_items_pkey PRIMARY KEY (id);
alter table public.library_dish_queue add constraint library_dish_queue_pkey PRIMARY KEY (dish_name);
alter table public.library_recipes add constraint library_recipes_pkey PRIMARY KEY (id);
alter table public.meal_plan_items add constraint meal_plan_items_pkey PRIMARY KEY (id);
alter table public.pantry_items add constraint pantry_items_pkey PRIMARY KEY (id);
alter table public.photo_scan_requests add constraint photo_scan_requests_pkey PRIMARY KEY (user_id, request_key);
alter table public.photo_scan_usage add constraint photo_scan_usage_pkey PRIMARY KEY (user_id, period);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.recipe_creators add constraint recipe_creators_pkey PRIMARY KEY (id);
alter table public.recipe_import_cache add constraint recipe_import_cache_pkey PRIMARY KEY (url_hash);
alter table public.recipe_import_usage add constraint recipe_import_usage_pkey PRIMARY KEY (user_id, period);
alter table public.recipes add constraint recipes_pkey PRIMARY KEY (id);
alter table public.scan_corrections add constraint scan_corrections_pkey PRIMARY KEY (id);
alter table public.store_deal_votes add constraint store_deal_votes_pkey PRIMARY KEY (id);
alter table public.store_deals add constraint store_deals_pkey PRIMARY KEY (id);
alter table public.stores add constraint stores_pkey PRIMARY KEY (id);
alter table public.stripe_events add constraint stripe_events_pkey PRIMARY KEY (event_id);
alter table public.user_diet_prefs add constraint user_diet_prefs_pkey PRIMARY KEY (user_id);
alter table public.user_favorite_stores add constraint user_favorite_stores_pkey PRIMARY KEY (id);
alter table public.user_saved_recipes add constraint user_saved_recipes_pkey PRIMARY KEY (id);
alter table public.viral_recipe_links add constraint viral_recipe_links_pkey PRIMARY KEY (category, video_id);
alter table public.viral_recipes_cache_meta add constraint viral_recipes_cache_meta_pkey PRIMARY KEY (id);

alter table public.billing_consents add constraint billing_consents_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id);
alter table public.billing_subscriptions add constraint billing_subscriptions_stripe_customer_id_key UNIQUE (stripe_customer_id);
alter table public.billing_subscriptions add constraint billing_subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
alter table public.library_recipes add constraint library_recipes_slug_key UNIQUE (slug);
alter table public.recipe_creators add constraint recipe_creators_youtube_channel_id_key UNIQUE (youtube_channel_id);
alter table public.recipes add constraint recipes_slug_key UNIQUE (slug);
alter table public.store_deal_votes add constraint store_deal_votes_deal_id_user_id_key UNIQUE (deal_id, user_id);
alter table public.user_favorite_stores add constraint user_favorite_stores_user_id_store_key_key UNIQUE (user_id, store_key);
alter table public.user_saved_recipes add constraint user_saved_recipes_user_id_ref_key_key UNIQUE (user_id, ref_key);

alter table public.app_events add constraint app_events_name_format CHECK ((name ~ '^[a-z][a-z0-9_]{2,39}$'::text));
alter table public.app_events add constraint app_events_platform_known CHECK (((platform IS NULL) OR (platform = ANY (ARRAY['web'::text, 'ios'::text, 'android'::text]))));
alter table public.app_events add constraint app_events_props_object CHECK ((jsonb_typeof(props) = 'object'::text));
alter table public.app_events add constraint app_events_props_small CHECK ((pg_column_size(props) <= 600));
alter table public.app_events add constraint app_events_session_short CHECK (((session_id IS NULL) OR (char_length(session_id) <= 40)));
alter table public.billing_subscriptions add constraint billing_subscriptions_plan_tier_check CHECK (((plan_tier IS NULL) OR (plan_tier = ANY (ARRAY['plus'::text, 'pro'::text, 'family'::text]))));
alter table public.creator_video_overrides add constraint creator_video_overrides_action_check CHECK ((action = ANY (ARRAY['hide'::text, 'show'::text])));
alter table public.grocery_list_items add constraint grocery_list_items_origin_check CHECK ((origin = ANY (ARRAY['plan'::text, 'add_missing'::text, 'manual'::text])));
alter table public.library_dish_queue add constraint library_dish_queue_attempts_check CHECK ((attempts >= 0));
alter table public.library_dish_queue add constraint library_dish_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])));
alter table public.library_recipes add constraint library_recipes_servings_check CHECK ((servings >= 1));
alter table public.library_recipes add constraint library_recipes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'rejected'::text])));
alter table public.meal_plan_items add constraint meal_plan_has_ref CHECK (((recipe_slug IS NOT NULL) OR (recipe_api_id IS NOT NULL)));
alter table public.meal_plan_items add constraint meal_plan_items_meal_slot_check CHECK (((meal_slot IS NULL) OR (meal_slot = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text]))));
alter table public.photo_scan_requests add constraint photo_scan_requests_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text])));
alter table public.profiles add constraint profiles_plan_tier_check CHECK ((plan_tier = ANY (ARRAY['plus'::text, 'pro'::text, 'family'::text])));
alter table public.recipe_creators add constraint recipe_creators_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['top25'::text, 'below_cutoff'::text, 'david_pick'::text, 'intl_added'::text]))));
alter table public.recipes add constraint recipes_source_type_check CHECK (((source_type IS NULL) OR (source_type = ANY (ARRAY['youtube'::text, 'web'::text, 'tiktok'::text, 'instagram'::text, 'facebook'::text, 'photo'::text, 'video'::text]))));
alter table public.store_deal_votes add constraint store_deal_votes_vote_check CHECK ((vote = ANY (ARRAY['confirm'::text, 'expired'::text])));
alter table public.store_deals add constraint store_deals_price_check CHECK ((price >= (0)::numeric));
alter table public.store_deals add constraint store_deals_price_kind_check CHECK ((price_kind = ANY (ARRAY['regular'::text, 'sale'::text])));
alter table public.user_saved_recipes add constraint user_saved_recipes_source_type_check CHECK ((source_type = ANY (ARRAY['kitchen'::text, 'creator_video'::text, 'mealdb'::text])));
alter table public.viral_recipe_links add constraint viral_recipe_links_category_check CHECK ((category = ANY (ARRAY['viral'::text, 'quick'::text, 'budget'::text])));
alter table public.viral_recipes_cache_meta add constraint viral_recipes_cache_meta_id_check CHECK ((id = 1));

alter table public.app_events add constraint app_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.billing_consents add constraint billing_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.billing_subscriptions add constraint billing_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.creator_videos add constraint creator_videos_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.recipe_creators(youtube_channel_id) ON DELETE CASCADE;
alter table public.forky_chat_usage add constraint forky_chat_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.grocery_list_items add constraint grocery_list_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.meal_plan_items add constraint meal_plan_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.pantry_items add constraint pantry_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.photo_scan_requests add constraint photo_scan_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.photo_scan_usage add constraint photo_scan_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.recipe_import_usage add constraint recipe_import_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.recipes add constraint recipes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public.store_deal_votes add constraint store_deal_votes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.store_deals(id) ON DELETE CASCADE;
alter table public.store_deal_votes add constraint store_deal_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.store_deals add constraint store_deals_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.user_diet_prefs add constraint user_diet_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_favorite_stores add constraint user_favorite_stores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.user_saved_recipes add constraint user_saved_recipes_kitchen_recipe_id_fkey FOREIGN KEY (kitchen_recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;
alter table public.user_saved_recipes add constraint user_saved_recipes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX app_events_name_created_idx ON public.app_events USING btree (name, created_at DESC);
CREATE INDEX app_events_user_created_idx ON public.app_events USING btree (user_id, created_at DESC);
CREATE INDEX billing_subscriptions_user_id_idx ON public.billing_subscriptions USING btree (user_id);
CREATE INDEX creator_video_overrides_action_idx ON public.creator_video_overrides USING btree (action);
CREATE INDEX creator_videos_channel_published_idx ON public.creator_videos USING btree (channel_id, published_at DESC NULLS LAST);
CREATE INDEX creator_videos_published_views_idx ON public.creator_videos USING btree (published_at DESC NULLS LAST, view_count DESC);
CREATE INDEX creator_videos_search_vector_idx ON public.creator_videos USING gin (search_vector);
CREATE INDEX library_dish_queue_status_priority_idx ON public.library_dish_queue USING btree (status, priority);
CREATE INDEX library_recipes_status_created_idx ON public.library_recipes USING btree (status, created_at DESC);
CREATE INDEX meal_plan_items_leftover_of_id_idx ON public.meal_plan_items USING btree (leftover_of_id) WHERE (leftover_of_id IS NOT NULL);
CREATE INDEX meal_plan_items_user_id_added_at_idx ON public.meal_plan_items USING btree (user_id, added_at DESC);
CREATE INDEX meal_plan_items_user_scheduled_on_idx ON public.meal_plan_items USING btree (user_id, scheduled_on);
CREATE INDEX photo_scan_requests_created_at_idx ON public.photo_scan_requests USING btree (created_at);
CREATE INDEX recipe_creators_enabled_fit_subs_idx ON public.recipe_creators USING btree (enabled, (
CASE
    WHEN (fit ~~* '%high%'::text) THEN 1
    WHEN (fit ~~* '%medium%'::text) THEN 2
    ELSE 3
END), subscriber_count DESC);
CREATE INDEX recipe_creators_enabled_rank_idx ON public.recipe_creators USING btree (enabled, rank, display_name);
CREATE INDEX recipe_import_cache_expires_idx ON public.recipe_import_cache USING btree (expires_at);
CREATE INDEX recipes_created_by_source_url_idx ON public.recipes USING btree (created_by, source_url) WHERE (source_url IS NOT NULL);
CREATE INDEX scan_corrections_created_at_idx ON public.scan_corrections USING btree (created_at DESC);
CREATE INDEX scan_corrections_kind_idx ON public.scan_corrections USING btree (kind);
CREATE INDEX scan_corrections_scan_id_idx ON public.scan_corrections USING btree (scan_id);
CREATE INDEX store_deal_votes_deal_id_idx ON public.store_deal_votes USING btree (deal_id);
CREATE INDEX store_deals_store_key_idx ON public.store_deals USING btree (store_key);
CREATE INDEX store_deals_valid_until_idx ON public.store_deals USING btree (valid_until);
CREATE INDEX stores_geom_gist_idx ON public.stores USING gist (geom);
CREATE INDEX user_favorite_stores_user_id_idx ON public.user_favorite_stores USING btree (user_id);
CREATE INDEX user_saved_recipes_user_created_idx ON public.user_saved_recipes USING btree (user_id, created_at DESC);
CREATE INDEX viral_recipe_links_category_rank_idx ON public.viral_recipe_links USING btree (category, sort_rank);
-- Functions, part A (admin_* to complete_*). Bodies copied from pg_get_functiondef on the live project.

CREATE OR REPLACE FUNCTION public.admin_analytics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'user_count', (select count(*)::bigint from public.profiles),
    'admin_count', (select count(*)::bigint from public.profiles where role = 'admin'),
    'member_count', (select count(*)::bigint from public.profiles where role = 'member'),
    'pantry_items_total', (select count(*)::bigint from public.pantry_items),
    'recipes_total', (select count(*)::bigint from public.recipes),
    'grocery_open_total', (
      select count(*)::bigint from public.grocery_list_items where checked = false
    ),
    'meal_plan_items_total', (select count(*)::bigint from public.meal_plan_items)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_lookup_user_by_email(p_email text)
 RETURNS TABLE(id uuid, email text, name text, role user_role, plan user_plan)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'email required';
  end if;

  return query
    select p.id, p.email, p.name, p.role, p.plan
    from public.profiles p
    where lower(trim(p.email)) = lower(trim(p_email))
    order by p.created_at desc
    limit 10;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_scan_corrections_summary(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'days', greatest(p_days, 1),
    'counts', (
      select coalesce(jsonb_object_agg(kind::text, cnt), '{}'::jsonb)
      from (
        select kind, count(*)::bigint as cnt
        from public.scan_corrections
        where created_at >= since
        group by kind
      ) s
    ),
    'top_renames', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select ai_name, user_name, count(*)::bigint as count
        from public.scan_corrections
        where created_at >= since
          and kind = 'rename'
          and ai_name is not null
          and user_name is not null
        group by ai_name, user_name
        order by count(*) desc
        limit 12
      ) t
    ),
    'training_photo_scans', (
      select count(distinct scan_id)::bigint
      from public.scan_corrections
      where created_at >= since
        and training_photo_path is not null
    )
  )
  into result;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_user_plan(p_user_id uuid, p_plan user_plan)
 RETURNS user_plan
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user id required';
  end if;

  if p_plan is null then
    raise exception 'plan required';
  end if;

  update public.profiles
  set plan_comp = (p_plan = 'paid')
  where id = p_user_id;

  if not found then
    raise exception 'profile not found';
  end if;

  return public.recompute_user_plan(p_user_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role user_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user id required';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id;

  if not found then
    raise exception 'profile not found';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_events_daily_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today_count integer;
begin
  select count(*) into v_today_count
    from (
      select 1
        from public.app_events
       where user_id = new.user_id
         and created_at >= now() - interval '24 hours'
       limit 500
    ) recent;
  if v_today_count >= 500 then
    return null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.begin_photo_scan_request(p_user_id uuid, p_key text, p_stale_seconds integer, p_reuse_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.photo_scan_requests%rowtype;
  v_inserted integer;
begin
  if p_user_id is null or p_key is null or p_key = '' then
    return jsonb_build_object('state', 'started');
  end if;

  -- Housekeeping: nothing is kept longer than an hour.
  delete from public.photo_scan_requests where created_at < now() - interval '1 hour';

  insert into public.photo_scan_requests (user_id, request_key)
  values (p_user_id, p_key)
  on conflict (user_id, request_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    return jsonb_build_object('state', 'started');
  end if;

  select * into v_row
    from public.photo_scan_requests
   where user_id = p_user_id and request_key = p_key
     for update;

  if not found then
    -- The other request failed and removed its row between the two statements: take over.
    insert into public.photo_scan_requests (user_id, request_key)
    values (p_user_id, p_key)
    on conflict (user_id, request_key) do nothing;
    return jsonb_build_object('state', 'started');
  end if;

  if v_row.status = 'done' then
    if v_row.finished_at > now() - make_interval(secs => greatest(coalesce(p_reuse_seconds, 0), 0)) then
      return jsonb_build_object('state', 'done', 'result', v_row.result);
    end if;
    -- An old answer: scan again.
    update public.photo_scan_requests
       set status = 'running', result = null, created_at = now(), finished_at = null
     where user_id = p_user_id and request_key = p_key;
    return jsonb_build_object('state', 'started');
  end if;

  if v_row.created_at < now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 0), 1)) then
    -- The request that took the row never finished (worker stopped): take over.
    update public.photo_scan_requests
       set created_at = now()
     where user_id = p_user_id and request_key = p_key;
    return jsonb_build_object('state', 'started');
  end if;

  return jsonb_build_object('state', 'running');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_forky_message(p_user_id uuid, p_period text, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_messages integer;
begin
  if p_user_id is null or p_period is null or p_limit is null or p_limit <= 0 then
    return -1;
  end if;

  insert into public.forky_chat_usage (user_id, period, messages)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  update public.forky_chat_usage
     set messages = messages + 1,
         updated_at = now()
   where user_id = p_user_id
     and period = p_period
     and messages < p_limit
  returning messages into v_messages;

  if v_messages is null then
    return -1;
  end if;
  return p_limit - v_messages;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_photo_scan(p_user_id uuid, p_period text, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scans integer;
begin
  if p_user_id is null or p_period is null or p_limit is null or p_limit <= 0 then
    return -1;
  end if;

  insert into public.photo_scan_usage (user_id, period, scans)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  update public.photo_scan_usage
     set scans = scans + 1,
         updated_at = now()
   where user_id = p_user_id
     and period = p_period
     and scans < p_limit
  returning scans into v_scans;

  if v_scans is null then
    return -1;
  end if;
  return p_limit - v_scans;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_recipe_import(p_user_id uuid, p_period text, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_imports integer;
begin
  if p_user_id is null or p_period is null or p_limit is null or p_limit <= 0 then
    return -1;
  end if;

  insert into public.recipe_import_usage (user_id, period, imports)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period) do nothing;

  update public.recipe_import_usage
     set imports = imports + 1,
         updated_at = now()
   where user_id = p_user_id
     and period = p_period
     and imports < p_limit
  returning imports into v_imports;

  if v_imports is null then
    return -1;
  end if;
  return p_limit - v_imports;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_viral_recipes_refresh_failure(p_backoff_hours integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.viral_recipes_cache_meta
  set
    refreshing_until = null,
    refresh_backoff_until = now() + make_interval(hours => p_backoff_hours)
  where id = 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_viral_recipes_refresh_success()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.viral_recipes_cache_meta
  set
    refreshed_at = now(),
    refreshing_until = null,
    refresh_backoff_until = null
  where id = 1;
end;
$function$
;
-- Functions, part B (delete_* to my_*).

CREATE OR REPLACE FUNCTION public.delete_user_owned_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- Community: remove personal votes; keep deal rows but clear reporter link
  delete from public.store_deal_votes where user_id = p_user_id;
  update public.store_deals set reported_by = null where reported_by = p_user_id;

  -- Personal kitchen (also cascade when profiles row is removed; explicit for safety)
  delete from public.meal_plan_items where user_id = p_user_id;
  delete from public.pantry_items where user_id = p_user_id;
  delete from public.grocery_list_items where user_id = p_user_id;
  delete from public.user_favorite_stores where user_id = p_user_id;

  -- Non-master recipes owned by the user
  delete from public.recipes where created_by = p_user_id and is_master = false;

  delete from public.profiles where id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_profile_plan_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Sign-up and any other insert always starts free and un-comped, whatever the caller sent.
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.plan_comp := false;
    new.plan_tier := 'plus';
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.plan is distinct from old.plan
          or new.plan_comp is distinct from old.plan_comp
          or new.plan_tier is distinct from old.plan_tier) then
    -- Service role / SQL editor (no end-user session). Signed-out API callers cannot reach
    -- this: there is no anon UPDATE policy on profiles.
    if auth.uid() is null then
      return new;
    end if;
    if not public.is_admin() then
      raise exception 'Only admins can change subscription plans';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_profile_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'admin' and not public.is_admin() then
      new.role := 'member';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change user roles';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_photo_scan_request(p_user_id uuid, p_key text, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_result is null then
    delete from public.photo_scan_requests
     where user_id = p_user_id and request_key = p_key and status = 'running';
  else
    update public.photo_scan_requests
       set status = 'done', result = p_result, finished_at = now()
     where user_id = p_user_id and request_key = p_key;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.my_kitchen_weeks(p_tz text DEFAULT 'UTC'::text, p_weeks integer DEFAULT 8)
 RETURNS TABLE(week_start date, meals_made integer, items_scanned integer, lists_completed integer, items_ticked integer, meals_planned integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;
-- Functions, part C (nearby_* to try_*).

CREATE OR REPLACE FUNCTION public.nearby_stores(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 24000, p_limit integer DEFAULT 40)
 RETURNS TABLE(id text, name text, brand text, category text, address_line text, city text, state text, zip text, lat double precision, lng double precision, phone text, website text, opening_hours text, sources text[], distance_m double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    s.id,
    s.name,
    s.brand,
    s.category,
    s.address_line,
    s.city,
    s.state,
    s.zip,
    s.lat,
    s.lng,
    s.phone,
    s.website,
    s.opening_hours,
    s.sources,
    extensions.st_distance(s.geom, origin.g) as distance_m
  from public.stores s, origin
  where extensions.st_dwithin(s.geom, origin.g, p_radius_m)
  order by s.geom operator (extensions.<->) origin.g
  limit greatest(1, least(p_limit, 200));
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_user_plan(p_user_id uuid)
 RETURNS user_plan
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  applied public.user_plan;
  live_tier text;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  select coalesce(b.plan_tier, 'plus')
    into live_tier
    from public.billing_subscriptions b
   where b.user_id = p_user_id
     -- past_due keeps the plan while Stripe retries the card; canceled / unpaid end it.
     and b.status in ('active', 'trialing', 'past_due')
   order by case coalesce(b.plan_tier, 'plus') when 'family' then 3 when 'pro' then 2 else 1 end desc
   limit 1;

  update public.profiles p
  set plan = case
        when p.plan_comp or live_tier is not null then 'paid'::public.user_plan
        else 'free'::public.user_plan
      end,
      plan_tier = coalesce(live_tier, 'plus')
  where p.id = p_user_id
  returning p.plan into applied;

  return applied;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_recipe_import(p_user_id uuid, p_period text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.recipe_import_usage
     set imports = greatest(imports - 1, 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
$function$
;

CREATE OR REPLACE FUNCTION public.release_viral_recipes_refresh_lock()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.viral_recipes_cache_meta
  set refreshing_until = null
  where id = 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_creator_videos(p_query text, p_limit integer DEFAULT 40)
 RETURNS SETOF creator_videos
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.*
  from public.creator_videos v
  inner join public.recipe_creators c on c.youtube_channel_id = v.channel_id and c.enabled = true
  where length(trim(coalesce(p_query, ''))) >= 2
    and v.search_vector @@ plainto_tsquery('english', trim(p_query))
  order by ts_rank(v.search_vector, plainto_tsquery('english', trim(p_query))) desc,
           v.view_count desc
  limit greatest(1, least(coalesce(p_limit, 40), 60));
$function$
;

CREATE OR REPLACE FUNCTION public.settle_forky_message(p_user_id uuid, p_period text, p_input_tokens integer, p_output_tokens integer, p_refund boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.forky_chat_usage
     set messages = case when p_refund then greatest(messages - 1, 0) else messages end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_photo_scan(p_user_id uuid, p_period text, p_input_tokens integer, p_output_tokens integer, p_refund boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.photo_scan_usage
     set scans = case when p_refund then greatest(scans - 1, 0) else scans end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         updated_at = now()
   where user_id = p_user_id
     and period = p_period;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_role_to_jwt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role)
  where id = new.id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.try_acquire_viral_recipes_refresh_lock(p_lock_minutes integer DEFAULT 2)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.viral_recipes_cache_meta
  set refreshing_until = now() + make_interval(mins => p_lock_minutes)
  where id = 1
    and (refreshing_until is null or refreshing_until < now())
    and (refresh_backoff_until is null or refresh_backoff_until < now());

  return found;
end;
$function$
;
-- Triggers, row level security, policies and comments.

CREATE TRIGGER app_events_daily_cap BEFORE INSERT ON public.app_events FOR EACH ROW EXECUTE FUNCTION public.app_events_daily_cap();
CREATE TRIGGER enforce_profile_plan_change BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_plan_change();
CREATE TRIGGER enforce_profile_role_change BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_change();
CREATE TRIGGER on_profile_role_change AFTER INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_role_to_jwt();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

alter table public.app_events enable row level security;
alter table public.billing_consents enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.creator_video_overrides enable row level security;
alter table public.creator_videos enable row level security;
alter table public.feature_flags enable row level security;
alter table public.forky_chat_usage enable row level security;
alter table public.grocery_list_items enable row level security;
alter table public.library_dish_queue enable row level security;
alter table public.library_recipes enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.pantry_items enable row level security;
alter table public.photo_scan_requests enable row level security;
alter table public.photo_scan_usage enable row level security;
alter table public.profiles enable row level security;
alter table public.recipe_creators enable row level security;
alter table public.recipe_import_cache enable row level security;
alter table public.recipe_import_usage enable row level security;
alter table public.recipes enable row level security;
alter table public.scan_corrections enable row level security;
alter table public.store_deal_votes enable row level security;
alter table public.store_deals enable row level security;
alter table public.stores enable row level security;
alter table public.stripe_events enable row level security;
alter table public.user_diet_prefs enable row level security;
alter table public.user_favorite_stores enable row level security;
alter table public.user_saved_recipes enable row level security;
alter table public.viral_recipe_links enable row level security;
alter table public.viral_recipes_cache_meta enable row level security;

-- Tables with RLS on and no policy (service role only): billing_consents, creator_video_overrides,
-- library_dish_queue, photo_scan_requests, recipe_import_cache, stripe_events.

create policy app_events_insert_own on public.app_events as PERMISSIVE for INSERT to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy app_events_select_own on public.app_events as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
create policy billing_subscriptions_select_self on public.billing_subscriptions as PERMISSIVE for SELECT to authenticated
  using ((auth.uid() = user_id));
create policy creator_videos_public_read on public.creator_videos as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM recipe_creators c
  WHERE ((c.youtube_channel_id = creator_videos.channel_id) AND (c.enabled = true)))));
create policy feature_flags_admin_write on public.feature_flags as PERMISSIVE for ALL to public
  using (is_admin());
create policy feature_flags_read on public.feature_flags as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy forky_chat_usage_select_own on public.forky_chat_usage as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));
create policy grocery_owner on public.grocery_list_items as PERMISSIVE for ALL to public
  using ((auth.uid() = user_id));
create policy library_recipes_read_published on public.library_recipes as PERMISSIVE for SELECT to anon, authenticated
  using ((status = 'published'::text));
create policy meal_plan_delete_own on public.meal_plan_items as PERMISSIVE for DELETE to public
  using ((auth.uid() = user_id));
create policy meal_plan_insert_own on public.meal_plan_items as PERMISSIVE for INSERT to public
  with check ((auth.uid() = user_id));
create policy meal_plan_select_own on public.meal_plan_items as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));
create policy meal_plan_update_own on public.meal_plan_items as PERMISSIVE for UPDATE to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy pantry_admin_read on public.pantry_items as PERMISSIVE for SELECT to public
  using (is_admin());
create policy pantry_owner on public.pantry_items as PERMISSIVE for ALL to public
  using ((auth.uid() = user_id));
create policy photo_scan_usage_select_own on public.photo_scan_usage as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));
create policy profiles_admin_all on public.profiles as PERMISSIVE for ALL to public
  using (is_admin());
create policy profiles_select_self on public.profiles as PERMISSIVE for SELECT to public
  using (((auth.uid() = id) OR is_admin()));
create policy profiles_update_self on public.profiles as PERMISSIVE for UPDATE to public
  using ((auth.uid() = id));
create policy recipe_creators_public_read on public.recipe_creators as PERMISSIVE for SELECT to public
  using ((enabled = true));
create policy recipe_import_usage_select_own on public.recipe_import_usage as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));
create policy recipes_admin_master_all on public.recipes as PERMISSIVE for ALL to authenticated
  using ((is_admin() AND is_master))
  with check ((is_admin() AND is_master));
create policy recipes_admin_write on public.recipes as PERMISSIVE for ALL to public
  using (is_admin());
create policy recipes_read on public.recipes as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy recipes_user_delete on public.recipes as PERMISSIVE for DELETE to public
  using (((auth.uid() = created_by) AND (is_master = false)));
create policy recipes_user_insert on public.recipes as PERMISSIVE for INSERT to public
  with check (((auth.uid() = created_by) AND (is_master = false)));
create policy recipes_user_update on public.recipes as PERMISSIVE for UPDATE to public
  using (((auth.uid() = created_by) AND (is_master = false)))
  with check (((auth.uid() = created_by) AND (is_master = false)));
create policy scan_corrections_admin_select on public.scan_corrections as PERMISSIVE for SELECT to authenticated
  using (is_admin());
create policy scan_corrections_insert_authenticated on public.scan_corrections as PERMISSIVE for INSERT to authenticated
  with check (true);
create policy store_deal_votes_delete on public.store_deal_votes as PERMISSIVE for DELETE to public
  using ((auth.uid() = user_id));
create policy store_deal_votes_insert on public.store_deal_votes as PERMISSIVE for INSERT to public
  with check (((auth.uid() = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM store_deals d
  WHERE ((d.id = store_deal_votes.deal_id) AND (d.reported_by = auth.uid())))))));
create policy store_deal_votes_read on public.store_deal_votes as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy store_deal_votes_update on public.store_deal_votes as PERMISSIVE for UPDATE to public
  using ((auth.uid() = user_id))
  with check (((auth.uid() = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM store_deals d
  WHERE ((d.id = store_deal_votes.deal_id) AND (d.reported_by = auth.uid())))))));
create policy store_deals_admin_delete on public.store_deals as PERMISSIVE for DELETE to public
  using (is_admin());
create policy store_deals_delete_own on public.store_deals as PERMISSIVE for DELETE to public
  using ((auth.uid() = reported_by));
create policy store_deals_insert on public.store_deals as PERMISSIVE for INSERT to public
  with check ((auth.uid() = reported_by));
create policy store_deals_read on public.store_deals as PERMISSIVE for SELECT to public
  using ((auth.role() = 'authenticated'::text));
create policy store_deals_update_own on public.store_deals as PERMISSIVE for UPDATE to public
  using ((auth.uid() = reported_by))
  with check ((auth.uid() = reported_by));
create policy stores_public_read on public.stores as PERMISSIVE for SELECT to public
  using (true);
create policy user_diet_prefs_insert on public.user_diet_prefs as PERMISSIVE for INSERT to public
  with check ((auth.uid() = user_id));
create policy user_diet_prefs_select on public.user_diet_prefs as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));
create policy user_diet_prefs_update on public.user_diet_prefs as PERMISSIVE for UPDATE to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy user_favorite_stores_owner on public.user_favorite_stores as PERMISSIVE for ALL to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy user_saved_recipes_owner on public.user_saved_recipes as PERMISSIVE for ALL to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy viral_recipe_links_read on public.viral_recipe_links as PERMISSIVE for SELECT to public
  using (true);
create policy viral_recipes_cache_meta_read on public.viral_recipes_cache_meta as PERMISSIVE for SELECT to public
  using (true);

comment on table public.app_events is 'Usage log: named events per signed-in account (no item names, chat text or photos). Insert and read own rows only; kept 13 months.';
comment on table public.billing_consents is 'Proof of consent to automatic renewal: price, period and wording version agreed at checkout.';
comment on table public.billing_subscriptions is 'One row per Stripe customer. status is Stripe''s subscription status. Written by stripe-webhook.';
comment on table public.forky_chat_usage is 'Ask Forky allowance and token counts per user per period. Written only by the ask-forky function.';
comment on table public.photo_scan_requests is 'Scans in progress or just finished, per account and photo. Written only by the pantry-vision function; rows live at most an hour.';
comment on table public.photo_scan_usage is 'Photo scan allowance and token counts per user per period. Written only by the pantry-vision function.';
comment on table public.recipe_import_usage is 'Recipe import allowance: a count per user per month. Written only by the recipe-import function.';
comment on table public.scan_corrections is 'Anonymous pantry scan feedback: renames, false-positive removals, and manual adds. Linked to opt-in training photos via scan_id.';
comment on table public.stores is 'Grocery / big-box store locations (Overture + optional OSM ingest).';
comment on column public.billing_subscriptions.plan_tier is 'Tier of the subscribed price, from its Stripe lookup key (plus_monthly, pro_yearly, ...). Null for rows written before tiers existed: treated as plus.';
comment on column public.library_recipes.generation_usage is 'Gemini author/critic/image usageMetadata and estimated USD cost per generation run.';
comment on column public.pantry_items.scan_photo_path is 'Storage object path under bucket scan-photos, e.g. <uid>/pantry/<ts>.jpg';
comment on column public.profiles.avatar_path is 'Storage object path under bucket avatars, e.g. <uid>/avatar-<ts>.jpg';
comment on column public.profiles.home_lat is 'Last saved latitude (device or geocoded ZIP)';
comment on column public.profiles.home_lng is 'Last saved longitude';
comment on column public.profiles.home_zip is 'User home ZIP for store search fallback';
comment on column public.profiles.plan is 'Subscription tier: free or paid (MealPlanatic Plus). Changed by admins via RPC only.';
comment on column public.profiles.plan_comp is 'Admin-granted Plus (comp). Survives Stripe cancellations. Set only via admin_set_user_plan.';
comment on column public.profiles.plan_tier is 'Which paid tier (plus, pro, family). Only meaningful while plan = paid. Derived by recompute_user_plan(); users cannot change it.';
comment on column public.store_deals.reported_by is 'Reporter auth user; null after account deletion (deal row may remain for the community).';
comment on column public.store_deals.scan_photo_path is 'Storage object path under bucket scan-photos, e.g. <uid>/price-tag/<ts>.jpg';
-- Grants, as live. Supabase's default privileges hand every new table and function to
-- anon, authenticated and service_role; the live project narrows some of them.

-- Tables only the server (service role) touches.
revoke all on public.billing_consents, public.creator_video_overrides, public.photo_scan_requests,
  public.stripe_events from anon, authenticated;

-- Allowance and billing tables: signed-in users may read (RLS limits it to their own rows).
revoke all on public.billing_subscriptions, public.forky_chat_usage, public.photo_scan_usage,
  public.recipe_import_usage from anon, authenticated;
grant select on public.billing_subscriptions, public.forky_chat_usage, public.photo_scan_usage,
  public.recipe_import_usage to authenticated;

-- Usage log: read own rows, insert only the listed columns (id and created_at are set by the server).
revoke all on public.app_events from anon, authenticated;
grant select on public.app_events to authenticated;
grant insert (user_id, name, props, session_id, platform) on public.app_events to authenticated;

-- Scan feedback: signed-in only.
revoke all on public.scan_corrections from anon;
grant all on public.scan_corrections to authenticated;

-- Everything else keeps Supabase's default (all privileges to anon, authenticated, service_role),
-- with row level security deciding what each one sees. Stated here so a plain Postgres matches too.
grant all on public.creator_videos, public.feature_flags, public.grocery_list_items,
  public.library_dish_queue, public.library_recipes, public.meal_plan_items, public.pantry_items,
  public.profiles, public.recipe_creators, public.recipe_import_cache, public.recipes,
  public.store_deal_votes, public.store_deals, public.stores, public.user_diet_prefs,
  public.user_favorite_stores, public.user_saved_recipes, public.viral_recipe_links,
  public.viral_recipes_cache_meta to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select, update on sequence public.app_events_id_seq to anon, authenticated, service_role;

-- Functions: nothing is executable by default ...
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- ... except these.
grant execute on function public.is_admin() to public, anon, authenticated;
grant execute on function public.nearby_stores(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.search_creator_videos(text, integer) to anon, authenticated;
grant execute on function public.my_kitchen_weeks(text, integer) to authenticated;
grant execute on function public.admin_analytics() to authenticated;
grant execute on function public.admin_lookup_user_by_email(text) to authenticated;
grant execute on function public.admin_scan_corrections_summary(integer) to authenticated;
grant execute on function public.admin_set_user_plan(uuid, public.user_plan) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
-- Storage buckets and policies, and scheduled jobs. Each block is skipped if the local database
-- lacks the storage schema or pg_cron (a bare Postgres in tests); a Supabase image has both.

do $$
declare
  has_limits boolean;
begin
  if to_regclass('storage.buckets') is null then
    raise warning 'baseline: storage schema missing, buckets skipped';
    return;
  end if;

  select count(*) = 2 into has_limits
    from information_schema.columns
   where table_schema = 'storage' and table_name = 'buckets'
     and column_name in ('file_size_limit', 'allowed_mime_types');

  if has_limits then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
        ('scan-photos', 'scan-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
        ('avatars', 'avatars', true, 1048576, array['image/jpeg','image/png','image/webp']),
        ('scan-training', 'scan-training', false, 5242880, array['image/jpeg','image/png','image/webp']),
        ('recipe-import-uploads', 'recipe-import-uploads', false, 104857600,
          array['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp']),
        ('library-recipe-images', 'library-recipe-images', true, 2097152, array['image/jpeg','image/png','image/webp'])
      on conflict (id) do nothing
    $sql$;
  else
    execute $sql$
      insert into storage.buckets (id, name, public) values
        ('scan-photos', 'scan-photos', false),
        ('avatars', 'avatars', true),
        ('scan-training', 'scan-training', false),
        ('recipe-import-uploads', 'recipe-import-uploads', false),
        ('library-recipe-images', 'library-recipe-images', true)
      on conflict (id) do nothing
    $sql$;
  end if;
end
$$;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise warning 'baseline: storage.objects missing, storage policies skipped';
    return;
  end if;

  execute $sql$
create policy avatars_delete_own on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy avatars_insert_own on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy avatars_select_public on storage.objects as PERMISSIVE for SELECT to public
  using ((bucket_id = 'avatars'::text));
create policy avatars_update_own on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy library_recipe_images_select on storage.objects as PERMISSIVE for SELECT to public
  using ((bucket_id = 'library-recipe-images'::text));
create policy recipe_import_uploads_delete_own on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'recipe-import-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy recipe_import_uploads_insert_own on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'recipe-import-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy recipe_import_uploads_select_own on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'recipe-import-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy scan_photos_delete_own on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'scan-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy scan_photos_insert_own on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'scan-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy scan_photos_select_own on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'scan-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy scan_training_admin_select on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'scan-training'::text) AND public.is_admin()));
create policy scan_training_insert_own on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'scan-training'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
  $sql$;
end
$$;

-- Scheduled jobs. The creator-videos job reads its URL and keys from Vault at run time, so no
-- secret is stored here; on a local database the Vault entries are absent and the call does nothing.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'baseline: pg_cron missing, scheduled jobs skipped';
    return;
  end if;

  perform cron.schedule(
    'app-events-purge-daily',
    '17 9 * * *',
    $job$delete from public.app_events where created_at < now() - interval '13 months'$job$
  );

  perform cron.schedule(
    'creator-videos-refresh-12h',
    '0 */12 * * *',
    $job$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'supabase_project_url'
      limit 1
    ) || '/functions/v1/creator-videos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
        ''
      ),
      'x-creator-admin-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'creator_admin_secret'
        limit 1
      )
    ),
    body := '{"action":"refresh"}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $job$
  );
end
$$;

reset search_path;
