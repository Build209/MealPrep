import type { GroceryItem } from '../../data/groceryRows';
import type { AppRecipe } from '../../data/recipeRows';
import type { PantryItem } from '../../data/rows';
import type { SavedRecipe } from '../../data/savedRecipeRows';

/**
 * "Export your kitchen": turns the person's own rows into one JSON file and one readable list.
 * Pure (no network, no screen code), so tests/account-export.test.ts can run it.
 *
 * What goes in: pantry, grocery list, saved recipes, and the recipes the person made or imported.
 * What stays out on purpose: ids, the account id and email, photos and photo paths, plan and
 * billing, store choices, and allergens, diets and dietary notes (health-type data; the owner
 * decides whether to add them, and compliance has not seen this feature yet).
 */

export const EXPORT_FORMAT_VERSION = 1;

export type KitchenExportInput = {
  exportedAt: Date;
  pantry: readonly PantryItem[];
  grocery: readonly GroceryItem[];
  saved: readonly SavedRecipe[];
  /** Only the person's own recipes (not MealPlanatic master or library recipes). */
  ownRecipes: readonly AppRecipe[];
};

export type ExportedPantryItem = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  place: string | null;
  expiresOn: string | null;
};

export type ExportedGroceryItem = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  bought: boolean;
};

export type ExportedSavedRecipe = {
  title: string;
  savedOn: string;
  /** 'recipe' (a MealPlanatic or own recipe), 'video' (a creator video) or 'other'. */
  kind: 'recipe' | 'video' | 'other';
  /** Only for videos: the public watch link. A saved recipe has no public link to give. */
  link: string | null;
};

export type ExportedRecipe = {
  name: string;
  description: string;
  servings: number;
  minutes: number | null;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: string[];
  sourceUrl: string | null;
  sourceName: string | null;
};

export type KitchenExportData = {
  app: 'MealPlanatic';
  formatVersion: number;
  exportedAt: string;
  pantry: ExportedPantryItem[];
  groceryList: ExportedGroceryItem[];
  savedRecipes: ExportedSavedRecipe[];
  myRecipes: ExportedRecipe[];
};

export type KitchenExport = {
  data: KitchenExportData;
  json: string;
  text: string;
  jsonFilename: string;
  textFilename: string;
  counts: { pantry: number; groceryList: number; savedRecipes: number; myRecipes: number };
};

/** 1.5 -> "1.5", 2 -> "2", 0.3333333 -> "0.33". */
export function formatExportQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return '';
  const rounded = Math.round(quantity * 100) / 100;
  return String(rounded);
}

function datePart(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

export function exportedPantry(items: readonly PantryItem[]): ExportedPantryItem[] {
  return items
    .map((i) => ({
      name: clean(i.name),
      quantity: i.quantity,
      unit: clean(i.unit),
      category: clean(i.category),
      place: clean(i.location) || null,
      expiresOn: i.expiresOn ? datePart(i.expiresOn) || null : null,
    }))
    .filter((i) => i.name)
    .sort(byName);
}

export function exportedGrocery(items: readonly GroceryItem[]): ExportedGroceryItem[] {
  return items
    .map((i) => ({
      name: clean(i.name),
      quantity: i.quantity,
      unit: clean(i.unit),
      category: clean(i.category),
      bought: i.checked,
    }))
    .filter((i) => i.name)
    .sort(byName);
}

export function exportedSaved(items: readonly SavedRecipe[]): ExportedSavedRecipe[] {
  return items
    .map((s) => {
      const kind: ExportedSavedRecipe['kind'] =
        s.link.kind === 'recipe' ? 'recipe' : s.link.kind === 'video' ? 'video' : 'other';
      return {
        title: clean(s.title),
        savedOn: datePart(s.savedAt),
        kind,
        link: s.link.kind === 'video' ? s.link.url : null,
      };
    })
    .filter((s) => s.title);
}

export function exportedRecipes(recipes: readonly AppRecipe[]): ExportedRecipe[] {
  return recipes
    .filter((r) => !r.isMealPlanatic)
    .map((r) => ({
      name: clean(r.name),
      description: clean(r.description),
      servings: r.servings,
      minutes: r.minutes,
      ingredients: r.ingredients.map((g) => ({ name: clean(g.name), quantity: g.quantity, unit: clean(g.unit) })),
      steps: r.steps.map(clean).filter(Boolean),
      sourceUrl: r.credit?.originalUrl ?? null,
      sourceName: clean(r.credit?.creatorName) || null,
    }))
    .filter((r) => r.name)
    .sort(byName);
}

function amount(quantity: number, unit: string): string {
  const q = formatExportQuantity(quantity);
  return [q, unit].filter(Boolean).join(' ');
}

/** The readable list: plain text a person can open anywhere, print, or paste into a note. */
export function buildReadableList(data: KitchenExportData): string {
  const out: string[] = [];
  out.push('My MealPlanatic kitchen');
  out.push(`Exported ${datePart(data.exportedAt)}`);
  out.push('');

  out.push(`PANTRY (${data.pantry.length})`);
  if (!data.pantry.length) out.push('Nothing here.');
  for (const i of data.pantry) {
    const bits = [amount(i.quantity, i.unit), i.place, i.expiresOn ? `use by ${i.expiresOn}` : ''].filter(Boolean);
    out.push(`- ${i.name}${bits.length ? ` (${bits.join(', ')})` : ''}`);
  }
  out.push('');

  out.push(`GROCERY LIST (${data.groceryList.length})`);
  if (!data.groceryList.length) out.push('Nothing here.');
  for (const i of data.groceryList) {
    const a = amount(i.quantity, i.unit);
    out.push(`- [${i.bought ? 'x' : ' '}] ${i.name}${a ? ` (${a})` : ''}`);
  }
  out.push('');

  out.push(`SAVED RECIPES (${data.savedRecipes.length})`);
  if (!data.savedRecipes.length) out.push('Nothing here.');
  for (const s of data.savedRecipes) {
    out.push(`- ${s.title}${s.link ? ` - ${s.link}` : ''}`);
  }
  out.push('');

  out.push(`MY RECIPES (${data.myRecipes.length})`);
  if (!data.myRecipes.length) out.push('Nothing here.');
  for (const r of data.myRecipes) {
    out.push('');
    out.push(r.name);
    const meta = [`Serves ${r.servings}`, r.minutes ? `${r.minutes} min` : ''].filter(Boolean).join(', ');
    out.push(meta);
    if (r.description) out.push(r.description);
    if (r.sourceName || r.sourceUrl) out.push(`Source: ${[r.sourceName, r.sourceUrl].filter(Boolean).join(' - ')}`);
    if (r.ingredients.length) {
      out.push('Ingredients:');
      for (const g of r.ingredients) out.push(`- ${[amount(g.quantity, g.unit), g.name].filter(Boolean).join(' ')}`);
    }
    if (r.steps.length) {
      out.push('Steps:');
      r.steps.forEach((step, n) => out.push(`${n + 1}. ${step}`));
    }
  }
  out.push('');
  return out.join('\n');
}

export type ExportFile = { filename: string; mime: string; content: string };

/** The download address for a file's text on the web. Pure, so a test can read it back. */
export function dataUrlFor(file: ExportFile): string {
  return `data:${file.mime};charset=utf-8,${encodeURIComponent(file.content)}`;
}

export function exportFilenames(exportedAt: Date): { json: string; text: string } {
  const day = Number.isNaN(exportedAt.getTime()) ? 'today' : exportedAt.toISOString().slice(0, 10);
  return { json: `mealplanatic-kitchen-${day}.json`, text: `mealplanatic-kitchen-${day}.txt` };
}

export function buildKitchenExport(input: KitchenExportInput): KitchenExport {
  const data: KitchenExportData = {
    app: 'MealPlanatic',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    pantry: exportedPantry(input.pantry),
    groceryList: exportedGrocery(input.grocery),
    savedRecipes: exportedSaved(input.saved),
    myRecipes: exportedRecipes(input.ownRecipes),
  };
  const names = exportFilenames(input.exportedAt);
  return {
    data,
    json: JSON.stringify(data, null, 2),
    text: buildReadableList(data),
    jsonFilename: names.json,
    textFilename: names.text,
    counts: {
      pantry: data.pantry.length,
      groceryList: data.groceryList.length,
      savedRecipes: data.savedRecipes.length,
      myRecipes: data.myRecipes.length,
    },
  };
}
