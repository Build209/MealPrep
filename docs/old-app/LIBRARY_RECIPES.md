# MealPlanatic recipe library

Original recipes are generated into Supabase (`library_recipes`) and shown on the Recipes tab. RecipeAPI discovery is controlled by `mobile/config/recipeSources.ts`.

## Database

1. Apply migrations (SQL Editor or CLI):

```bash
cd mobile
supabase db push
# or run migrations in order under mobile/supabase/migrations/, including:
#   20261003200000_library_recipes.sql
#   20261003201000_library_dish_queue_seed.sql
#   20261003210000_library_generation_usage_queue_priority.sql
```

## Edge function `library-generate`

**Secrets**

| Secret | Required | Notes |
|--------|----------|--------|
| `LIBRARY_ADMIN_SECRET` | Yes | Sent as header `x-library-admin-secret` from `library-run.ts` |
| `GEMINI_API_KEY` | Yes | Same key as pantry-vision / recipe-import |
| `GEMINI_MODEL` | No | Text model (default `gemini-3.8-flash`) |
| `GEMINI_IMAGE_MODEL` | No | Image model (default `gemini-3.1-flash-lite-image`) |
| `GEMINI_TEXT_INPUT_USD_PER_M` | No | Cost estimate for text input tokens (default `0.25`) |
| `GEMINI_TEXT_OUTPUT_USD_PER_M` | No | Cost estimate for text output tokens (default `1.5`) |
| `GEMINI_IMAGE_USD_PER_M` | No | Cost estimate for image tokens (default `30`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Provided by Supabase in Edge Functions |

**Deploy**

```bash
cd mobile
supabase functions deploy library-generate --no-verify-jwt
supabase secrets set LIBRARY_ADMIN_SECRET="..." GEMINI_API_KEY="..." 
# optional overrides:
supabase secrets set GEMINI_MODEL="gemini-3.8-flash" GEMINI_IMAGE_MODEL="gemini-3.1-flash-lite-image"
```

Admin users may also call the function with a Bearer session JWT (profile `role = admin`).

### Request body

| Field | Type | Notes |
|-------|------|--------|
| `batchSize` | number | 1–3 (default 1) |
| `redoSlugs` | string[] | Re-queue drafts (or published rows) missing `image_url`, then process those slugs in this invocation |

**Re-queue drafts missing images (SQL)**

```sql
update public.library_dish_queue q
set status = 'pending', last_error = null
from public.library_recipes r
where r.dish_name = q.dish_name
  and r.status = 'draft'
  and r.image_url is null;
```

## Batch generation

Small batches respect Gemini free-tier limits (429 backoff, quota stop). Published rows always have a photo; image failures are saved as `draft` and the queue row is marked `failed` (retried while `attempts < 3`).

```bash
cd mobile
SUPABASE_URL="https://okkwapgyadpaifpmkcex.supabase.co" \
LIBRARY_ADMIN_SECRET="..." \
npx tsx scripts/library-run.ts --batches 10 --batch-size 1
```

Re-run image generation for specific slugs:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/library-generate" \
  -H "Content-Type: application/json" \
  -H "x-library-admin-secret: $LIBRARY_ADMIN_SECRET" \
  -d '{"batchSize":1,"redoSlugs":["pork-chops-with-dry-rub","classic-meatballs"]}'
```

Images land in the public bucket `library-recipe-images` (resized to ~800px JPEG); `image_url` on each published row points at the object URL. `generation_usage` on each row stores per-call Gemini `usageMetadata` and estimated USD cost.

## App config

- `RECIPE_SOURCES.recipeApiEnabled` — pause RecipeAPI feed/search
- `RECIPE_SOURCES.libraryRecipesEnabled` — load published library rows (anon read via RLS)
