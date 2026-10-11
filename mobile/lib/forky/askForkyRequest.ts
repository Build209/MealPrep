import { ASK_FORKY_LIMITS } from '../../config/askForky';

// Pure: builds what is sent to the server. Kept free of app imports so it can be unit-tested.

export interface AskForkyTurn {
  role: 'user' | 'forky';
  text: string;
}

export interface AskForkyPantryInput {
  name: string;
  quantity: number;
  unit: string;
  expiresOn: string | null;
}

export interface AskForkyRecipeInput {
  recipeId: string;
  recipeName: string;
  totalIngredients: number;
  matchedCount: number;
  missing: { name: string }[];
}

/**
 * A few facts about the household, built on the device from its own data (learning step 4), so
 * Forky's answers fit: how many people eat, what they buy regularly, what they cooked lately.
 * Deliberately NOT here: diet, allergy or health details, names, email, location.
 */
export interface AskForkyHouseholdInput {
  householdSize?: number | null;
  /** Names of regularly bought items, steadiest first. */
  usualItems?: string[];
  /** Titles of meals marked as made recently, newest first. */
  cookedRecently?: string[];
}

export interface AskForkyContext {
  pantry: AskForkyPantryInput[];
  /** Already ranked best-first by the app's pantry matching. */
  recipes: AskForkyRecipeInput[];
  household?: AskForkyHouseholdInput;
}

/** Titles of meals made in the last `withinDays` days, newest first, without repeats. */
export function recentlyCookedTitles(
  meals: readonly { title: string; made: boolean; madeAt: string | null }[],
  now: Date,
  withinDays: number = ASK_FORKY_LIMITS.cookedWithinDays,
  limit: number = ASK_FORKY_LIMITS.cookedRecently,
): string[] {
  const cutoff = now.getTime() - withinDays * 86_400_000;
  const seen = new Set<string>();
  const out: string[] = [];
  const made = meals
    .filter((meal) => meal.made && meal.madeAt && Date.parse(meal.madeAt) >= cutoff && Date.parse(meal.madeAt) <= now.getTime())
    .sort((a, b) => Date.parse(b.madeAt as string) - Date.parse(a.madeAt as string));
  for (const meal of made) {
    const title = meal.title.trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length >= limit) break;
  }
  return out;
}

function householdBody(input: AskForkyHouseholdInput | undefined) {
  if (!input) return null;
  const size =
    typeof input.householdSize === 'number' && Number.isInteger(input.householdSize) && input.householdSize >= 1 && input.householdSize <= 20
      ? input.householdSize
      : null;
  const usualItems = (input.usualItems ?? []).map((name) => name.trim()).filter(Boolean).slice(0, ASK_FORKY_LIMITS.usualItems);
  const cookedRecently = (input.cookedRecently ?? [])
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, ASK_FORKY_LIMITS.cookedRecently);
  if (size == null && usualItems.length === 0 && cookedRecently.length === 0) return null;
  return {
    ...(size != null ? { size } : {}),
    ...(usualItems.length ? { usualItems } : {}),
    ...(cookedRecently.length ? { cookedRecently } : {}),
  };
}

function amountText(quantity: number, unit: string): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return '';
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unit}`.trim();
}

/**
 * Only what Forky needs: item names, amounts and use-by dates, and a short list of recipe titles.
 * No ids of the user, no photos, no notes. Items that expire soonest go first so they survive the cap.
 * The household block is left out entirely when there is nothing to say.
 */
export function buildAskForkyBody(question: string, history: AskForkyTurn[], context: AskForkyContext) {
  const pantry = [...context.pantry]
    .sort((a, b) => {
      if (a.expiresOn && b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn);
      if (a.expiresOn) return -1;
      if (b.expiresOn) return 1;
      return 0;
    })
    .slice(0, ASK_FORKY_LIMITS.pantryItems)
    .map((item) => {
      const amount = amountText(item.quantity, item.unit);
      return {
        name: item.name,
        ...(amount ? { amount } : {}),
        ...(item.expiresOn ? { expiresOn: item.expiresOn.slice(0, 10) } : {}),
      };
    });

  const recipes = context.recipes.slice(0, ASK_FORKY_LIMITS.recipes).map((match) => ({
    id: match.recipeId,
    title: match.recipeName,
    have: match.matchedCount,
    total: match.totalIngredients,
    missing: match.missing.slice(0, 6).map((ingredient) => ingredient.name),
  }));

  const household = householdBody(context.household);

  return {
    question: question.trim(),
    history: history.slice(-ASK_FORKY_LIMITS.historyTurns).map((turn) => ({ role: turn.role, text: turn.text })),
    pantry,
    recipes,
    ...(household ? { household } : {}),
  };
}
