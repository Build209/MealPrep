# Trusted creator recipes

MealPlanatic’s Recipes tab loads **metadata only** from a curated list of YouTube food creators (`recipe_creators` + `creator_videos`). Recipe text is never stored in the public cache; users import a video into a **private** recipe via the existing `recipe-import` edge function (creator credit + pantry match).

## Database

Apply migration:

```bash
cd mobile
supabase db push
# or run SQL from:
# supabase/migrations/20261004120000_recipe_creators.sql
```

### Seed creators

Launch list (39 channels) ships in:

`supabase/migrations/20261004130000_recipe_creators_seed.sql`

Source JSON: `supabase/seed-data/youtube_cooking_creators.json` (regenerate the seed with `node scripts/generate-creator-seed.mjs`).

Columns include `fit` (e.g. `High`, `Medium/High`, `Low/Medium`) and `source` (`top25`, `below_cutoff`, `david_pick`). Subscriber strings like `4.7M` are stored as integers. UI and feed ordering use **fit** (High → Medium → Low), then **subscriber_count** desc. Refresh updates YouTube stats only and does **not** overwrite `fit` or `source`.

### Add more creators (SQL template)

```sql
insert into public.recipe_creators (
  youtube_channel_id,
  display_name,
  handle,
  channel_url,
  subscriber_count,
  fit,
  source,
  enabled,
  rank,
  notes
) values (
  'UCxxxxxxxxxxxxxxxx',
  'Creator Display Name',
  '@handle',
  'https://www.youtube.com/@handle',
  0,
  'Medium',
  'david_pick',
  true,
  99,
  'optional notes'
);
```

Then run refresh for that handle or channel ID to pull uploads and avatars.

### Manual video overrides

Table `creator_video_overrides` (`video_id`, `action` = `hide` | `show`, optional `note`) — **service role only**. Rows are honored on refresh (force skip/include) and on read (hide removes from feeds, search, and creator pages). Example:

```sql
insert into public.creator_video_overrides (video_id, action, note)
values ('dQw4w9WgXcQ', 'hide', 'listicle slipped through filter');
```

### Add a creator by handle only

You can insert a row with only `handle` and a placeholder `youtube_channel_id`, or skip SQL and use the refresh endpoint with `handle` — it resolves the channel via `channels.list` `forHandle` (**1 unit**) and upserts the row.

## Edge function: `creator-videos`

Deploy:

```bash
cd mobile
supabase functions deploy creator-videos --no-verify-jwt
```

The mobile app calls this function with the **publishable (anon) key** in `Authorization`, not an end-user JWT — keep JWT verification disabled for this function (same pattern as `library-generate`).

Secrets (Supabase project → Edge Functions → Secrets):

| Secret | Purpose |
|--------|---------|
| `YOUTUBE_API_KEY` | Same key as `recipe-import` |
| `CREATOR_ADMIN_SECRET` | Protects refresh / upsert-by-handle |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected |

Optional client override: `EXPO_PUBLIC_CREATOR_VIDEOS_URL` (defaults to `{SUPABASE_URL}/functions/v1/creator-videos`).

### Refresh cached videos (admin)

Uses **no** `search.list`. Per enabled creator, each refresh cycle uses roughly:

- `channels.list` (snippet, statistics, contentDetails) — **1 unit**
- `playlistItems.list` (up to ~50 recent uploads) — **1 unit**
- `videos.list` (stats + duration, batched) — **1 unit**

**~3 units per creator** per full refresh. For 32 creators ≈ **96 units** every 12h ≈ **192 units/day** (well under the 10,000/day free quota).

Refresh all enabled creators (continues on per-creator errors; returns a per-creator summary and `youtubeUnitsEstimate`):

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/creator-videos" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "x-creator-admin-secret: $CREATOR_ADMIN_SECRET" \
  -d '{"action":"refresh"}'
```

Refresh / register one creator by handle:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/creator-videos" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "x-creator-admin-secret: $CREATOR_ADMIN_SECRET" \
  -d '{"action":"refresh","handle":"@creatorhandle"}'
```

Refresh one known channel ID:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/creator-videos" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "x-creator-admin-secret: $CREATOR_ADMIN_SECRET" \
  -d '{"action":"refresh","channelId":"UCxxxxxxxxxxxxxxxx"}'
```

Public read actions (JWT / anon): `creators`, `creator`, `feed` (`popular` ranks by views ÷ channel `avg_views` over the last 90 days, then mixes creators; `new` | `quick` | `budget`), `search` (Postgres full-text — **no YouTube quota**).

### pg_cron (~every 12 hours)

Migrations `20261004150000_creator_videos_refresh_cron.sql` and `20261004161000_creator_videos_refresh_cron_timeout.sql` enable `pg_cron` + `pg_net` (if needed) and schedule refresh with a **120s** `pg_net` HTTP timeout. Secrets come from **Supabase Vault** — never embed `CREATOR_ADMIN_SECRET` in SQL.

**1. Store Vault secrets** (SQL editor or Dashboard → Database → Vault):

```sql
-- Project API URL, no trailing slash (e.g. https://abcdefgh.supabase.co)
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'supabase_project_url');

-- Publishable anon key (same as EXPO_PUBLIC / client)
select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'supabase_anon_key');

-- Matches Edge Function secret CREATOR_ADMIN_SECRET
select vault.create_secret('YOUR_CREATOR_ADMIN_SECRET', 'creator_admin_secret');
```

To rotate a secret, use `vault.update_secret` (see [Supabase Vault docs](https://supabase.com/docs/guides/database/vault)).

**2. Apply migrations** (`supabase db push`). The job `creator-videos-refresh-12h` runs at `0 */12 * * *` (UTC).

**3. Deploy** the edge function with `--no-verify-jwt` so pg_net can call it with the anon key + `x-creator-admin-secret` header.

Manual test (same headers the cron job sends):

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/creator-videos" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "x-creator-admin-secret: $CREATOR_ADMIN_SECRET" \
  -d '{"action":"refresh"}'
```

## Legacy `viral-recipes`

The old keyword-search shelf remains deployable for rollback but is **not** used by the app UI after the creator feed ships.

## Quota math (summary)

| API call | Units | Used by creator feed? |
|----------|------:|------------------------|
| `search.list` | 100 | **No** |
| `channels.list` (incl. `forHandle`) | 1 | Yes |
| `playlistItems.list` | 1 | Yes |
| `videos.list` | 1 | Yes |

At ~3 units × 32 creators × 2 refreshes/day ≈ **192 units/day** for refresh, plus occasional handle lookups when adding creators.
