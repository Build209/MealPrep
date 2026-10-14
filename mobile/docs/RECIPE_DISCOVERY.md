# Recipe discovery (RecipeAPI.io)

The mobile app searches [RecipeAPI.io](https://recipeapi.io) through a Supabase Edge Function so the API key never ships in the client.

## Owner setup (Supabase Dashboard — no CLI required)

### 1. SQL (one paste)

In **SQL Editor**, paste and run the entire file:

**`mobile/supabase/owner_recipes_setup.sql`**

This runs the kitchen catalog import first, then recipe-discovery RLS policies. Safe to re-run.

### 2. Edge Function

1. **Edge Functions → Secrets** → add **`RECIPEAPI_KEY`** = your `sk_live_…` key from [recipeapi.io](https://recipeapi.io).
2. **Edge Functions → Deploy a new function → Via Editor**
3. Name: **`recipeapi-proxy`**
4. Paste the full contents of **`supabase/functions/recipeapi-proxy/index.ts`** (single file, no extra imports).
5. Leave **Verify JWT** **enabled** (default). The app sends the signed-in user’s access token; the gateway validates it before the function runs.
6. Deploy.

Optional: set `EXPO_PUBLIC_RECIPEAPI_PROXY_URL` if the URL is not `{EXPO_PUBLIC_SUPABASE_URL}/functions/v1/recipeapi-proxy`.

### Import slugs

- **Shared catalog (admin):** `recipeapi-{id}`
- **Personal (member):** `recipeapi-{id}--{user_uuid}` — avoids `recipes.slug` collisions between users or with an existing master row. Members who import when a master already exists get the shared recipe without duplicating.

## Free tier

RecipeAPI.io free plans allow **500 requests/month**. The app debounces search and caches list/detail responses.

## Demo mode

Without Supabase env vars, the Discover screen shows clearly labeled **demo sample** recipes only.
