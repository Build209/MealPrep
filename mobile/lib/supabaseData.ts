import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGroceryOrigin } from './grocery/origin';
import { isPersistedRowUuid } from './pantry/persistIds';
import { FEATURE_FLAG_DEFAULTS, PHOTO_SCAN } from '../config/appConfig';
import { USER_PREFERENCE_DEFAULTS } from '../config/userPreferences';
import { formatSupabaseError, isMissingSchemaError } from './supabaseErrors';
import { normalizePantryStorageLocation } from '../config/pantryStorage';
import { pantryPhotoUrlForStorage } from './pantryPhotoStorage';
import { deleteScanPhoto } from './scanPhotos/client';
import { withTimeout } from './withTimeout';
import { groceryDedupeKey } from './recipeMatch/groceryFromMissing';
import { groceryListsEqual } from './grocery/fingerprint';
import { isPersistedGroceryUuid } from './grocery/persistIds';
import { recipeApiMasterSlug, recipeApiPersonalSlug } from './recipeDiscovery/slugs';
import { DEFAULT_USER_PLAN, isUserPlan, type UserPlan } from '../config/plans';
import { DEFAULT_PAID_TIER, isPaidTier } from '../config/planTiers';
import type {
  FeatureFlagKey,
  FeatureFlags,
  GroceryListItem,
  MealPlanItem,
  MealSlot,
  PantryCategory,
  PantryItem,
  Recipe,
  RecipeIngredient,
  UserAnalytics,
  UserProfile,
  UserRole,
} from '../types/mealprep';
import { MEAL_SLOTS } from '../types/mealprep';
import type { AdminScanCorrectionsSummary } from './scanCorrections/types';

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan?: string | null;
  plan_tier?: string | null;
  photo_url: string | null;
  avatar_path?: string | null;
  household_size: number;
  dietary_notes: string | null;
  home_zip: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_location_updated_at: string | null;
  created_at: string;
  auto_add_missing_to_grocery?: boolean | null;
};

type PantryRow = {
  id: string;
  ingredient_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  location: string | null;
  photo_url: string | null;
  scan_photo_path: string | null;
  expires_on: string | null;
  updated_at: string;
};

type RecipeRow = {
  id: string;
  slug: string | null;
  name: string;
  tag: string | null;
  description: string | null;
  servings: number;
  minutes: number;
  calories: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  nutrition_source: string | null;
  nutrition_citation: string | null;
  nutrition_sourced_at: string | null;
  ingredients: RecipeIngredient[] | null;
  steps: string[] | null;
  is_master: boolean;
  created_at: string;
  source_url: string | null;
  source_type: string | null;
  source_title: string | null;
  source_channel_name: string | null;
  source_channel_url: string | null;
  source_author_url: string | null;
  source_metadata_refreshed_at: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  image_url: string | null;
};

type GroceryRow = {
  id: string;
  ingredient_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
  source_recipe_ids: string[] | null;
  origin?: string | null;
  planned_meal_links?: unknown;
};

type FlagRow = { key: string; enabled: boolean };

type AdminAnalyticsJson = {
  user_count: number;
  admin_count: number;
  member_count: number;
  pantry_items_total: number;
  recipes_total: number;
  grocery_open_total: number;
  meal_plan_items_total?: number;
};

type MealPlanRow = {
  id: string;
  user_id: string;
  recipe_slug: string | null;
  recipe_api_id: number | null;
  title: string;
  image_url: string | null;
  made: boolean;
  made_at?: string | null;
  added_at: string;
  scheduled_on?: string | null;
  meal_slot?: string | null;
  leftover_of_id?: string | null;
  linked_leftover_id?: string | null;
};

const MEAL_PLAN_MIGRATION_SQL =
  'supabase/migrations/20261002130600_meal_plan_scheduled_on.sql (and 20261001130000_meal_plan_made_at_prefs.sql if made_at missing)';

function parseMealSlot(value: string | null | undefined): MealSlot | null {
  if (!value) return null;
  return MEAL_SLOTS.includes(value as MealSlot) ? (value as MealSlot) : null;
}

function asCategory(value: string): PantryCategory {
  const categories: PantryCategory[] = [
    'spices',
    'meats',
    'produce',
    'dairy',
    'dry_goods',
    'cookware',
    'frozen',
    'condiments',
  ];
  return categories.includes(value as PantryCategory) ? (value as PantryCategory) : 'dry_goods';
}

export function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    plan: row.plan && isUserPlan(row.plan) ? row.plan : DEFAULT_USER_PLAN,
    planTier: isPaidTier(row.plan_tier) ? row.plan_tier : DEFAULT_PAID_TIER,
    photoUrl: row.photo_url,
    householdSize: row.household_size,
    dietaryNotes: row.dietary_notes ?? '',
    homeZip: row.home_zip ?? undefined,
    homeLat: row.home_lat ?? undefined,
    homeLng: row.home_lng ?? undefined,
    homeLocationUpdatedAt: row.home_location_updated_at ?? undefined,
    createdAt: row.created_at,
    preferences: {
      autoAddMissingToGrocery:
        row.auto_add_missing_to_grocery ?? USER_PREFERENCE_DEFAULTS.autoAddMissingToGrocery,
      addCheckedItemsToPantry: USER_PREFERENCE_DEFAULTS.addCheckedItemsToPantry,
      shareScanPhotoForTraining: USER_PREFERENCE_DEFAULTS.shareScanPhotoForTraining,
    },
  };
}

export function mapPantry(row: PantryRow): PantryItem {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    name: row.name,
    category: asCategory(row.category),
    quantity: Number(row.quantity),
    unit: row.unit,
    location: normalizePantryStorageLocation(row.location),
    photoUri: row.photo_url,
    scanPhotoPath: row.scan_photo_path ?? null,
    expiresOn: row.expires_on,
    updatedAt: row.updated_at,
  };
}

export function mapRecipe(row: RecipeRow): Recipe {
  return {
    id: row.slug ?? row.id,
    name: row.name,
    tag: row.tag ?? '',
    description: row.description ?? '',
    servings: row.servings,
    minutes: row.minutes,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs ?? 0,
    fat: row.fat ?? 0,
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? [],
    isMaster: row.is_master,
    createdAt: row.created_at,
    sourceUrl: row.source_url ?? undefined,
    sourceType:
      row.source_type === 'youtube' ||
      row.source_type === 'web' ||
      row.source_type === 'tiktok' ||
      row.source_type === 'instagram' ||
      row.source_type === 'facebook' ||
      row.source_type === 'reddit' ||
      row.source_type === 'photo' ||
      row.source_type === 'video'
        ? row.source_type
        : undefined,
    sourceTitle: row.source_title ?? undefined,
    sourceChannelName: row.source_channel_name ?? undefined,
    sourceChannelUrl: row.source_channel_url ?? undefined,
    sourceAuthorUrl: row.source_author_url ?? undefined,
    sourceMetadataRefreshedAt: row.source_metadata_refreshed_at ?? undefined,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    imageUrl: row.image_url,
    nutritionSource: row.nutrition_source ?? undefined,
    nutritionCitation: row.nutrition_citation ?? undefined,
    nutritionSourcedAt: row.nutrition_sourced_at ?? undefined,
  };
}

function mapPlannedMealLinksFromRow(value: unknown): GroceryListItem['plannedMealLinks'] {
  if (!Array.isArray(value)) return [];
  const links: GroceryListItem['plannedMealLinks'] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const mealPlanItemId = row.mealPlanItemId;
    if (typeof mealPlanItemId !== 'string' || !mealPlanItemId) continue;
    const mealTitle = typeof row.mealTitle === 'string' ? row.mealTitle : 'Meal';
    const scheduledOn =
      row.scheduledOn === null || typeof row.scheduledOn === 'string' ? (row.scheduledOn as string | null) : null;
    const mealSlot =
      row.mealSlot === null ||
      row.mealSlot === 'breakfast' ||
      row.mealSlot === 'lunch' ||
      row.mealSlot === 'dinner' ||
      row.mealSlot === 'snack'
        ? (row.mealSlot as GroceryListItem['plannedMealLinks'][number]['mealSlot'])
        : null;
    links.push({ mealPlanItemId, scheduledOn, mealSlot, mealTitle });
  }
  return links;
}

export function mapGrocery(row: GroceryRow): GroceryListItem {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    name: row.name,
    category: asCategory(row.category),
    quantity: Number(row.quantity),
    unit: row.unit,
    checked: row.checked,
    sourceRecipeIds: row.source_recipe_ids ?? [],
    origin: normalizeGroceryOrigin(row.origin, row.ingredient_id),
    plannedMealLinks: mapPlannedMealLinksFromRow(row.planned_meal_links),
  };
}

export function mapMealPlanItem(row: MealPlanRow): MealPlanItem {
  return {
    id: row.id,
    recipeSlug: row.recipe_slug,
    recipeApiId: row.recipe_api_id,
    title: row.title,
    imageUrl: row.image_url,
    made: row.made_at != null ? true : row.made,
    madeAt: row.made_at ?? (row.made ? row.added_at : null),
    addedAt: row.added_at,
    scheduledOn: row.scheduled_on ?? null,
    mealSlot: parseMealSlot(row.meal_slot),
    leftoverOfId: row.leftover_of_id ?? null,
    linkedLeftoverId: row.linked_leftover_id ?? null,
  };
}

export function mapFeatureFlags(rows: FlagRow[]): FeatureFlags {
  const merged = { ...FEATURE_FLAG_DEFAULTS };
  for (const row of rows) {
    if (row.key in merged) {
      merged[row.key as FeatureFlagKey] = row.enabled;
    }
  }
  return merged;
}

export async function fetchLiveBundle(client: SupabaseClient, userId: string) {
  const [profileRes, pantryRes, recipesRes, groceryRes, flagsRes, mealPlanRes] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('pantry_items').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    client
      .from('recipes')
      .select('*')
      .or(`is_master.eq.true,created_by.eq.${userId}`)
      .order('created_at', { ascending: true }),
    client.from('grocery_list_items').select('*').eq('user_id', userId).order('name'),
    client.from('feature_flags').select('key, enabled'),
    client
      .from('meal_plan_items')
      .select('*')
      .eq('user_id', userId)
      .order('added_at', { ascending: false }),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (pantryRes.error) throw pantryRes.error;
  if (recipesRes.error) throw recipesRes.error;
  if (groceryRes.error) throw groceryRes.error;
  if (flagsRes.error) throw flagsRes.error;
  if (mealPlanRes.error && mealPlanRes.error.code !== 'PGRST205') throw mealPlanRes.error;

  const profileRole = profileRes.data ? (profileRes.data as ProfileRow).role : null;

  let analytics: UserAnalytics;
  if (profileRole === 'admin') {
    const { data: agg, error: aggError } = await client.rpc('admin_analytics');
    if (aggError) throw aggError;
    const counts = agg as AdminAnalyticsJson;
    analytics = {
      userCount: Number(counts.user_count),
      adminCount: Number(counts.admin_count),
      memberCount: Number(counts.member_count),
      pantryItems: Number(counts.pantry_items_total),
      recipes: Number(counts.recipes_total),
      groceryOpen: Number(counts.grocery_open_total),
      lastActiveAt: new Date().toISOString(),
    };
  } else {
    analytics = {
      userCount: 1,
      adminCount: 0,
      memberCount: 1,
      pantryItems: pantryRes.data?.length ?? 0,
      recipes: recipesRes.data?.length ?? 0,
      groceryOpen: (groceryRes.data ?? []).filter((g: GroceryRow) => !g.checked).length,
      lastActiveAt: new Date().toISOString(),
    };
  }

  return {
    profile: profileRes.data ? mapProfile(profileRes.data as ProfileRow) : null,
    pantry: (pantryRes.data ?? []).map((row) => mapPantry(row as PantryRow)),
    recipes: (recipesRes.data ?? []).map((row) => mapRecipe(row as RecipeRow)),
    grocery: (groceryRes.data ?? []).map((row) => mapGrocery(row as GroceryRow)),
    featureFlags: mapFeatureFlags((flagsRes.data ?? []) as FlagRow[]),
    mealPlan: (mealPlanRes.data ?? []).map((row) => mapMealPlanItem(row as MealPlanRow)),
    analytics,
  };
}

function pantryInsertRow(userId: string, item: PantryItem) {
  const row: Record<string, unknown> = {
    user_id: userId,
    ingredient_id: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    photo_url: pantryPhotoUrlForStorage(item.photoUri),
    scan_photo_path: item.scanPhotoPath?.trim() || null,
    expires_on: item.expiresOn,
  };
  if (isPersistedRowUuid(item.id)) {
    row.id = item.id;
  }
  return row;
}

export async function insertPantryItem(
  client: SupabaseClient,
  userId: string,
  item: PantryItem,
): Promise<PantryItem> {
  const request = client.from('pantry_items').insert(pantryInsertRow(userId, item)).select('*').single();
  const { data, error } = await withTimeout(
    request,
    PHOTO_SCAN.saveTimeoutMs,
    PHOTO_SCAN.saveTimeoutMessage,
  );
  if (error) throw error;
  if (!data) {
    throw new Error('Pantry item was not saved. Check that you are signed in and try again.');
  }
  return mapPantry(data as PantryRow);
}

export async function insertPantryItems(
  client: SupabaseClient,
  userId: string,
  items: PantryItem[],
): Promise<PantryItem[]> {
  if (items.length === 0) return [];
  const request = client
    .from('pantry_items')
    .insert(items.map((item) => pantryInsertRow(userId, item)))
    .select('*');
  const { data, error } = await withTimeout(
    request,
    PHOTO_SCAN.saveTimeoutMs,
    PHOTO_SCAN.saveTimeoutMessage,
  );
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length !== items.length) {
    throw new Error(
      rows.length === 0
        ? 'Could not save pantry items. Check that you are signed in and try again.'
        : `Only ${rows.length} of ${items.length} pantry items were saved.`,
    );
  }
  return rows.map((row) => mapPantry(row as PantryRow));
}

export async function updatePantryItem(
  client: SupabaseClient,
  userId: string,
  item: PantryItem,
): Promise<PantryItem> {
  const { data, error } = await client
    .from('pantry_items')
    .update({
      ingredient_id: item.ingredientId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      photo_url: pantryPhotoUrlForStorage(item.photoUri),
      scan_photo_path: item.scanPhotoPath?.trim() || null,
      expires_on: item.expiresOn,
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return mapPantry(data as PantryRow);
}

export async function deletePantryItemsByIds(
  client: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<void> {
  const persistedIds = ids.filter((id) => isPersistedRowUuid(id));
  if (persistedIds.length === 0) return;
  const { data: rows, error: selectError } = await client
    .from('pantry_items')
    .select('scan_photo_path')
    .eq('user_id', userId)
    .in('id', persistedIds);
  if (selectError) throw selectError;

  const { error } = await client.from('pantry_items').delete().eq('user_id', userId).in('id', persistedIds);
  if (error) throw error;

  const paths = new Set(
    (rows ?? [])
      .map((row) => (row as { scan_photo_path: string | null }).scan_photo_path)
      .filter((path): path is string => Boolean(path?.trim())),
  );
  for (const path of paths) {
    void deleteScanPhoto(path);
  }
}

export async function deleteAllPantryItems(client: SupabaseClient, userId: string): Promise<void> {
  const { data: rows, error: selectError } = await client
    .from('pantry_items')
    .select('scan_photo_path')
    .eq('user_id', userId);
  if (selectError) throw selectError;

  const { error } = await client.from('pantry_items').delete().eq('user_id', userId);
  if (error) throw error;

  const paths = new Set(
    (rows ?? [])
      .map((row) => (row as { scan_photo_path: string | null }).scan_photo_path)
      .filter((path): path is string => Boolean(path?.trim())),
  );
  for (const path of paths) {
    void deleteScanPhoto(path);
  }
}

export async function upsertImportedRecipe(
  client: SupabaseClient,
  userId: string,
  recipe: Recipe,
  options: { asMaster: boolean; recipeApiId: number },
): Promise<Recipe> {
  const masterSlug = recipeApiMasterSlug(options.recipeApiId);
  const storageSlug = options.asMaster ? masterSlug : recipeApiPersonalSlug(options.recipeApiId, userId);

  if (!options.asMaster) {
    const { data: existingMaster, error: masterLookupError } = await client
      .from('recipes')
      .select('*')
      .eq('slug', masterSlug)
      .eq('is_master', true)
      .maybeSingle();
    if (masterLookupError) throw masterLookupError;
    if (existingMaster) return mapRecipe(existingMaster as RecipeRow);
  }

  const payload = {
    slug: storageSlug,
    name: recipe.name,
    description: recipe.description,
    tag: recipe.tag,
    servings: recipe.servings,
    minutes: recipe.minutes,
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    is_master: options.asMaster,
    created_by: userId,
    nutrition_source: recipe.nutritionSource ?? 'RecipeAPI.io',
    nutrition_citation: recipe.nutritionCitation ?? '',
    nutrition_sourced_at: recipe.nutritionSourcedAt ?? new Date().toISOString(),
  };

  const { data, error } = await client
    .from('recipes')
    .upsert(payload, { onConflict: 'slug' })
    .select('*')
    .single();
  if (error) throw error;
  return mapRecipe(data as RecipeRow);
}

export async function upsertLinkImportedRecipe(
  client: SupabaseClient,
  userId: string,
  recipe: Recipe,
): Promise<Recipe> {
  const payload = {
    slug: recipe.id,
    name: recipe.name,
    description: recipe.description,
    tag: recipe.tag,
    servings: recipe.servings,
    minutes: recipe.minutes,
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    is_master: false,
    created_by: userId,
    source_url: recipe.sourceUrl ?? null,
    source_type: recipe.sourceType ?? null,
    source_title: recipe.sourceTitle ?? null,
    source_channel_name: recipe.sourceChannelName ?? null,
    source_channel_url: recipe.sourceChannelUrl ?? null,
    source_author_url: recipe.sourceAuthorUrl ?? null,
    source_metadata_refreshed_at: recipe.sourceMetadataRefreshedAt ?? null,
    prep_minutes: recipe.prepMinutes ?? null,
    cook_minutes: recipe.cookMinutes ?? null,
    image_url: recipe.imageUrl ?? null,
    nutrition_source: recipe.nutritionSource ?? 'Link import',
    nutrition_citation: recipe.nutritionCitation ?? '',
    nutrition_sourced_at: recipe.nutritionSourcedAt ?? null,
  };

  const { data, error } = await client
    .from('recipes')
    .upsert(payload, { onConflict: 'slug' })
    .select('*')
    .single();
  if (error) throw error;
  return mapRecipe(data as RecipeRow);
}

export async function updateMasterRecipe(client: SupabaseClient, recipe: Recipe) {
  const payload = {
    name: recipe.name,
    description: recipe.description,
    tag: recipe.tag,
    servings: recipe.servings,
    minutes: recipe.minutes,
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    nutrition_source: recipe.nutritionSource ?? '',
    nutrition_citation: recipe.nutritionCitation ?? '',
    nutrition_sourced_at: recipe.nutritionSourcedAt ?? null,
  };
  const bySlug = await client.from('recipes').update(payload).eq('slug', recipe.id).select('id');
  if (bySlug.error) throw bySlug.error;
  if ((bySlug.data?.length ?? 0) > 0) return;
  const byId = await client.from('recipes').update(payload).eq('id', recipe.id);
  if (byId.error) throw byId.error;
}

export async function upsertFeatureFlag(client: SupabaseClient, key: FeatureFlagKey, enabled: boolean) {
  const { error } = await client.from('feature_flags').upsert({ key, enabled, updated_at: new Date().toISOString() });
  if (error) throw error;
}

function groceryRowKey(ingredientId: string, unit: string): string {
  return `${ingredientId}::${unit}`;
}

function groceryNameUnitKey(name: string, unit: string): string {
  return groceryDedupeKey(name, unit);
}

function isPersistedGroceryId(id: string, existingIds: Set<string>): boolean {
  return isPersistedGroceryUuid(id) && existingIds.has(id);
}

type GroceryWritePayload = {
  user_id: string;
  ingredient_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
  source_recipe_ids: string[];
  origin: string;
  planned_meal_links: GroceryListItem['plannedMealLinks'];
};

function groceryWritePayload(userId: string, item: GroceryListItem): GroceryWritePayload {
  return {
    user_id: userId,
    ingredient_id: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    source_recipe_ids: item.sourceRecipeIds,
    origin: item.origin,
    planned_meal_links: item.plannedMealLinks ?? [],
  };
}

export async function replaceGroceryList(
  client: SupabaseClient,
  userId: string,
  items: GroceryListItem[],
): Promise<GroceryListItem[]> {
  const { data: existingRows, error: fetchError } = await client
    .from('grocery_list_items')
    .select('*')
    .eq('user_id', userId);
  if (fetchError) throw fetchError;

  const existing = (existingRows ?? []) as GroceryRow[];
  const existingMapped = existing.map((row) => mapGrocery(row)).sort((a, b) => a.name.localeCompare(b.name));
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
  if (groceryListsEqual(existingMapped, sortedItems)) {
    return existingMapped;
  }

  if (sortedItems.length === 0) {
    const { error: deleteAllError } = await client
      .from('grocery_list_items')
      .delete()
      .eq('user_id', userId);
    if (deleteAllError) throw deleteAllError;
    return [];
  }

  const existingById = new Map(existing.map((row) => [row.id, row]));
  const existingIds = new Set(existing.map((row) => row.id));
  const existingByKey = new Map(existing.map((row) => [groceryRowKey(row.ingredient_id, row.unit), row]));
  const existingByNameUnit = new Map(existing.map((row) => [groceryNameUnitKey(row.name, row.unit), row]));

  const keptIds = new Set<string>();
  const rowsToUpdate: (GroceryWritePayload & { id: string })[] = [];
  const rowsToInsert: GroceryWritePayload[] = [];

  for (const item of sortedItems) {
    const key = groceryRowKey(item.ingredientId, item.unit);
    const nameKey = groceryNameUnitKey(item.name, item.unit);
    const matched =
      (isPersistedGroceryId(item.id, existingIds) ? existingById.get(item.id) : undefined) ??
      existingByKey.get(key) ??
      existingByNameUnit.get(nameKey);

    const payload = groceryWritePayload(userId, item);

    if (matched) {
      keptIds.add(matched.id);
      rowsToUpdate.push({ id: matched.id, ...payload });
    } else {
      rowsToInsert.push(payload);
    }
  }

  const toRemove = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
  if (toRemove.length > 0) {
    const { error: deleteError } = await client
      .from('grocery_list_items')
      .delete()
      .eq('user_id', userId)
      .in('id', toRemove);
    if (deleteError) throw deleteError;
  }

  const persisted: GroceryListItem[] = [];

  if (rowsToUpdate.length > 0) {
    const { data, error } = await client.from('grocery_list_items').upsert(rowsToUpdate).select('*');
    if (error) throw error;
    persisted.push(...((data ?? []) as GroceryRow[]).map(mapGrocery));
  }

  if (rowsToInsert.length > 0) {
    const { data, error } = await client.from('grocery_list_items').insert(rowsToInsert).select('*');
    if (error) throw error;
    persisted.push(...((data ?? []) as GroceryRow[]).map(mapGrocery));
  }

  return persisted.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateGroceryChecked(
  client: SupabaseClient,
  id: string,
  checked: boolean,
): Promise<void> {
  const { error } = await client.from('grocery_list_items').update({ checked }).eq('id', id);
  if (error) throw error;
}

export async function insertGroceryItem(
  client: SupabaseClient,
  userId: string,
  item: GroceryListItem,
): Promise<GroceryListItem> {
  const { data: existingRows, error: fetchError } = await client
    .from('grocery_list_items')
    .select('*')
    .eq('user_id', userId);
  if (fetchError) throw fetchError;

  const existing = (existingRows ?? []) as GroceryRow[];
  const nameKey = groceryNameUnitKey(item.name, item.unit);
  const matched =
    existing.find((row) => groceryRowKey(row.ingredient_id, row.unit) === groceryRowKey(item.ingredientId, item.unit)) ??
    existing.find((row) => groceryNameUnitKey(row.name, row.unit) === nameKey);

  const payload = {
    user_id: userId,
    ingredient_id: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    source_recipe_ids: item.sourceRecipeIds,
    origin: item.origin,
    planned_meal_links: item.plannedMealLinks ?? [],
  };

  if (matched) {
    const { data, error } = await client
      .from('grocery_list_items')
      .update({
        ...payload,
        quantity: matched.quantity + item.quantity,
        origin: item.origin === 'manual' ? 'manual' : matched.origin ?? item.origin,
      })
      .eq('id', matched.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return mapGrocery(data as GroceryRow);
  }

  const { data, error } = await client.from('grocery_list_items').insert(payload).select('*').single();
  if (error) throw error;
  return mapGrocery(data as GroceryRow);
}

export async function deleteGroceryItems(
  client: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await client.from('grocery_list_items').delete().eq('user_id', userId).in('id', ids);
  if (error) throw error;
}

export async function insertMealPlanItem(
  client: SupabaseClient,
  userId: string,
  item: Omit<MealPlanItem, 'id'>,
): Promise<MealPlanItem> {
  const basePayload = {
    user_id: userId,
    recipe_slug: item.recipeSlug,
    recipe_api_id: item.recipeApiId,
    title: item.title,
    image_url: item.imageUrl,
    made: item.made,
    added_at: item.addedAt,
    scheduled_on: item.scheduledOn,
    meal_slot: item.mealSlot,
    leftover_of_id: item.leftoverOfId,
    linked_leftover_id: item.linkedLeftoverId,
  };

  let { data, error } = await client
    .from('meal_plan_items')
    .insert({ ...basePayload, made_at: item.madeAt })
    .select('*')
    .single();

  if (error && isMissingSchemaError(error)) {
    const fallbackPayload = { ...basePayload };
    delete (fallbackPayload as { scheduled_on?: string | null }).scheduled_on;
    delete (fallbackPayload as { meal_slot?: string | null }).meal_slot;
    delete (fallbackPayload as { leftover_of_id?: string | null }).leftover_of_id;
    delete (fallbackPayload as { linked_leftover_id?: string | null }).linked_leftover_id;
    const fallback = await client
      .from('meal_plan_items')
      .insert({ ...fallbackPayload, made_at: item.madeAt })
      .select('*')
      .single();
    data = fallback.data;
    error = fallback.error;
    if (error && isMissingSchemaError(error)) {
      const legacy = await client.from('meal_plan_items').insert(fallbackPayload).select('*').single();
      data = legacy.data;
      error = legacy.error;
    }
  }

  if (error) {
    throw new Error(formatSupabaseError(error, MEAL_PLAN_MIGRATION_SQL));
  }
  return mapMealPlanItem(data as MealPlanRow);
}

export async function updateMealPlanItem(
  client: SupabaseClient,
  userId: string,
  id: string,
  patch: Partial<
    Pick<
      MealPlanItem,
      'made' | 'madeAt' | 'scheduledOn' | 'mealSlot' | 'leftoverOfId' | 'linkedLeftoverId'
    >
  >,
): Promise<MealPlanItem> {
  const made = patch.made;
  const madeAt =
    patch.madeAt !== undefined
      ? patch.madeAt
      : made === true
        ? new Date().toISOString()
        : made === false
          ? null
          : undefined;

  const withTimestamp: Record<string, unknown> = {};
  if (made !== undefined) withTimestamp.made = made;
  if (madeAt !== undefined) withTimestamp.made_at = madeAt;
  if (patch.scheduledOn !== undefined) withTimestamp.scheduled_on = patch.scheduledOn;
  if (patch.mealSlot !== undefined) withTimestamp.meal_slot = patch.mealSlot;
  if (patch.leftoverOfId !== undefined) withTimestamp.leftover_of_id = patch.leftoverOfId;
  if (patch.linkedLeftoverId !== undefined) withTimestamp.linked_leftover_id = patch.linkedLeftoverId;

  let { data, error } = await client
    .from('meal_plan_items')
    .update(withTimestamp)
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .single();

  if (error && isMissingSchemaError(error)) {
    const fallbackPayload: Record<string, unknown> = {};
    if (made !== undefined) fallbackPayload.made = made;
    if (patch.scheduledOn !== undefined) fallbackPayload.scheduled_on = patch.scheduledOn;
    if (patch.mealSlot !== undefined) fallbackPayload.meal_slot = patch.mealSlot;
    if (patch.leftoverOfId !== undefined) fallbackPayload.leftover_of_id = patch.leftoverOfId;
    if (patch.linkedLeftoverId !== undefined) fallbackPayload.linked_leftover_id = patch.linkedLeftoverId;
    const fallback = await client
      .from('meal_plan_items')
      .update(fallbackPayload)
      .eq('user_id', userId)
      .eq('id', id)
      .select('*')
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(formatSupabaseError(error, MEAL_PLAN_MIGRATION_SQL));
  }
  return mapMealPlanItem(data as MealPlanRow);
}

export type ProfileFieldUpdate = {
  name?: string;
  householdSize?: number;
  dietaryNotes?: string;
  homeZip?: string;
  photoUrl?: string | null;
  avatarPath?: string | null;
};

export async function updateProfileFields(
  client: SupabaseClient,
  userId: string,
  patch: ProfileFieldUpdate,
): Promise<UserProfile> {
  const row: Record<string, string | number | null> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.householdSize !== undefined) row.household_size = patch.householdSize;
  if (patch.dietaryNotes !== undefined) row.dietary_notes = patch.dietaryNotes;
  if (patch.homeZip !== undefined) {
    row.home_zip = patch.homeZip.trim() ? patch.homeZip.trim().slice(0, 10) : null;
    row.home_lat = null;
    row.home_lng = null;
    row.home_location_updated_at = new Date().toISOString();
  }
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl;
  if (patch.avatarPath !== undefined) row.avatar_path = patch.avatarPath;

  const { data, error } = await client.from('profiles').update(row).eq('id', userId).select('*').single();
  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

export async function updateProfilePreferences(
  client: SupabaseClient,
  userId: string,
  preferences: Pick<UserProfile['preferences'], 'autoAddMissingToGrocery'>,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ auto_add_missing_to_grocery: preferences.autoAddMissingToGrocery })
    .eq('id', userId);

  if (error && isMissingSchemaError(error)) {
    throw new Error(formatSupabaseError(error, MEAL_PLAN_MIGRATION_SQL));
  }
  if (error) throw error;
}

export async function deleteMealPlanItem(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await client.from('meal_plan_items').delete().eq('user_id', userId).eq('id', id);
  if (error) throw error;
}

const USER_PLAN_MIGRATION_SQL = 'supabase/migrations/20261001230000_user_subscription_plan.sql';

export type AdminUserLookupRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
};

export async function adminLookupUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<AdminUserLookupRow[]> {
  const { data, error } = await client.rpc('admin_lookup_user_by_email', { p_email: email.trim() });
  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error(formatSupabaseError(error, USER_PLAN_MIGRATION_SQL));
    }
    throw error;
  }
  const rows = (data ?? []) as Array<{
    id: string;
    email: string;
    name: string;
    role: UserRole;
    plan: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    plan: isUserPlan(row.plan) ? row.plan : DEFAULT_USER_PLAN,
  }));
}

export async function adminSetUserPlan(
  client: SupabaseClient,
  userId: string,
  plan: UserPlan,
): Promise<UserPlan> {
  const { data, error } = await client.rpc('admin_set_user_plan', {
    p_user_id: userId,
    p_plan: plan,
  });
  if (error) {
    throw new Error(formatSupabaseError(error, USER_PLAN_MIGRATION_SQL));
  }
  const applied = data as string | null;
  if (!applied || !isUserPlan(applied)) {
    throw new Error('Plan update did not apply. Check admin access and try again.');
  }
  // Setting Free only removes the manual grant. A user with a live subscription stays on Plus,
  // so 'paid' coming back from a 'free' request is a valid outcome, not a failure.
  if (applied !== plan && !(plan === 'free' && applied === 'paid')) {
    throw new Error(`Plan update returned ${applied} instead of ${plan}.`);
  }
  return applied;
}

const SCAN_CORRECTIONS_MIGRATION_SQL = 'supabase/migrations/20261002210000_scan_corrections.sql';

export async function fetchAdminScanCorrectionsSummary(
  client: SupabaseClient,
  days = 30,
): Promise<AdminScanCorrectionsSummary | null> {
  const { data, error } = await client.rpc('admin_scan_corrections_summary', { p_days: days });
  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error(formatSupabaseError(error, SCAN_CORRECTIONS_MIGRATION_SQL));
    }
    throw new Error(formatSupabaseError(error, SCAN_CORRECTIONS_MIGRATION_SQL));
  }
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  return {
    days: typeof payload.days === 'number' ? payload.days : days,
    counts: (payload.counts as AdminScanCorrectionsSummary['counts']) ?? {},
    top_renames: Array.isArray(payload.top_renames)
      ? (payload.top_renames as { ai_name: string; user_name: string; count: number }[])
      : [],
    training_photo_scans: typeof payload.training_photo_scans === 'number' ? payload.training_photo_scans : 0,
  };
}
