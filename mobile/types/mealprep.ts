import type { Href } from 'expo-router';

export const USER_ROLES = ['admin', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];

import type { UserPlan } from '../config/plans';
export type { UserPlan } from '../config/plans';
import type { PaidTier } from '../config/planTiers';

import type { PantryStorageLocation } from '../config/pantryStorage';
export type { PantryStorageLocation } from '../config/pantryStorage';

export const PANTRY_CATEGORIES = [
  'spices',
  'meats',
  'produce',
  'dairy',
  'dry_goods',
  'cookware',
  'frozen',
  'condiments',
] as const;
export type PantryCategory = (typeof PANTRY_CATEGORIES)[number];

export const FEATURE_FLAG_KEYS = [
  'photoScan',
  'grocerySync',
  'smartShop',
  'maintenanceMode',
  'askForky',
] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export interface UserPreferences {
  /** When true, adding a recipe to Meals to make auto-adds missing ingredients to the grocery list. */
  autoAddMissingToGrocery: boolean;
  /** When true, checking off grocery items adds them to the pantry (with merge). */
  addCheckedItemsToPantry: boolean;
  /** Opt-in: upload pantry scan photos to improve the scanner (off by default). */
  shareScanPhotoForTraining: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
  /** Which paid tier; only meaningful while `plan` is 'paid'. Absent on older rows: Plus. */
  planTier?: PaidTier;
  photoUrl: string | null;
  householdSize: number;
  dietaryNotes: string;
  homeZip?: string;
  homeLat?: number;
  homeLng?: number;
  homeLocationUpdatedAt?: string;
  createdAt: string;
  preferences: UserPreferences;
}

export interface Ingredient {
  id: string;
  name: string;
  defaultUnit: string;
  category: PantryCategory;
}

export interface PantryItem {
  id: string;
  ingredientId: string;
  name: string;
  category: PantryCategory;
  quantity: number;
  unit: string;
  location: PantryStorageLocation;
  photoUri: string | null;
  /** Private storage path for the scan photo used when adding this item (if any). */
  scanPhotoPath?: string | null;
  expiresOn: string | null;
  updatedAt: string;
}

export const NUTRITION_FIELDS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sodium',
  'potassium',
  'calcium',
  'iron',
] as const;

export type NutritionField = (typeof NUTRITION_FIELDS)[number];

export interface NutritionValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
  potassium: number;
  calcium: number;
  iron: number;
}

export interface RecipeIngredient {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
  grams?: number;
  fdcId?: string;
  nutrition?: NutritionValues;
  nutritionSource?: string;
  nutritionCitation?: string;
  nutritionSourcedAt?: string;
}

export interface Recipe {
  id: string;
  name: string;
  tag: string;
  description: string;
  servings: number;
  minutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  isMaster: boolean;
  createdAt: string;
  sourceUrl?: string;
  sourceType?:
    | 'youtube'
    | 'web'
    | 'tiktok'
    | 'instagram'
    | 'facebook'
    | 'reddit'
    | 'photo'
    | 'video'
    | 'themealdb';
  sourceTitle?: string;
  sourceChannelName?: string;
  sourceChannelUrl?: string;
  sourceAuthorUrl?: string;
  sourceMetadataRefreshedAt?: string;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  nutritionSource?: string;
  nutritionCitation?: string;
  nutritionSourcedAt?: string;
  /** HTTPS cover image when saved (import thumbnail, og:image, etc.). */
  imageUrl?: string | null;
}

export type GroceryItemOrigin = 'plan' | 'add_missing' | 'manual';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** Links a grocery row to a scheduled (or queued) meal plan entry. */
export interface GroceryPlannedMealLink {
  mealPlanItemId: string;
  /** Local calendar date (`YYYY-MM-DD`) when scheduled; null for unscheduled queue meals. */
  scheduledOn: string | null;
  mealSlot: MealSlot | null;
  /** Display title for the meal (recipe name snapshot). */
  mealTitle: string;
}

export interface GroceryListItem {
  id: string;
  ingredientId: string;
  name: string;
  category: PantryCategory;
  quantity: number;
  unit: string;
  checked: boolean;
  sourceRecipeIds: string[];
  /** How the row was added; only `plan` rows are pruned on meal-plan rebuild. */
  origin: GroceryItemOrigin;
  /** Planned meals this row satisfies (empty for manual / add-missing rows). */
  plannedMealLinks: GroceryPlannedMealLink[];
}

/** User meal plan row (kitchen slug and/or RecipeAPI id with display snapshot). */
export interface MealPlanItem {
  id: string;
  recipeSlug: string | null;
  recipeApiId: number | null;
  title: string;
  imageUrl: string | null;
  made: boolean;
  madeAt: string | null;
  addedAt: string;
  /** Local calendar date (`YYYY-MM-DD`); null = unscheduled queue (legacy behavior). */
  scheduledOn: string | null;
  /** Optional meal slot when `scheduledOn` is set. */
  mealSlot: MealSlot | null;
  /** When set, this row is a leftover meal linked to the source plan item (no grocery ingredients). */
  leftoverOfId: string | null;
  /** When set, the linked leftover row id (source meal only). */
  linkedLeftoverId: string | null;
}

export interface MealPrepSummary {
  date: string;
  mealsPlanned: number;
  pantryItems: number;
  groceryRemaining: number;
  proteinGrams: number;
}

export interface UserAnalytics {
  userCount: number;
  adminCount: number;
  memberCount: number;
  pantryItems: number;
  recipes: number;
  groceryOpen: number;
  lastActiveAt: string;
}

export interface TabConfig {
  name: 'index' | 'pantry' | 'grocery' | 'stores' | 'admin';
  title: string;
  href: Href;
  icon: string;
  iconActive: string;
  /** Hidden from the tab bar unless the signed-in user is an admin. */
  adminOnly?: boolean;
}

export interface ThemeTokens {
  brandCream: string;
  paper: string;
  sand: string;
  ink: string;
  muted: string;
  border: string;
  card: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryAccent: string;
  onPrimary: string;
  onPrimaryMuted: string;
  slateMuted: string;
  success: string;
  successDark: string;
  successLight: string;
  successAccent: string;
  onSuccess: string;
  danger: string;
  tomato: string;
  tomatoDark: string;
  tomatoLight: string;
  onTomato: string;
  warning: string;
  warningLight: string;
  onWarning: string;
}
