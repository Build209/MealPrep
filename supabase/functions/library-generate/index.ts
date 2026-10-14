// MealPlanatic library recipe generator (service role / admin secret only).
//
// Deploy: supabase functions deploy library-generate --no-verify-jwt
// Secrets: LIBRARY_ADMIN_SECRET, GEMINI_API_KEY
// Optional: GEMINI_MODEL, GEMINI_IMAGE_MODEL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { authorizeLibraryGenerate } from './auth.ts';
import {
  DEFAULT_BATCH_SIZE,
  geminiImageModel,
  geminiTextModel,
  MAX_BATCH_SIZE,
  MAX_QUEUE_ATTEMPTS,
} from './config.ts';
import { generateAndStoreRecipeImage } from './geminiImage.ts';
import { criticLibraryRecipe, generateLibraryRecipe, type GeminiQuotaKind } from './geminiRecipe.ts';
import {
  buildLibraryGenerationUsage,
  usageCall,
  type GenerationUsageCall,
  type LibraryGenerationUsage,
} from './generationUsage.ts';
import { slugifyLibraryDishName } from './slug.ts';
import type { RecipeImportExtracted } from '../recipe-import/recipeImportSchema.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-library-admin-secret',
};

interface QueueRow {
  dish_name: string;
  status: string;
  attempts: number;
  priority: number;
}

interface ProcessResult {
  dish_name: string;
  slug: string;
  status: 'published' | 'rejected' | 'failed' | 'draft';
  notes?: string;
}

interface RequestBody {
  batchSize?: number;
  redoSlugs?: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recipeToRow(
  slug: string,
  dishName: string,
  recipe: RecipeImportExtracted,
  status: 'published' | 'rejected' | 'draft',
  reviewNotes: string | null,
  model: string,
  imageUrl: string | null,
  generationUsage: LibraryGenerationUsage | null,
) {
  return {
    slug,
    title: recipe.title.trim() || dishName,
    dish_name: dishName,
    servings: recipe.servings,
    prep_minutes: recipe.prep_minutes,
    cook_minutes: recipe.cook_minutes,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tags: [] as string[],
    cuisine: null as string | null,
    image_url: imageUrl,
    status,
    review_notes: reviewNotes,
    model,
    generation_usage: generationUsage,
  };
}

async function requeueRecipesBySlug(
  admin: ReturnType<typeof createClient>,
  slugs: string[],
): Promise<string[]> {
  const trimmed = slugs.map((s) => s.trim()).filter(Boolean);
  if (trimmed.length === 0) return [];

  const { data: recipes, error } = await admin
    .from('library_recipes')
    .select('slug,dish_name,status,image_url')
    .in('slug', trimmed);

  if (error) {
    console.warn('library-generate redoSlugs lookup failed', error.message);
    return [];
  }

  const dishNames: string[] = [];
  for (const row of recipes ?? []) {
    if (row.image_url) continue;
    if (row.status !== 'draft' && row.status !== 'published') continue;
    dishNames.push(row.dish_name);
    await admin
      .from('library_dish_queue')
      .update({ status: 'pending', last_error: null })
      .eq('dish_name', row.dish_name);
  }
  return dishNames;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const auth = await authorizeLibraryGenerate(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase service role not configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  let redoSlugs: string[] = [];
  try {
    const body = (await req.json()) as RequestBody;
    if (typeof body.batchSize === 'number' && Number.isFinite(body.batchSize)) {
      batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.round(body.batchSize)));
    }
    if (Array.isArray(body.redoSlugs)) {
      redoSlugs = body.redoSlugs.filter((s): s is string => typeof s === 'string');
    }
  } catch {
    /* default batch */
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const textModel = geminiTextModel();
  const imageModel = geminiImageModel();

  let queueRows: QueueRow[] = [];
  const redoDishNames = await requeueRecipesBySlug(admin, redoSlugs);

  if (redoDishNames.length > 0) {
    const { data, error } = await admin
      .from('library_dish_queue')
      .select('dish_name,status,attempts,priority')
      .in('dish_name', redoDishNames)
      .in('status', ['pending', 'failed'])
      .lt('attempts', MAX_QUEUE_ATTEMPTS)
      .order('priority', { ascending: true })
      .limit(batchSize);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    queueRows = (data ?? []) as QueueRow[];
  }

  if (queueRows.length === 0) {
    const { data, error: queueError } = await admin
      .from('library_dish_queue')
      .select('dish_name,status,attempts,priority')
      .in('status', ['pending', 'failed'])
      .lt('attempts', MAX_QUEUE_ATTEMPTS)
      .order('priority', { ascending: true })
      .limit(batchSize);

    if (queueError) {
      return new Response(JSON.stringify({ error: queueError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    queueRows = (data ?? []) as QueueRow[];
  }

  const results: ProcessResult[] = [];
  let stopForDay = false;
  let quotaKind: GeminiQuotaKind = 'none';

  for (const row of queueRows) {
    if (stopForDay) break;

    const dishName = row.dish_name;
    const slug = slugifyLibraryDishName(dishName);
    if (!slug) {
      await admin
        .from('library_dish_queue')
        .update({ status: 'failed', last_error: 'Invalid dish name', attempts: row.attempts + 1 })
        .eq('dish_name', dishName);
      results.push({ dish_name: dishName, slug: '', status: 'failed', notes: 'Invalid dish name' });
      continue;
    }

    const usageCalls: GenerationUsageCall[] = [];

    await admin
      .from('library_dish_queue')
      .update({ status: 'processing', attempts: row.attempts + 1 })
      .eq('dish_name', dishName);

    const generated = await generateLibraryRecipe(apiKey, textModel, dishName);
    if (!generated.ok) {
      quotaKind = generated.quota;
      if (generated.quota === 'quota_exhausted') stopForDay = true;
      if (generated.quota === 'rate_limit') await sleep(8_000);
      await admin
        .from('library_dish_queue')
        .update({
          status: generated.quota === 'quota_exhausted' ? 'pending' : 'failed',
          last_error: generated.detail,
        })
        .eq('dish_name', dishName);
      results.push({ dish_name: dishName, slug, status: 'failed', notes: generated.detail });
      continue;
    }
    usageCalls.push(usageCall('author', textModel, generated.usage, 'text'));

    const critic = await criticLibraryRecipe(apiKey, textModel, dishName, generated.data);
    if (!critic.ok) {
      quotaKind = critic.quota;
      if (critic.quota === 'quota_exhausted') stopForDay = true;
      if (critic.quota === 'rate_limit') await sleep(8_000);
      await admin
        .from('library_dish_queue')
        .update({ status: 'pending', last_error: critic.detail })
        .eq('dish_name', dishName);
      results.push({ dish_name: dishName, slug, status: 'failed', notes: critic.detail });
      continue;
    }

    for (const u of critic.data.usages) {
      usageCalls.push(usageCall(u.phase, textModel, u.usage, 'text'));
    }

    const finalRecipe = critic.data.recipe;
    const approved = critic.data.approve;
    let reviewNotes = approved
      ? (critic.data.issues.length > 0 ? critic.data.issues.join('; ') : null)
      : [...critic.data.issues, 'Critic rejected'].join('; ');

    let imageUrl: string | null = null;
    let imageQuotaStop = false;
    let imageErrorDetail: string | undefined;

    if (approved) {
      const image = await generateAndStoreRecipeImage({
        apiKey,
        imageModel,
        supabaseUrl,
        serviceKey,
        slug,
        recipe: finalRecipe,
      });
      if (image.usage) {
        usageCalls.push(usageCall('image', imageModel, image.usage, 'image'));
      }
      if (image.quota === 'quota_exhausted') {
        stopForDay = true;
        imageQuotaStop = true;
      } else if (image.quota === 'rate_limit') {
        await sleep(8_000);
      }
      if (image.result?.publicUrl) {
        imageUrl = image.result.publicUrl;
      } else if (!imageQuotaStop) {
        imageErrorDetail = image.errorDetail ?? 'Image generation or upload failed';
      } else {
        imageErrorDetail = image.errorDetail ?? 'Image quota exhausted';
      }
    }

    const generationUsage = usageCalls.length > 0 ? buildLibraryGenerationUsage(usageCalls) : null;

    let recipeStatus: 'published' | 'rejected' | 'draft';
    let queueStatus: 'done' | 'failed' | 'pending';
    let queueError: string | null = null;
    let processStatus: ProcessResult['status'];

    if (!approved) {
      recipeStatus = 'rejected';
      queueStatus = 'done';
      queueError = null;
      processStatus = 'rejected';
    } else if (imageUrl) {
      recipeStatus = 'published';
      queueStatus = 'done';
      queueError = null;
      processStatus = 'published';
    } else if (imageQuotaStop) {
      recipeStatus = 'draft';
      const note = `Image generation paused (quota): ${imageErrorDetail ?? 'quota exhausted'}`;
      reviewNotes = reviewNotes ? `${reviewNotes}; ${note}` : note;
      queueStatus = 'pending';
      queueError = imageErrorDetail;
      processStatus = 'draft';
    } else {
      recipeStatus = 'draft';
      const note = `Image generation failed: ${imageErrorDetail ?? 'unknown error'}`;
      reviewNotes = reviewNotes ? `${reviewNotes}; ${note}` : note;
      queueStatus = 'failed';
      queueError = note;
      processStatus = 'draft';
    }

    const upsertPayload = recipeToRow(
      slug,
      dishName,
      finalRecipe,
      recipeStatus,
      reviewNotes,
      textModel,
      imageUrl,
      generationUsage,
    );

    const { error: upsertError } = await admin.from('library_recipes').upsert(upsertPayload, {
      onConflict: 'slug',
    });

    if (upsertError) {
      await admin
        .from('library_dish_queue')
        .update({ status: 'failed', last_error: upsertError.message })
        .eq('dish_name', dishName);
      results.push({ dish_name: dishName, slug, status: 'failed', notes: upsertError.message });
      continue;
    }

    await admin
      .from('library_dish_queue')
      .update({ status: queueStatus, last_error: queueError })
      .eq('dish_name', dishName);

    results.push({ dish_name: dishName, slug, status: processStatus, notes: reviewNotes ?? undefined });

    await sleep(1_500);
  }

  return new Response(
    JSON.stringify({
      processed: results.length,
      results,
      stopForDay,
      quotaKind,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
