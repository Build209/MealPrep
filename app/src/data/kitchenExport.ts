import { buildKitchenExport, type KitchenExport } from '../account/export/exportKitchen';
import { requireClient, requireUserId } from './session';
import { run } from './errors';
import { refuseWhenOffline } from './online';
import { fetchGroceryItems } from './grocery';
import { fetchPantryItems } from './pantry';
import { RECIPE_COLUMNS, recipeFromRow, type AppRecipe, type RecipeRow } from './recipeRows';
import { fetchSavedRecipes } from './savedRecipes';

/** The person's own recipes only (made or imported), not the master recipes. */
export async function fetchOwnRecipes(userId: string | null | undefined): Promise<AppRecipe[]> {
  const client = requireClient();
  const id = requireUserId(userId);
  // recipes_read lets every signed-in person read every row, so always filter by created_by.
  const rows = await run<RecipeRow[]>(
    client
      .from('recipes')
      .select(RECIPE_COLUMNS)
      .eq('created_by', id)
      .eq('is_master', false)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  );
  return rows.map(recipeFromRow);
}

/**
 * Reads the person's own pantry, grocery list, saved recipes and own recipes (read only, one
 * request each, every one filtered to the owner) and builds the export. Throws the plain offline
 * error with no connection, because an export of cached data could be out of date.
 */
export async function loadKitchenExport(userId: string | null | undefined, now: Date = new Date()): Promise<KitchenExport> {
  refuseWhenOffline();
  const [pantry, grocery, saved, ownRecipes] = await Promise.all([
    fetchPantryItems(userId),
    fetchGroceryItems(userId),
    fetchSavedRecipes(userId),
    fetchOwnRecipes(userId),
  ]);
  return buildKitchenExport({ exportedAt: now, pantry, grocery, saved, ownRecipes });
}
