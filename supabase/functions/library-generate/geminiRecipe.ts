import {
  GEMINI_RECIPE_IMPORT_JSON_SCHEMA,
  validateGeminiRecipeImportPayload,
  type RecipeImportExtracted,
} from '../recipe-import/recipeImportSchema.ts';
import { parseGeminiUsageMetadata, type GeminiUsageMetadata } from './generationUsage.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiQuotaKind = 'none' | 'rate_limit' | 'quota_exhausted';

export type GeminiCallResult<T> =
  | { ok: true; data: T; usage: GeminiUsageMetadata }
  | { ok: false; status?: number; detail: string; quota: GeminiQuotaKind };

const GENERATION_PROMPT = (dishName: string) =>
  `Write an ORIGINAL home-style recipe for "${dishName}" for a US family meal-planning app.
Rules:
- Never copy or attribute any creator, blogger, or brand.
- Generic grocery ingredients only (no brand names). Budget-friendly US supermarket items.
- Serves 4.
- Do not repeat ingredient quantities inside step text (refer to ingredients by name only).
- USDA-safe internal temperatures only where relevant (165°F poultry, 145°F fish, etc.). No pork rule for cured bacon.
- For braises and pulled meats, include shred/done temps around 195–205°F when appropriate.
- Use honest dish naming (e.g. ground beef shepherd's pie should be titled Cottage Pie).
- For ethnic dishes, include defining ingredients; note budget-friendly swaps in ingredient notes when helpful.
- Steps should be clear, practical, and time-plausible.
Return JSON matching the schema. Set is_recipe true and confidence high when valid.`;

const CRITIC_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    approve: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    fixed_recipe: GEMINI_RECIPE_IMPORT_JSON_SCHEMA,
  },
  required: ['approve', 'issues'],
};

const CRITIC_PROMPT = (dishName: string, recipeJson: string) =>
  `You are a recipe editor for a meal-planning app. Review this JSON recipe for "${dishName}".
Check: authenticity and honest naming, time plausibility (recompute total prep/cook from steps), sear times, ingredient/step consistency, and food safety temps.
If fixable, set approve false, list issues, and provide fixed_recipe with the same schema (original wording).
If acceptable, approve true and omit fixed_recipe.
Recipe JSON:
${recipeJson}`;

function classifyGeminiError(status: number, body: string): GeminiQuotaKind {
  if (status === 429) return 'rate_limit';
  if (/RESOURCE_EXHAUSTED|quota/i.test(body)) return 'quota_exhausted';
  return 'none';
}

async function callGeminiJson<T>(
  apiKey: string,
  model: string,
  parts: Record<string, unknown>[],
  schema: Record<string, unknown>,
): Promise<GeminiCallResult<T>> {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        temperature: 0.2,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: text.slice(0, 500),
      quota: classifyGeminiError(response.status, text),
    };
  }

  try {
    const json = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: unknown;
    };
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return { ok: false, detail: 'Empty Gemini response', quota: 'none' };
    }
    const payload = JSON.parse(rawText) as T;
    return { ok: true, data: payload, usage: parseGeminiUsageMetadata(json.usageMetadata) };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Parse error',
      quota: 'none',
    };
  }
}

export async function generateLibraryRecipe(
  apiKey: string,
  model: string,
  dishName: string,
): Promise<GeminiCallResult<RecipeImportExtracted>> {
  const gen = await callGeminiJson<Record<string, unknown>>(
    apiKey,
    model,
    [{ text: GENERATION_PROMPT(dishName) }],
    GEMINI_RECIPE_IMPORT_JSON_SCHEMA,
  );
  if (!gen.ok) return gen;
  const validated = validateGeminiRecipeImportPayload(gen.data);
  if (!validated || !validated.is_recipe) {
    return { ok: false, detail: 'Model returned non-recipe payload', quota: 'none' };
  }
  return { ok: true, data: { ...validated, servings: 4 }, usage: gen.usage };
}

interface CriticPayload {
  approve: boolean;
  issues: string[];
  fixed_recipe?: Record<string, unknown>;
}

export type CriticLibraryResult = {
  approve: boolean;
  issues: string[];
  recipe: RecipeImportExtracted;
  usages: Array<{ phase: 'critic' | 'critic_retry'; usage: GeminiUsageMetadata }>;
};

export async function criticLibraryRecipe(
  apiKey: string,
  model: string,
  dishName: string,
  recipe: RecipeImportExtracted,
): Promise<GeminiCallResult<CriticLibraryResult>> {
  const usages: Array<{ phase: 'critic' | 'critic_retry'; usage: GeminiUsageMetadata }> = [];

  const critic = await callGeminiJson<CriticPayload>(
    apiKey,
    model,
    [{ text: CRITIC_PROMPT(dishName, JSON.stringify(recipe)) }],
    CRITIC_SCHEMA,
  );
  if (!critic.ok) return critic;
  usages.push({ phase: 'critic', usage: critic.usage });

  let finalRecipe = recipe;
  if (!critic.data.approve && critic.data.fixed_recipe) {
    const fixed = validateGeminiRecipeImportPayload(critic.data.fixed_recipe);
    if (fixed?.is_recipe) {
      const second = await callGeminiJson<CriticPayload>(
        apiKey,
        model,
        [{ text: CRITIC_PROMPT(dishName, JSON.stringify(fixed)) }],
        CRITIC_SCHEMA,
      );
      if (!second.ok) return second;
      usages.push({ phase: 'critic_retry', usage: second.usage });
      if (!second.data.approve) {
        return {
          ok: true,
          data: {
            approve: false,
            issues: [...(critic.data.issues ?? []), ...(second.data.issues ?? [])],
            recipe: fixed,
            usages,
          },
          usage: critic.usage,
        };
      }
      finalRecipe = fixed;
      return {
        ok: true,
        data: { approve: true, issues: second.data.issues ?? [], recipe: finalRecipe, usages },
        usage: critic.usage,
      };
    }
  }

  if (!critic.data.approve) {
    return {
      ok: true,
      data: {
        approve: false,
        issues: critic.data.issues ?? [],
        recipe: finalRecipe,
        usages,
      },
      usage: critic.usage,
    };
  }

  return {
    ok: true,
    data: { approve: true, issues: critic.data.issues ?? [], recipe: finalRecipe, usages },
    usage: critic.usage,
  };
}
