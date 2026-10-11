import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isUserPlan, type UserPlan } from '../config/plans';
import { useHydrated } from '../hooks/useHydrated';
import { useHydrationGatedPersist } from '../hooks/useHydrationGatedPersist';
import {
  useSavedRecipes,
  type SavedRecipeToggleOutcome,
  type SavedRecipesController,
} from '../hooks/useSavedRecipes';
import type { Session } from '@supabase/supabase-js';
import {
  APP_NAME,
  DEMO_USERS,
  FEATURE_FLAG_DEFAULTS,
  isDemoMode,
  isSupabaseConfigured,
} from '../config/appConfig';
import { GROCERY_COPY } from '../config/grocery';
import { RECIPES_COPY } from '../config/recipesCopy';
import { SAVED_RECIPES_COPY } from '../config/savedRecipes';
import { GUEST_OWNER_ID } from '../config/guestMode';
import { DIET_PREF_COPY } from '../config/diet';
import {
  DEFAULT_PANTRY_STORAGE_LOCATION,
  normalizePantryItemList,
  previewResortFromDefaultPantry,
  resortPantryItemIfDefault,
  type PantryResortPreview,
} from '../config/pantryStorage';
import { DEFAULT_FEATURE_FLAGS, MOCK_PANTRY, MOCK_RECIPES, profileForRole } from '../data/mockData';
import { getAuthRedirectUrl, openedFromPasswordResetLink } from '../lib/authRedirect';
import {
  AUTH_MAGIC_LINK_COPY,
  AUTH_RESET_COPY,
  AUTH_RESULT_COPY,
  authErrorMessage,
  type AuthActionResult,
} from '../config/authConfig';
import {
  addGroceryDismissals,
  clearGroceryDismissals,
  groceryDismissalKey,
  groceryManualLineDismissalKey,
  readGroceryDismissals,
  removeGroceryDismissals,
} from '../lib/grocery/dismissals';
import {
  applyGroceryCheckRestock,
  applyGroceryCheckRestockBatch,
  reverseGroceryCheckRestock,
} from '../lib/grocery/restockLedger';
import { bumpGroceryPersistGeneration, enqueueGroceryPersist } from '../lib/grocery/persistQueue';
import { isPersistedGroceryUuid } from '../lib/grocery/persistIds';
import {
  cancelManualGroceryInsert,
  completeManualGroceryInsertTracking,
  createManualGroceryInsertCoordinator,
  groceryListForServerSync,
  isManualGroceryInsertCancelled,
  isManualGroceryLocalId,
  mergeSavedManualGroceryItem,
  mergeServerGroceryWithPendingManual,
  resolveGroceryListForServerSync,
  rollbackManualGroceryItem,
  trackManualGroceryInsert,
} from '../lib/grocery/manualGroceryInsertLifecycle';
import { groceryListsEqual } from '../lib/grocery/fingerprint';
import { buildGroceryList, createManualGroceryItem } from '../lib/grocery';
import { pruneGroceryForRemovedMeals } from '../lib/grocery/grouping';
import { GROCERY_LIST_REFRESH_DEBOUNCE_MS } from '../config/grocerySync';
import { groceryDismissalKeysForItem } from '../lib/grocery/removals';
import { addMissingRecipeIngredientsToGrocery as mergeMissingIntoGrocery } from '../lib/recipeMatch/groceryFromMissing';
import { mergeMissingIntoGroceryWithPlanLink } from '../lib/seamlessFlow/groceryPlanLinks';
import { recipeCategoryGroup } from '../lib/seamlessFlow/categoryGroup';
import {
  cookPromptKeyForCookNow,
  cookPromptKeyForMeal,
  pickDuePlannedMeal,
  type CookConfirmVia,
} from '../lib/seamlessFlow/cookPrompt';
import {
  markCookPromptAsked,
  readCookPromptAskedKeys,
} from '../lib/seamlessFlow/cookPromptStorage';
import {
  categoryGroupForTarget,
  scheduleTargetFromKitchenRecipe,
  scheduleTargetFromMealPlanItem,
} from '../lib/mealCalendar/scheduleTarget';
import type { ScheduleRecipeTarget } from '../lib/mealCalendar/scheduleTarget';
import { appendRecipeEngagementEvent, createSeamlessEngagementEvent } from '../lib/recipeRanking';
import { refKeyForKitchenRecipe } from '../lib/savedRecipes/refKey';
import { SEAMLESS_FLOW_COPY } from '../config/seamlessFlow';
import type { GroceryPlannedMealLink } from '../types/mealprep';
import { router } from 'expo-router';
import { APP_ROUTES } from '../config/appRoutes';
import { deleteUserAccount } from '../lib/account/deleteAccount';
import {
  isPostSignupSetupDone,
  consumeAwaitingProfileSetup,
  markAwaitingProfileSetup,
  markPostSignupSetupDone,
} from '../lib/account/postSignupSetupStorage';
import type { AvatarUploadResult } from '../lib/avatars/uploadAvatar';
import { clearAvatarPhoto, uploadAvatarImage } from '../lib/avatars/uploadAvatar';
import type { PreparedAvatarImage } from '../lib/avatars/types';
import { MEAL_CALENDAR } from '../config/mealCalendar';
import { USER_PREFERENCE_DEFAULTS } from '../config/userPreferences';
import { filterPantryMatchesForDietPrefs } from '../lib/diet/filterRows';
import {
  DEFAULT_USER_DIET_PREFS,
  readLocalUserDietPrefs,
  writeLocalUserDietPrefs,
} from '../lib/diet/prefs';
import { ingredientLinesFromRecipe } from '../lib/diet/ingredientLines';
import type { UserDietPrefs } from '../lib/diet/types';
import { fetchUserDietPrefs, upsertUserDietPrefs } from '../lib/supabaseDietPrefs';
import {
  applyPantryDeductions,
  buildPantryDeductionLines,
  matchedRowsForReview,
  mealMadeReviewRowsWithDeductions,
  restorePantryFromDeductions,
  type MealMadeReviewRow,
  type PantryDeductionLine,
} from '../lib/mealPlan/pantryDeduction';
import { scoreRecipeAgainstPantry, scoreRecipeForPantryDeduction } from '../lib/recipeMatch/match';
import {
  filterRankedMatches,
  updatePantryMatchIndex,
  recipeServingScale,
  scaleRecipeIngredients,
  withServingScale,
  type PantryMatchIndex,
  type RecipePantryMatch,
} from '../lib/recipeMatch';
import {
  DEFAULT_MIN_MATCHED_INGREDIENTS,
  KITCHEN_LIST_DEFAULT_MIN_PERCENT,
  RECIPE_MATCHING,
} from '../config/recipeMatching';
import { scoreDiscoveryRecipeAgainstPantry } from '../lib/recipeDiscovery/scorePantry';
import {
  kitchenRecipesForPantryMatch,
  kitchenRecipesWithMealPlanContext,
  recipesForRecipesFeed,
} from '../lib/recipeMatch/kitchenCatalogMerge';
import { usePublishedLibraryRecipes } from '../hooks/usePublishedLibraryRecipes';
import { findKitchenRecipeById } from '../lib/mealPlan/kitchenRecipeLookup';
import {
  diffPantryForServer,
  mergePantryStock,
  replacePantryRowsById,
  reconcilePantryAfterServerLoad,
} from '../lib/pantry/mergePantryStock';
import { buildManualPantryItem } from '../lib/pantry/manualPantryItem';
import {
  cancelManualInsert,
  completeManualInsertTracking,
  createManualInsertCoordinator,
  isManualInsertCancelled,
  isManualPantryLocalId,
  mergeSavedManualPantryItem,
  rollbackManualPantryItem,
  trackManualInsert,
} from '../lib/pantry/manualPantryInsertLifecycle';
import { syncPantryToSnapshot } from '../lib/pantry/syncPantrySnapshot';
import { isPersistedRowUuid } from '../lib/pantry/persistIds';
import { writeAccountPantryCache } from '../lib/pantry/writeAccountPantryCache';
import { PANTRY_RESTOCK_COPY } from '../config/pantryRestock';
import { PANTRY_SCAN_UI_COPY, writeLastPantryScanLocation } from '../config/pantryScan';
import { markForkinatorPantryScanCompleted } from '../lib/forkinator/hasScanned';
import { emitForkinatorRestockAfterCook } from '../lib/forkinator/restockAfterCookEvent';
import { PANTRY_STAPLES_COPY } from '../config/pantryStaples';
import { stapleSelectionsToPantryItems, type StapleSelectionState } from '../lib/pantry/stapleCatalog';
import { reviewItemsToPantryItems } from '../lib/pantryVision/reviewItems';
import { runScanPhotoRetentionCleanupIfDue } from '../lib/scanPhotos/cleanup';
import type { PantryScanReviewItem } from '../lib/pantryVision/types';
import {
  clearGuestKitchenStorage,
  readGuestGrocery,
  readGuestKitchenSnapshot,
  readGuestMealPlan,
  readGuestPantry,
  readGuestRecipes,
  writeGuestGrocery,
  writeGuestMealPlan,
  writeGuestPantry,
  writeGuestRecipes,
} from '../lib/guest/localKitchenStore';
import { localDateString } from '../lib/communityDeals/localDate';
import { formatAddedToCalendarMessage } from '../lib/mealCalendar/formatScheduleToast';
import { mergeGuestKitchenIntoAccount } from '../lib/guest/mergeGuestKitchen';
import { clearGuestSavedRecipes, readGuestSavedRecipes } from '../lib/savedRecipes/localStore';
import { mergeGuestSavedRecipesIntoAccount } from '../lib/savedRecipes/supabaseStore';
import { readJson, removeStorageKey, writeJson } from '../lib/storage';
import {
  readAccountKitchenCache,
  writeAccountKitchenCache,
} from '../lib/account/accountKitchenCache';
import { clearLastAccountUserId, writeLastAccountUserId } from '../lib/account/lastAccountUser';
import { resolveOfflineKitchenUserId } from '../lib/account/offlineKitchenUser';
import { clearUserScopedLocalStorage } from '../lib/account/clearUserScopedLocalStorage';
import { isOffline } from '../lib/network/isOffline';
import { clearAddPriceMemory } from '../lib/smartShop/addPriceMemory';
import { subscribeMealDbKitchenCacheChanged } from '../lib/mealdb/kitchenCacheNotify';
import { getSupabase } from '../lib/supabase';
import { recipeApiToAppRecipe } from '../lib/recipeDiscovery/mapToAppRecipe';
import {
  isRecipeApiInLibrary,
  parseRecipeApiNumericId,
  recipeApiMasterSlug,
  recipeApiPersonalSlug,
  resolveDiscoveryGroceryRecipeId,
} from '../lib/recipeDiscovery/slugs';
import type { RecipeDiscoveryListItem } from '../lib/recipeDiscovery/types';
import { recipeWithoutSourceAttribution } from '../lib/recipeImport/clearRecipeSource';
import { mapExtractedImportToRecipe } from '../lib/recipeImport/mapToAppRecipe';
import type { RecipeImportExtractedDto } from '../lib/recipeImport/types';
import {
  resolveDiscoveryRecipeImageUrl,
  resolveKitchenRecipeImageUrl,
} from '../lib/recipes/recipeImageUrl';
import {
  mealPlanItemsInWeekWindow,
  recipeIdsForScheduledMeals,
} from '../lib/mealCalendar/weekGroceries';
import { activeMealPlanRecipeIds, isRecipeOnMealPlan, resolveMealPlanRecipeId } from '../lib/mealPlan/resolve';
import {
  applyMealPlanRemoval,
  buildLinkedLeftoverEntry,
  idsRemovedByMealPlanDelete,
} from '../lib/mealCalendar/leftovers';
import { hydrateLocationFromProfile } from '../lib/smartShop/profileLocation';
import {
  fetchLiveBundle,
  deleteGroceryItems,
  deleteMealPlanItem,
  insertGroceryItem,
  insertMealPlanItem,
  insertPantryItem,
  insertPantryItems,
  deleteAllPantryItems,
  deletePantryItemsByIds,
  replaceGroceryList,
  updateGroceryChecked,
  updateMasterRecipe,
  updateMealPlanItem,
  updatePantryItem,
  updateProfileFields,
  updateProfilePreferences,
  upsertFeatureFlag,
  upsertImportedRecipe,
  upsertLinkImportedRecipe,
} from '../lib/supabaseData';
import type {
  FeatureFlags,
  GroceryListItem,
  MealPlanItem,
  MealPrepSummary,
  MealSlot,
  PantryItem,
  PantryCategory,
  PantryStorageLocation,
  Recipe,
  RecipeIngredient,
  UserAnalytics,
  UserPreferences,
  UserProfile,
  UserRole,
} from '../types/mealprep';

const STORAGE_KEYS = {
  role: 'mealprep.demoRole',
  pantry: 'mealprep.pantry',
  recipes: 'mealprep.recipes',
  grocery: 'mealprep.grocery',
  selectedRecipes: 'mealprep.selectedRecipes',
  mealPlan: 'mealprep.mealPlan',
  servingOverrides: 'mealprep.servingOverrides',
  flags: 'mealprep.featureFlags',
  userPreferences: 'mealprep.userPreferences',
};

function initialMealPlan(demoMode: boolean): MealPlanItem[] {
  if (!demoMode) return [];
  const stored = readJson<MealPlanItem[] | null>(STORAGE_KEYS.mealPlan, null);
  if (stored && stored.length > 0) {
    return stored.map((row) => ({
      ...row,
      scheduledOn: row.scheduledOn ?? null,
      mealSlot: row.mealSlot ?? null,
      madeAt: row.madeAt ?? null,
      leftoverOfId: row.leftoverOfId ?? null,
      linkedLeftoverId: row.linkedLeftoverId ?? null,
    }));
  }
  const legacyIds = readJson<string[]>(STORAGE_KEYS.selectedRecipes, ['lemon-chicken', 'pulled-pork']);
  const now = new Date().toISOString();
  return legacyIds.map((slug) => {
    const recipe = MOCK_RECIPES.find((r) => r.id === slug);
    return {
      id: `demo-plan-${slug}`,
      recipeSlug: slug,
      recipeApiId: null,
      title: recipe?.name ?? slug,
      imageUrl: null,
      made: false,
      madeAt: null,
      addedAt: now,
      scheduledOn: null,
      mealSlot: null,
      leftoverOfId: null,
      linkedLeftoverId: null,
    };
  });
}

const GUEST_PROFILE: UserProfile = {
  id: '',
  email: '',
  name: 'Guest',
  role: 'member',
  plan: 'free',
  photoUrl: null,
  householdSize: 2,
  dietaryNotes: '',
  createdAt: new Date(0).toISOString(),
  preferences: { ...USER_PREFERENCE_DEFAULTS },
};

interface UndoToastState {
  message: string;
  onUndo: () => void;
  actionLabel?: string;
  onAction?: () => void;
  showUndo?: boolean;
}

interface MealMadeUndoState {
  mealPlanItemId: string | null;
  previousMeal: MealPlanItem | null;
  pantrySnapshot: PantryItem[];
  deductionLines: PantryDeductionLine[];
}

interface MealMadeReviewState {
  mealPlanItemId: string | null;
  recipeId: string;
  pendingCookEngagement: CookConfirmPromptState | null;
  selectedPantryIds: Set<string>;
}

export interface CookConfirmPromptState {
  key: string;
  title: string;
  mealPlanItemId: string | null;
  recipeId: string;
  refKey: string;
  source: import('../lib/recipeRanking/types').RecipeEngagementSource;
  group: import('../lib/recipeRanking/types').RecipeCategoryGroup;
  sheetId: string | null;
  via: CookConfirmVia;
}

interface AppContextValue {
  appName: string;
  demoMode: boolean;
  /** Signed-out user on a live Supabase build (local pantry/grocery). */
  isGuest: boolean;
  /** Signed-in user's profile row loaded from Supabase (always true in demo / guest). */
  profileReady: boolean;
  authReady: boolean;
  authError: string | null;
  /** Grocery / kitchen sync errors (shown on Grocery, not Account). */
  kitchenError: string | null;
  clearKitchenError: () => void;
  session: Session | null;
  profile: UserProfile;
  isAdmin: boolean;
  setDemoRole: (role: UserRole) => void;
  signInWithPassword: (email: string, password: string) => Promise<AuthActionResult>;
  signUpWithPassword: (email: string, password: string, name: string) => Promise<AuthActionResult>;
  signInWithMagicLink: (email: string) => Promise<AuthActionResult>;
  /** Emails a link for choosing a new password. Answers the same whether or not the address has an account. */
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  /** Sets a new password for the signed-in account (used after opening a reset link). */
  updatePassword: (password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  pantry: PantryItem[];
  recipes: Recipe[];
  grocery: GroceryListItem[];
  mealPlan: MealPlanItem[];
  /** Recipe ids driving grocery sync (active meal plan entries). */
  plannedRecipeIds: string[];
  servingOverrides: Record<string, number>;
  featureFlags: FeatureFlags;
  maintenanceActive: boolean;
  summary: MealPrepSummary;
  analytics: UserAnalytics;
  /** False while a signed-in account's real totals are still loading (`analytics` holds sample figures until then). */
  analyticsLoaded: boolean;
  toggleMealPlanKitchenRecipe: (recipeId: string) => Promise<void>;
  toggleMealPlanDiscoveryRecipe: (item: RecipeDiscoveryListItem) => Promise<void>;
  removeMealPlanItem: (id: string) => Promise<void>;
  openMealMadeReview: (mealPlanItemId: string) => void;
  closeMealMadeReview: () => void;
  toggleMealMadePantryUse: (pantryItemId: string, useFromPantry: boolean) => void;
  confirmMealMade: () => Promise<void>;
  undoLastMealMade: (mealPlanItemId?: string) => Promise<void>;
  mealMadeReview: MealMadeReviewState | null;
  mealMadeReviewTitle: string | null;
  mealMadeReviewRows: MealMadeReviewRow[];
  mealMadeBusy: boolean;
  cookConfirmPrompt: CookConfirmPromptState | null;
  beginCookViewSession: (target: ScheduleRecipeTarget) => void;
  finishCookViewSession: () => void;
  confirmCookConfirmPrompt: () => Promise<void>;
  declineCookConfirmPrompt: () => void;
  dismissCookConfirmPrompt: () => void;
  cookConfirmBusy: boolean;
  /** Pantry/grocery hydration complete for Forkinator and guest kitchen. */
  kitchenPantryReady: boolean;
  isOnMealPlan: (options: { recipeSlug?: string; recipeApiId?: number }) => boolean;
  scheduleMealFromRecipe: (input: {
    recipeId: string;
    recipeSlug: string | null;
    recipeApiId: number | null;
    title: string;
    imageUrl: string | null;
    scheduledOn: string;
    mealSlot: MealSlot;
    makesLeftovers?: boolean;
  }) => Promise<{ parentId: string; leftoverId?: string | null }>;
  notifyMealScheduled: (
    result: { parentId: string; leftoverId?: string | null },
    scheduledOn: string,
    mealSlot: MealSlot,
  ) => void;
  updateMealPlanSchedule: (
    id: string,
    patch: Partial<Pick<MealPlanItem, 'scheduledOn' | 'mealSlot'>>,
  ) => Promise<void>;
  shopForWeekScheduledMeals: () => void;
  addMissingForPlannedMealsToGrocery: () => void;
  userPreferences: UserPreferences;
  setUserPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  userDietPrefs: UserDietPrefs;
  saveUserDietPrefs: (prefs: UserDietPrefs) => Promise<void>;
  undoToast: UndoToastState | null;
  dismissUndoToast: () => void;
  notifySavedToMyRecipes: (onViewMyRecipes: () => void) => void;
  notifyRemovedFromMyRecipes: (onUndo: () => void) => void;
  notifyMyRecipesSaveFailed: () => void;
  notifyRecipeHiddenForDietSettings: () => void;
  notifyRecipeOfflineUnavailable: () => void;
  notifyRecipeLookupNotReady: () => void;
  savedRecipes: SavedRecipesController;
  registerSavedRecipeToggleOutcome: (handler: ((outcome: SavedRecipeToggleOutcome) => void) | null) => void;
  toggleGroceryItem: (id: string) => void;
  toggleGroceryItemsChecked: (ids: string[], checked?: boolean) => void;
  /**
   * Ticks grocery rows as bought WITHOUT adding them to the pantry. Used after a receipt scan,
   * which has already added what was bought; ticking the normal way would add it twice.
   */
  markGroceryItemsBought: (ids: string[]) => void;
  addManualGroceryItem: (input: {
    name: string;
    quantity: number;
    unit: string;
    category: PantryCategory;
  }) => Promise<string | null>;
  clearCheckedGroceryItems: () => void;
  removeGroceryItem: (id: string) => void;
  seedPantry: () => void;
  updateRecipe: (recipe: Recipe) => void;
  importDiscoveredRecipe: (
    recipe: Recipe,
    options: { asMaster: boolean; recipeApiId: number },
  ) => Promise<Recipe>;
  saveLinkImportedRecipe: (extracted: RecipeImportExtractedDto) => Promise<Recipe>;
  clearImportedRecipeSource: (recipeId: string) => Promise<void>;
  addPantryFromScan: (name: string, photoUri: string | null) => void;
  addManualPantryItem: (input: {
    name: string;
    quantity: number;
    unit: string;
    category: PantryCategory;
    location: PantryStorageLocation;
    expiresOn?: string | null;
  }) => Promise<void>;
  updatePantryItemEntry: (item: PantryItem) => Promise<void>;
  deletePantryItemEntry: (id: string) => Promise<void>;
  clearPantryLocation: (location: PantryStorageLocation) => Promise<void>;
  clearAllPantry: () => Promise<void>;
  previewPantryResort: () => PantryResortPreview;
  resortPantryItemsInDefaultLocation: () => Promise<PantryResortPreview>;
  savePantryScanReview: (
    items: PantryScanReviewItem[],
    scanPhotoPath?: string | null,
    scanLocation?: PantryStorageLocation,
  ) => Promise<void>;
  addPantryStaples: (selections: StapleSelectionState[]) => Promise<void>;
  setFeatureFlag: (key: keyof FeatureFlags, value: boolean) => void;
  refreshGrocery: () => void;
  appendMissingIngredientsForPlannedMeal: (
    recipeId: string,
    missing: RecipeIngredient[],
    link: GroceryPlannedMealLink,
  ) => void;
  pantryRecipeMatches: PantryMatchIndex;
  /** Pantry-ranked kitchen recipes after diet/allergy hiding rules. */
  pantryRecipeMatchesRankedFiltered: RecipePantryMatch[];
  pantryRecipeRecommendations: RecipePantryMatch[];
  /** Published MealPlanatic library recipes (Supabase). */
  libraryRecipes: Recipe[];
  /** Kitchen + library + imports for Recipes tab and meal-plan grocery resolution. */
  feedKitchenRecipes: Recipe[];
  /** Account/library catalog without browsed MealDB snapshot rows (Home catalog only). */
  catalogKitchenRecipes: Recipe[];
  refreshLibraryRecipes: () => void;
  libraryRecipesLoading: boolean;
  addMissingRecipeIngredientsToGrocery: (recipeId: string, matchOverride?: RecipePantryMatch) => void;
  addMissingDiscoveryRecipeIngredientsToGrocery: (item: RecipeDiscoveryListItem) => void;
  accountUi: {
    sheet: 'closed' | 'auth' | 'account';
    showPostSignupSetup: boolean;
    /** True after a password reset link was opened: the "choose a new password" sheet is up. */
    showPasswordRecovery: boolean;
    dismissPasswordRecovery: () => void;
    openAuthSheet: () => void;
    openAccountSheet: () => void;
    closeSheet: () => void;
  };
  openAuthSheet: () => void;
  openAccountSheet: () => void;
  /** Re-reads only the signed-in user's plan (after checkout or billing changes). */
  refreshProfilePlan: () => Promise<UserPlan | null>;
  /** Shows a short message in the toast area with no Undo. */
  showNotice: (message: string) => void;
  saveProfileSetup: (patch: {
    name?: string;
    homeZip?: string;
    homeLat?: number;
    homeLng?: number;
    householdSize?: number;
    dietaryNotes?: string;
  }) => Promise<void>;
  uploadProfilePhoto: (prepared: PreparedAvatarImage) => Promise<AvatarUploadResult>;
  removeProfilePhoto: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  completePostSignupSetup: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const demoMode = isDemoMode();
  const supabase = demoMode ? null : getSupabase();
  const hydrated = useHydrated();

  const [authReady, setAuthReady] = useState(demoMode);
  const [authError, setAuthError] = useState<string | null>(null);
  const [kitchenError, setKitchenError] = useState<string | null>(null);
  const groceryRestockLedgerRef = useRef(new Map<string, { pantryItemId: string; quantityAdded: number; unit: string }>());
  const pendingManualPantryInsertsRef = useRef(createManualInsertCoordinator());
  /** Local ids of hand-added pantry rows whose save is on its way to the server right now. */
  const manualPantryInsertsInFlightRef = useRef(new Set<string>());
  const pendingManualGroceryInsertsRef = useRef(createManualGroceryInsertCoordinator());
  /** Manual grocery adds that finished saving, keyed by their optimistic local id (FK3-6). */
  const savedManualGroceryByLocalIdRef = useRef(new Map<string, GroceryListItem>());
  const [session, setSession] = useState<Session | null>(null);
  const [liveProfile, setLiveProfile] = useState<UserProfile | null>(null);

  const [role, setRole] = useState<UserRole>('admin');
  const [pantry, setPantry] = useState<PantryItem[]>(() =>
    demoMode ? normalizePantryItemList(readJson(STORAGE_KEYS.pantry, [])) : [],
  );
  const [recipes, setRecipes] = useState<Recipe[]>(() => (demoMode ? MOCK_RECIPES : []));
  const [grocery, setGrocery] = useState<GroceryListItem[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlanItem[]>([]);
  const [liveDataLoaded, setLiveDataLoaded] = useState(demoMode);
  const [servingOverrides, setServingOverrides] = useState<Record<string, number>>({});
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(USER_PREFERENCE_DEFAULTS);
  const [userDietPrefs, setUserDietPrefs] = useState<UserDietPrefs>(DEFAULT_USER_DIET_PREFS);
  const [guestKitchenHydrated, setGuestKitchenHydrated] = useState(() => demoMode);

  useEffect(() => {
    if (!hydrated) return;
    setUserDietPrefs(readLocalUserDietPrefs());
    setUserPreferences({
      ...USER_PREFERENCE_DEFAULTS,
      ...readJson(STORAGE_KEYS.userPreferences, USER_PREFERENCE_DEFAULTS),
    });
    setServingOverrides(readJson(STORAGE_KEYS.servingOverrides, {}));
    if (!demoMode) return;
    setRole(readJson(STORAGE_KEYS.role, 'admin'));
    setPantry(normalizePantryItemList(readJson(STORAGE_KEYS.pantry, [])));
    setRecipes(readJson(STORAGE_KEYS.recipes, MOCK_RECIPES));
    setGrocery(readJson(STORAGE_KEYS.grocery, []));
    setMealPlan(initialMealPlan(true));
    setFeatureFlags(readJson(STORAGE_KEYS.flags, DEFAULT_FEATURE_FLAGS));
  }, [demoMode, hydrated]);
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [mealMadeReview, setMealMadeReview] = useState<MealMadeReviewState | null>(null);
  /** Latest planned-meal undo; a ref so the toast's Undo never reads a stale closure (FK3-1). */
  const mealMadeUndoRef = useRef<MealMadeUndoState | null>(null);
  const latestPantryRef = useRef<PantryItem[]>(pantry);
  const [mealMadeBusy, setMealMadeBusy] = useState(false);
  const [cookConfirmPrompt, setCookConfirmPrompt] = useState<CookConfirmPromptState | null>(null);
  const [cookConfirmBusy, setCookConfirmBusy] = useState(false);
  const cookViewSessionRef = useRef<ScheduleRecipeTarget | null>(null);
  const [liveAnalytics, setLiveAnalytics] = useState<UserAnalytics | null>(null);
  const [accountSheet, setAccountSheet] = useState<'closed' | 'auth' | 'account'>('closed');
  const [showPostSignupSetup, setShowPostSignupSetup] = useState(false);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [demoProfilePatch, setDemoProfilePatch] = useState<Partial<UserProfile>>({});
  const [offlineKitchenUserId, setOfflineKitchenUserId] = useState<string | null>(null);
  const sessionUserId = session?.user.id ?? null;
  const userId = sessionUserId ?? offlineKitchenUserId;
  const offlineKitchenView = Boolean(!sessionUserId && offlineKitchenUserId);

  const profile = useMemo<UserProfile>(() => {
    if (demoMode) {
      return { ...profileForRole(role), ...demoProfilePatch, preferences: userPreferences };
    }
    if (liveProfile) {
      return { ...liveProfile, preferences: userPreferences };
    }
    if (userId) {
      const cached = readAccountKitchenCache(userId);
      if (cached?.profile) {
        return { ...cached.profile, preferences: userPreferences };
      }
    }
    return { ...GUEST_PROFILE, preferences: userPreferences };
  }, [demoMode, demoProfilePatch, liveProfile, role, userId, userPreferences]);
  const isAdmin = profile.role === 'admin';
  const maintenanceActive = featureFlags.maintenanceMode && !isAdmin;
  const isGuest = !demoMode && !userId;
  const profileReady =
    demoMode || (authReady && (userId ? liveDataLoaded : guestKitchenHydrated));
  const ownerId = userId ?? (demoMode ? profile.id || 'demo-user' : GUEST_OWNER_ID);

  const {
    libraryRecipes,
    loading: libraryRecipesLoading,
    refreshLibrary: refreshLibraryRecipes,
  } = usePublishedLibraryRecipes();

  const [mealDbKitchenCacheTick, setMealDbKitchenCacheTick] = useState(0);
  useEffect(() => subscribeMealDbKitchenCacheChanged(() => setMealDbKitchenCacheTick((v) => v + 1)), []);

  const feedKitchenRecipes = useMemo(
    () => kitchenRecipesWithMealPlanContext(recipes, libraryRecipes, pantry, mealPlan),
    [libraryRecipes, mealDbKitchenCacheTick, mealPlan, pantry, recipes],
  );

  const catalogKitchenRecipes = useMemo(
    () => recipesForRecipesFeed(recipes, libraryRecipes),
    [libraryRecipes, recipes],
  );

  const plannedRecipeIds = useMemo(
    () => activeMealPlanRecipeIds(mealPlan, feedKitchenRecipes, ownerId),
    [feedKitchenRecipes, mealPlan, ownerId],
  );

  const groceryDismissalContext = useMemo(
    () => ({ plannedRecipeIds, recipes: feedKitchenRecipes }),
    [feedKitchenRecipes, plannedRecipeIds],
  );

  const loadLiveData = useCallback(async () => {
    if (!supabase || !userId) return;
    const cachedKitchen = readAccountKitchenCache(userId);
    if (!cachedKitchen) {
      setLiveDataLoaded(false);
    }
    const guestKitchen = readGuestKitchenSnapshot();
    let bundle;
    try {
      bundle = await fetchLiveBundle(supabase, userId);
    } catch (error: unknown) {
      if (cachedKitchen) {
        setLiveProfile(cachedKitchen.profile);
        setPantry(normalizePantryItemList(cachedKitchen.pantry));
        setGrocery(cachedKitchen.grocery);
        setMealPlan(cachedKitchen.mealPlan);
        setRecipes(cachedKitchen.recipes);
        setLiveDataLoaded(true);
        setKitchenError(
          error instanceof Error ? error.message : 'Offline — showing your last saved kitchen data',
        );
        return;
      }
      throw error;
    }
    if (bundle.profile) {
      setLiveProfile(bundle.profile);
      setUserPreferences((prev) => ({
        ...prev,
        autoAddMissingToGrocery: bundle.profile!.preferences.autoAddMissingToGrocery,
      }));
      hydrateLocationFromProfile(bundle.profile);
    }

    try {
      const remoteDietPrefs = await fetchUserDietPrefs(supabase, userId);
      if (remoteDietPrefs) {
        setUserDietPrefs(remoteDietPrefs);
        writeLocalUserDietPrefs(remoteDietPrefs);
      }
    } catch {
      // Table may not exist until migration is applied.
    }

    let nextPantry = normalizePantryItemList(bundle.pantry);
    let nextGrocery = bundle.grocery;

    let nextMealPlan = bundle.mealPlan ?? [];
    let nextRecipes = bundle.recipes.length > 0 ? bundle.recipes : [];

    if (
      guestKitchen.pantry.length > 0 ||
      guestKitchen.grocery.length > 0 ||
      guestKitchen.mealPlan.length > 0
    ) {
      const merged = mergeGuestKitchenIntoAccount(
        nextPantry,
        nextGrocery,
        guestKitchen.pantry,
        guestKitchen.grocery,
        nextMealPlan,
        guestKitchen.mealPlan,
      );
      nextPantry = normalizePantryItemList(merged.pantry);
      nextGrocery = merged.grocery;
      nextMealPlan = merged.mealPlan;

      for (const row of merged.pantryUpdates) {
        await updatePantryItem(supabase, userId, row);
      }
      if (merged.pantryInserts.length > 0) {
        const inserted = await insertPantryItems(supabase, userId, merged.pantryInserts);
        const insertIds = new Set(merged.pantryInserts.map((row) => row.id));
        nextPantry = [
          ...inserted,
          ...nextPantry.filter((row) => !insertIds.has(row.id)),
        ];
      }
      // Each part of the guest kitchen is forgotten as soon as it is saved to the account. If a
      // later step fails, the next load must not add the already-saved pantry to the account again.
      writeGuestPantry([]);
      nextGrocery = await replaceGroceryList(supabase, userId, groceryListForServerSync(nextGrocery));
      writeGuestGrocery([]);

      for (const guestRecipe of guestKitchen.recipes) {
        const recipeApiId = parseRecipeApiNumericId(guestRecipe.id);
        const exists = nextRecipes.some((row) => row.id === guestRecipe.id);
        if (!exists && recipeApiId != null) {
          const saved = await upsertImportedRecipe(supabase, userId, guestRecipe, {
            asMaster: false,
            recipeApiId,
          });
          nextRecipes = [saved, ...nextRecipes];
        } else if (!exists) {
          nextRecipes = [guestRecipe, ...nextRecipes];
        }
      }

      const insertedMeals: MealPlanItem[] = [];
      for (const row of merged.mealPlanInserts) {
        insertedMeals.push(await insertMealPlanItem(supabase, userId, row));
      }
      if (insertedMeals.length > 0) {
        const guestIds = new Set(merged.mealPlanInserts.map((row) => row.id));
        nextMealPlan = [
          ...insertedMeals,
          ...nextMealPlan.filter((row) => !guestIds.has(row.id)),
        ];
      }

      clearGuestKitchenStorage();
    }

    const guestSavedRecipes = readGuestSavedRecipes();
    if (guestSavedRecipes.length > 0) {
      const accountRecipeIds = new Set(nextRecipes.map((row) => row.id));
      await mergeGuestSavedRecipesIntoAccount(supabase, userId, guestSavedRecipes, {
        accountRecipeIds,
      });
      clearGuestSavedRecipes();
    }

    removeStorageKey(STORAGE_KEYS.pantry);
    removeStorageKey(STORAGE_KEYS.grocery);
    removeStorageKey(STORAGE_KEYS.mealPlan);
    removeStorageKey(STORAGE_KEYS.recipes);
    let mergedPantry = nextPantry;
    setPantry((prev) => {
      mergedPantry = reconcilePantryAfterServerLoad(nextPantry, prev);
      return mergedPantry;
    });
    // Rows added by hand while offline exist only on this device (the offline add returns before
    // any save). Now that the server answered, save them, or they would never reach the account.
    const offlineAdds = mergedPantry.filter(
      (row) => isManualPantryLocalId(row.id) && !manualPantryInsertsInFlightRef.current.has(row.id),
    );
    if (offlineAdds.length > 0) {
      try {
        const savedAdds = await insertPantryItems(supabase, userId, offlineAdds);
        const savedByLocalId = new Map(offlineAdds.map((row, index) => [row.id, savedAdds[index]]));
        const swap = (rows: PantryItem[]) => rows.map((row) => savedByLocalId.get(row.id) ?? row);
        mergedPantry = swap(mergedPantry);
        setPantry(swap);
      } catch {
        // Still offline or the save was refused: the rows stay on this device and are retried on the next load.
      }
    }
    setRecipes(nextRecipes);
    setGrocery(nextGrocery);
    setFeatureFlags(bundle.featureFlags);
    setMealPlan(nextMealPlan);
    setLiveAnalytics(bundle.analytics);
    setLiveDataLoaded(true);

    if (bundle.profile) {
      writeLastAccountUserId(userId);
      writeAccountKitchenCache({
        userId,
        savedAt: new Date().toISOString(),
        profile: bundle.profile,
        pantry: mergedPantry,
        grocery: nextGrocery,
        mealPlan: nextMealPlan,
        recipes: nextRecipes,
      });
    }
  }, [supabase, userId]);

  const clearKitchenError = useCallback(() => setKitchenError(null), []);

  const openAuthSheet = useCallback(() => setAccountSheet('auth'), []);
  const openAccountSheet = useCallback(() => setAccountSheet('account'), []);
  const closeAccountSheet = useCallback(() => setAccountSheet('closed'), []);

  const completePostSignupSetup = useCallback(() => {
    if (userId) markPostSignupSetupDone(userId);
    setShowPostSignupSetup(false);
  }, [userId]);

  const saveUserDietPrefs = useCallback(
    async (prefs: UserDietPrefs) => {
      setUserDietPrefs(prefs);
      writeLocalUserDietPrefs(prefs);
      if (demoMode || !supabase || !userId) return;
      try {
        const saved = await upsertUserDietPrefs(supabase, userId, prefs);
        setUserDietPrefs(saved);
        writeLocalUserDietPrefs(saved);
      } catch {
        // Best-effort until migration is applied.
      }
    },
    [demoMode, supabase, userId],
  );

  const saveProfileSetup = useCallback(
    async (patch: {
      name?: string;
      homeZip?: string;
      homeLat?: number;
      homeLng?: number;
      householdSize?: number;
      dietaryNotes?: string;
    }) => {
      const { persistHomeLocation } = await import('../lib/smartShop/profileLocation');
      const zipForLocation =
        patch.homeZip !== undefined && patch.homeZip.trim() ? patch.homeZip.trim().slice(0, 5) : undefined;
      const hasCoords = patch.homeLat != null && patch.homeLng != null;

      if (demoMode) {
        setDemoProfilePatch((prev) => ({
          ...prev,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.homeZip !== undefined ? { homeZip: patch.homeZip.trim() || undefined } : {}),
          ...(patch.householdSize !== undefined ? { householdSize: patch.householdSize } : {}),
          ...(patch.dietaryNotes !== undefined ? { dietaryNotes: patch.dietaryNotes } : {}),
          ...(hasCoords
            ? {
                homeLat: patch.homeLat,
                homeLng: patch.homeLng,
                homeLocationUpdatedAt: new Date().toISOString(),
              }
            : {}),
        }));
        if (zipForLocation || hasCoords) {
          await persistHomeLocation({
            zip: zipForLocation,
            lat: hasCoords ? patch.homeLat : undefined,
            lng: hasCoords ? patch.homeLng : undefined,
          });
        }
        return;
      }
      if (!supabase || !userId) throw new Error('Sign in to save your profile.');
      const updated = await updateProfileFields(supabase, userId, {
        name: patch.name,
        homeZip: patch.homeZip,
        householdSize: patch.householdSize,
        dietaryNotes: patch.dietaryNotes,
      });
      setLiveProfile(
        hasCoords
          ? {
              ...updated,
              homeLat: patch.homeLat,
              homeLng: patch.homeLng,
              homeLocationUpdatedAt: new Date().toISOString(),
            }
          : updated,
      );
      if (zipForLocation || hasCoords) {
        await persistHomeLocation({
          zip: zipForLocation,
          lat: hasCoords ? patch.homeLat : undefined,
          lng: hasCoords ? patch.homeLng : undefined,
        });
      }
    },
    [demoMode, supabase, userId],
  );

  const uploadProfilePhoto = useCallback(
    async (prepared: PreparedAvatarImage) => {
      if (demoMode) {
        const result = { photoUrl: prepared.uri, storagePath: 'demo' };
        setDemoProfilePatch((prev) => ({ ...prev, photoUrl: result.photoUrl }));
        return result;
      }
      if (!userId) throw new Error('Sign in to upload a profile photo.');
      const result = await uploadAvatarImage(prepared, userId);
      setLiveProfile((prev) => (prev ? { ...prev, photoUrl: result.photoUrl } : prev));
      return result;
    },
    [demoMode, userId],
  );

  const removeProfilePhoto = useCallback(async () => {
    if (demoMode) {
      setDemoProfilePatch((prev) => ({ ...prev, photoUrl: null }));
      return;
    }
    if (!userId) return;
    await clearAvatarPhoto(userId);
    setLiveProfile((prev) => (prev ? { ...prev, photoUrl: null } : prev));
  }, [demoMode, userId]);

  useEffect(() => {
    if (demoMode || !supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user?.id) {
        writeLastAccountUserId(data.session.user.id);
        setOfflineKitchenUserId(null);
        setSession(data.session);
      } else {
        const offlineId = resolveOfflineKitchenUserId(null);
        setOfflineKitchenUserId(offlineId);
        setSession(data.session);
      }
      setAuthReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!nextSession?.user?.id && isOffline()) {
        const offlineId = resolveOfflineKitchenUserId(null);
        if (offlineId) {
          setOfflineKitchenUserId(offlineId);
          setAuthReady(true);
          return;
        }
      }
      if (nextSession?.user?.id) {
        writeLastAccountUserId(nextSession.user.id);
        setOfflineKitchenUserId(null);
      }
      setSession(nextSession);
      setAuthReady(true);
      // A password reset link signs the person in and announces itself with this event.
      if (event === 'PASSWORD_RECOVERY' && nextSession?.user?.id) {
        setShowPasswordRecovery(true);
      }
      const email = nextSession?.user?.email;
      const id = nextSession?.user?.id;
      if (event === 'SIGNED_IN' && email && id && !isPostSignupSetupDone(id)) {
        if (consumeAwaitingProfileSetup(email)) {
          setShowPostSignupSetup(true);
        }
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [demoMode, supabase]);

  useEffect(() => {
    if (demoMode || !supabase || !authReady) return;
    const refreshWhenOnline = () => {
      if (isOffline()) return;
      setOfflineKitchenUserId(null);
      void supabase.auth.refreshSession().then(({ data }) => {
        if (data.session) setSession(data.session);
      });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', refreshWhenOnline);
      return () => window.removeEventListener('online', refreshWhenOnline);
    }
    return undefined;
  }, [authReady, demoMode, supabase]);

  useEffect(() => {
    if (!hydrated || demoMode || !authReady) return;
    if (userId) return;
    setPantry(readGuestPantry());
    setGrocery(readGuestGrocery());
    setMealPlan(readGuestMealPlan());
    setRecipes(readGuestRecipes());
    setLiveDataLoaded(true);
    setGuestKitchenHydrated(true);
  }, [authReady, demoMode, hydrated, userId]);

  useEffect(() => {
    if (demoMode || !authReady || !userId) return;
    const cached = readAccountKitchenCache(userId);
    if (cached) {
      setLiveProfile(cached.profile);
      setPantry(normalizePantryItemList(cached.pantry));
      setGrocery(cached.grocery);
      setMealPlan(cached.mealPlan);
      setRecipes(cached.recipes);
      setLiveDataLoaded(true);
    }
  }, [authReady, demoMode, userId]);

  useEffect(() => {
    if (demoMode) return;
    if (!userId) {
      return;
    }
    void loadLiveData().catch((error: unknown) => {
      setLiveDataLoaded(true);
      if (offlineKitchenView && readAccountKitchenCache(userId)) return;
      if (isOffline() && readAccountKitchenCache(userId)) return;
      setAuthError(error instanceof Error ? error.message : 'Failed to load kitchen data');
    });
  }, [demoMode, offlineKitchenView, userId, loadLiveData]);

  useEffect(() => {
    if (demoMode || !userId) return;
    runScanPhotoRetentionCleanupIfDue(userId);
  }, [demoMode, userId]);

  const refreshGroceryNow = useCallback(() => {
    if (!featureFlags.grocerySync) return;
    if (!demoMode && userId && !liveDataLoaded) return;
    const dismissals = readGroceryDismissals(ownerId);
    const groceryRecipes = feedKitchenRecipes;
    setGrocery((prev) => {
      const next = buildGroceryList(groceryRecipes, plannedRecipeIds, pantry, servingOverrides, prev, {
        groceryDismissals: dismissals,
        mealPlan,
        userId: ownerId,
      });
      if (groceryListsEqual(prev, next)) return prev;
      if (demoMode) {
        writeJson(STORAGE_KEYS.grocery, next);
        return next;
      }
      if (isGuest) {
        writeGuestGrocery(next);
        return next;
      }
      if (supabase && userId && sessionUserId) {
        if (isOffline()) {
          if (userId) {
            const cached = readAccountKitchenCache(userId);
            if (cached) {
              writeAccountKitchenCache({ ...cached, grocery: next, savedAt: new Date().toISOString() });
            }
          }
          return next;
        }
        void enqueueGroceryPersist(() =>
          replaceGroceryList(
            supabase,
            userId,
            resolveGroceryListForServerSync(next, savedManualGroceryByLocalIdRef.current),
          ).then((persisted) => {
            setGrocery((current) => mergeServerGroceryWithPendingManual(current, persisted));
            return persisted;
          }),
        ).catch((error: unknown) => {
          if (isOffline()) return;
          setKitchenError(error instanceof Error ? error.message : 'Failed to save grocery list');
        });
        return next;
      }
      return next;
    });
  }, [
    demoMode,
    isGuest,
    featureFlags.grocerySync,
    liveDataLoaded,
    mealPlan,
    ownerId,
    pantry,
    plannedRecipeIds,
    feedKitchenRecipes,
    servingOverrides,
    sessionUserId,
    supabase,
    userId,
  ]);

  const refreshGrocery = useCallback(() => {
    refreshGroceryNow();
  }, [refreshGroceryNow]);

  useEffect(() => {
    const timer = setTimeout(() => refreshGroceryNow(), GROCERY_LIST_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    pantry,
    feedKitchenRecipes,
    plannedRecipeIds,
    servingOverrides,
    featureFlags.grocerySync,
    refreshGroceryNow,
  ]);

  const guestKitchenPersistReady = demoMode || (isGuest && guestKitchenHydrated);

  useHydrationGatedPersist(
    hydrated && demoMode,
    () => writeJson(STORAGE_KEYS.role, role),
    [role],
  );

  useHydrationGatedPersist(
    hydrated && guestKitchenPersistReady,
    () => {
      if (demoMode) writeJson(STORAGE_KEYS.pantry, pantry);
      else if (isGuest) writeGuestPantry(pantry);
    },
    [demoMode, isGuest, pantry],
  );

  useHydrationGatedPersist(
    hydrated && guestKitchenPersistReady,
    () => {
      if (demoMode) writeJson(STORAGE_KEYS.recipes, recipes);
      else if (isGuest) writeGuestRecipes(recipes);
    },
    [demoMode, isGuest, recipes],
  );

  useHydrationGatedPersist(
    hydrated && demoMode,
    () => writeJson(STORAGE_KEYS.flags, featureFlags),
    [featureFlags],
  );

  useHydrationGatedPersist(
    hydrated && (demoMode || isGuest || Boolean(userId)),
    () => writeJson(STORAGE_KEYS.userPreferences, userPreferences),
    [demoMode, isGuest, userId, userPreferences],
  );

  useHydrationGatedPersist(
    hydrated && guestKitchenPersistReady,
    () => {
      if (demoMode) writeJson(STORAGE_KEYS.mealPlan, mealPlan);
      else if (isGuest) writeGuestMealPlan(mealPlan);
    },
    [demoMode, isGuest, mealPlan],
  );

  const summary = useMemo<MealPrepSummary>(() => {
    const activePlan = mealPlan.filter((m) => !m.made);
    const selected = recipes.filter((r) => plannedRecipeIds.includes(r.id));
    const proteinGrams = selected.reduce((sum, r) => sum + r.protein, 0);
    return {
      date: hydrated
        ? new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
        : '',
      mealsPlanned: activePlan.length,
      pantryItems: pantry.length,
      groceryRemaining: grocery.filter((g) => !g.checked).length,
      proteinGrams,
    };
  }, [grocery, hydrated, mealPlan, pantry.length, plannedRecipeIds, recipes]);

  const analytics = useMemo<UserAnalytics>(() => {
    if (!demoMode && liveAnalytics) return liveAnalytics;
    return {
      userCount: Object.keys(DEMO_USERS).length,
      adminCount: 1,
      memberCount: 1,
      pantryItems: pantry.length,
      recipes: recipes.length,
      groceryOpen: grocery.filter((g) => !g.checked).length,
      lastActiveAt: new Date().toISOString(),
    };
  }, [demoMode, grocery, liveAnalytics, pantry.length, recipes.length]);

  const pantryMatchCacheRef = useRef<{
    pantry: PantryItem[];
    index: PantryMatchIndex;
    fingerprints: Map<string, string>;
  } | null>(null);

  const pantryRecipeMatches = useMemo(() => {
    const kitchenRecipes = feedKitchenRecipes.map((recipe) => withServingScale(recipe, servingOverrides));
    const cached =
      pantryMatchCacheRef.current?.pantry === pantry ? pantryMatchCacheRef.current : null;
    const { index, fingerprints } = updatePantryMatchIndex(
      cached?.index ?? null,
      cached?.fingerprints ?? null,
      kitchenRecipes,
      pantry,
    );
    pantryMatchCacheRef.current = { pantry, index, fingerprints };
    return index;
  }, [feedKitchenRecipes, pantry, servingOverrides]);

  const recipeIngredientLinesById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const recipe of feedKitchenRecipes) {
      map.set(recipe.id, ingredientLinesFromRecipe(recipe));
    }
    return map;
  }, [feedKitchenRecipes]);

  const pantryRecipeMatchesRankedFiltered = useMemo(
    () =>
      filterPantryMatchesForDietPrefs(
        pantryRecipeMatches.ranked,
        userDietPrefs,
        recipeIngredientLinesById,
      ),
    [pantryRecipeMatches.ranked, recipeIngredientLinesById, userDietPrefs],
  );

  const pantryRecipeRecommendations = useMemo(() => {
    if (pantry.length === 0) return [];
    const ranked = filterRankedMatches(
      pantryRecipeMatchesRankedFiltered,
      'all',
      KITCHEN_LIST_DEFAULT_MIN_PERCENT,
      {
        minMatchedCount: DEFAULT_MIN_MATCHED_INGREDIENTS,
        pantryItemCount: pantry.length,
      },
    ).slice(0, RECIPE_MATCHING.homeRecommendationsLimit);
    return ranked;
  }, [pantry.length, pantryRecipeMatchesRankedFiltered]);

  const accountRecipeIds = useMemo(() => new Set(recipes.map((row) => row.id)), [recipes]);

  const savedRecipeToggleOutcomeRef = useRef<((outcome: SavedRecipeToggleOutcome) => void) | null>(
    null,
  );

  const registerSavedRecipeToggleOutcome = useCallback(
    (handler: ((outcome: SavedRecipeToggleOutcome) => void) | null) => {
      savedRecipeToggleOutcomeRef.current = handler;
    },
    [],
  );

  const savedRecipes = useSavedRecipes({
    session,
    accountUserId: userId,
    demoMode,
    isGuest,
    accountRecipeIds,
    kitchenRecipes: feedKitchenRecipes,
    pantry,
    pantryMatches: pantryRecipeMatches,
    liveDataLoaded: demoMode || isGuest || liveDataLoaded,
    onToggleOutcome: (outcome) => {
      if (outcome.status === 'error') {
        setUndoToast({
          message: SAVED_RECIPES_COPY.toastSaveFailed,
          showUndo: false,
          onUndo: () => setUndoToast(null),
        });
      }
      savedRecipeToggleOutcomeRef.current?.(outcome);
    },
  });

  const setDemoRole = useCallback((next: UserRole) => {
    setRole(next);
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (!supabase) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
      setAuthError(null);
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: authErrorMessage(error.message) };
        return { ok: true };
      } catch (error: unknown) {
        return { ok: false, error: authErrorMessage(error instanceof Error ? error.message : '') };
      }
    },
    [supabase],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string, name: string): Promise<AuthActionResult> => {
      if (!supabase) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
      setAuthError(null);
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: { name: name.trim() || email.split('@')[0] },
          },
        });
        if (error) return { ok: false, error: authErrorMessage(error.message) };
        if (data.session?.user) {
          setShowPostSignupSetup(true);
          return { ok: true };
        }
        // No session: either the address must be confirmed by email first, or (the server's way
        // of not revealing it) the address already has an account, shown by an empty identity list.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return { ok: false, error: AUTH_RESULT_COPY.alreadyRegistered };
        }
        if (email.trim()) markAwaitingProfileSetup(email.trim());
        return { ok: true, notice: AUTH_RESULT_COPY.confirmEmail };
      } catch (error: unknown) {
        return { ok: false, error: authErrorMessage(error instanceof Error ? error.message : '') };
      }
    },
    [supabase],
  );

  const signInWithMagicLink = useCallback(
    async (email: string): Promise<AuthActionResult> => {
      if (!supabase) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
      setAuthError(null);
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (error) return { ok: false, error: authErrorMessage(error.message) };
        return { ok: true, notice: AUTH_MAGIC_LINK_COPY.successMessage };
      } catch (error: unknown) {
        return { ok: false, error: authErrorMessage(error instanceof Error ? error.message : '') };
      }
    },
    [supabase],
  );

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthActionResult> => {
      if (!supabase) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
      const trimmed = email.trim();
      if (!trimmed) return { ok: false, error: AUTH_RESET_COPY.missingEmail };
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo: getAuthRedirectUrl(),
        });
        if (error) return { ok: false, error: authErrorMessage(error.message) };
        return { ok: true, notice: AUTH_RESET_COPY.sent };
      } catch (error: unknown) {
        return { ok: false, error: authErrorMessage(error instanceof Error ? error.message : '') };
      }
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<AuthActionResult> => {
      if (!supabase) return { ok: false, error: AUTH_RESULT_COPY.unavailable };
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return { ok: false, error: authErrorMessage(error.message) };
        setShowPasswordRecovery(false);
        setUndoToast({ message: AUTH_RESET_COPY.saved, showUndo: false, onUndo: () => setUndoToast(null) });
        return { ok: true };
      } catch (error: unknown) {
        return { ok: false, error: authErrorMessage(error instanceof Error ? error.message : '') };
      }
    },
    [supabase],
  );

  const dismissPasswordRecovery = useCallback(() => setShowPasswordRecovery(false), []);

  // The auth client's own announcement of a reset link can fire before this screen is listening.
  // The address the app was opened with is the second witness: once sign-in from the link has
  // settled, open the sheet; if the link was dead, say so and offer the sign-in sheet.
  const passwordResetLinkHandledRef = useRef(false);
  useEffect(() => {
    if (demoMode || !authReady || passwordResetLinkHandledRef.current) return;
    const opened = openedFromPasswordResetLink();
    if (!opened) return;
    if (opened === 'recovery') {
      if (!sessionUserId) return;
      passwordResetLinkHandledRef.current = true;
      setShowPasswordRecovery(true);
      return;
    }
    passwordResetLinkHandledRef.current = true;
    if (sessionUserId) return;
    setUndoToast({ message: AUTH_RESET_COPY.linkExpired, showUndo: false, onUndo: () => setUndoToast(null) });
    setAccountSheet('auth');
  }, [authReady, demoMode, sessionUserId]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setAuthError(null);
    const signedOutOwnerId = userId ?? profile.id;
    clearUserScopedLocalStorage(signedOutOwnerId);
    clearLastAccountUserId();
    setOfflineKitchenUserId(null);
    setUserDietPrefs(DEFAULT_USER_DIET_PREFS);
    await supabase.auth.signOut();
    if (signedOutOwnerId) {
      clearGroceryDismissals(signedOutOwnerId);
      clearAddPriceMemory(signedOutOwnerId);
    }
    setLiveProfile(null);
    setLiveAnalytics(null);
    setPantry([]);
    setRecipes([]);
    setGrocery([]);
    setMealPlan([]);
    setServingOverrides({});
    setUndoToast(null);
    setMealMadeReview(null);
    mealMadeUndoRef.current = null;
    setLiveDataLoaded(false);
    setPantry(readGuestPantry());
    setGrocery(readGuestGrocery());
    setMealPlan(readGuestMealPlan());
    setRecipes(readGuestRecipes());
    for (const key of Object.values(STORAGE_KEYS)) {
      removeStorageKey(key);
    }
    closeAccountSheet();
  }, [closeAccountSheet, profile.id, supabase, userId]);

  const refreshProfilePlan = useCallback(async (): Promise<UserPlan | null> => {
    if (!supabase || !userId) return null;
    const { data, error } = await supabase.from('profiles').select('plan').eq('id', userId).maybeSingle();
    const next = (data as { plan?: unknown } | null)?.plan;
    if (error || typeof next !== 'string' || !isUserPlan(next)) return null;
    setLiveProfile((prev) => (prev && prev.plan !== next ? { ...prev, plan: next } : prev));
    return next;
  }, [supabase, userId]);

  const showNotice = useCallback((message: string) => {
    setUndoToast({ message, showUndo: false, onUndo: () => setUndoToast(null) });
  }, []);

  const deleteAccount = useCallback(async () => {
    await deleteUserAccount();
    await signOut();
    completePostSignupSetup();
  }, [completePostSignupSetup, signOut]);

  const isOnMealPlan = useCallback(
    (options: { recipeSlug?: string; recipeApiId?: number }) =>
      Boolean(isRecipeOnMealPlan(mealPlan, options)),
    [mealPlan],
  );

  const persistGroceryList = useCallback(
    (next: GroceryListItem[]) => {
      if (demoMode) writeJson(STORAGE_KEYS.grocery, next);
      else if (isGuest) writeGuestGrocery(next);
      if (!demoMode && supabase && userId && sessionUserId) {
        if (isOffline()) {
          const cached = readAccountKitchenCache(userId);
          if (cached) {
            writeAccountKitchenCache({ ...cached, grocery: next, savedAt: new Date().toISOString() });
          }
          return;
        }
        void enqueueGroceryPersist(() =>
          replaceGroceryList(
            supabase,
            userId,
            resolveGroceryListForServerSync(next, savedManualGroceryByLocalIdRef.current),
          ).then((persisted) => {
            setGrocery((current) => mergeServerGroceryWithPendingManual(current, persisted));
            return persisted;
          }),
        ).catch((error: unknown) => {
          if (isOffline()) return;
          setKitchenError(error instanceof Error ? error.message : 'Failed to save grocery list');
        });
      }
    },
    [demoMode, isGuest, sessionUserId, supabase, userId],
  );

  const showGroceryAddedToast = useCallback(
    (added: GroceryListItem[], previous: GroceryListItem[], options?: { alreadyOnList?: boolean }) => {
      const label =
        options?.alreadyOnList
          ? GROCERY_COPY.alreadyOnGroceryList
          : added.length === 1
            ? GROCERY_COPY.addedMissingSingle(added[0].name)
            : GROCERY_COPY.addedMissingPlural(added.length);
      setUndoToast({
        message: label,
        actionLabel: GROCERY_COPY.viewGroceryListAction,
        onAction: () => {
          setUndoToast(null);
          router.push(APP_ROUTES.grocery);
        },
        onUndo: () => {
          const dismissalKeys = added.flatMap((item) =>
            item.sourceRecipeIds.map((recipeId) =>
              groceryDismissalKey(recipeId, item.name, item.unit),
            ),
          );
          addGroceryDismissals(ownerId, dismissalKeys);
          setGrocery(previous);
          persistGroceryList(previous);
          setUndoToast(null);
        },
      });
    },
    [ownerId, persistGroceryList],
  );

  const appendMissingIngredientsForRecipe = useCallback(
    (
      recipeId: string,
      missing: RecipeIngredient[],
      options?: { showToast?: boolean },
    ) => {
      if (missing.length === 0) {
        if (options?.showToast) {
          setUndoToast({
            message: GROCERY_COPY.nothingMissingOnGroceryList,
            showUndo: false,
            onUndo: () => setUndoToast(null),
          });
        }
        return 0;
      }

      let addedCount = 0;
      const dismissals = readGroceryDismissals(ownerId);
      setGrocery((prev) => {
        const { items: next, added } = mergeMissingIntoGrocery({
          missing,
          recipeId,
          pantry,
          previous: prev,
          groceryDismissals: dismissals,
        });
        addedCount = added.length;
        if (added.length > 0) {
          removeGroceryDismissals(
            ownerId,
            added.map((item) => groceryManualLineDismissalKey(item.name, item.unit)),
          );
        }
        persistGroceryList(next);
        if (options?.showToast) {
          if (added.length > 0) {
            showGroceryAddedToast(added, prev);
          } else if (missing.length > 0) {
            showGroceryAddedToast([], prev, { alreadyOnList: true });
          }
        }
        return next;
      });
      return addedCount;
    },
    [ownerId, pantry, persistGroceryList, showGroceryAddedToast],
  );

  const appendMissingIngredientsForPlannedMeal = useCallback(
    (
      recipeId: string,
      missing: RecipeIngredient[],
      link: GroceryPlannedMealLink,
    ) => {
      if (missing.length === 0) return;
      const dismissals = readGroceryDismissals(ownerId);
      setGrocery((prev) => {
        const { items: next, added } = mergeMissingIntoGroceryWithPlanLink({
          missing,
          recipeId,
          pantry,
          previous: prev,
          link,
          groceryDismissals: dismissals,
        });
        if (added.length > 0) {
          removeGroceryDismissals(
            ownerId,
            added.map((item) => groceryManualLineDismissalKey(item.name, item.unit)),
          );
        }
        persistGroceryList(next);
        if (added.length > 0) {
          showGroceryAddedToast(added, prev);
        }
        return next;
      });
    },
    [ownerId, pantry, persistGroceryList, showGroceryAddedToast],
  );

  const removeMealPlanItem = useCallback(
    async (id: string) => {
      const target = mealPlan.find((row) => row.id === id);
      const deleteIds = idsRemovedByMealPlanDelete(mealPlan, id);
      setMealPlan((prev) => applyMealPlanRemoval(prev, id));
      setGrocery((prev) => {
        const next = pruneGroceryForRemovedMeals(prev, deleteIds);
        if (demoMode) writeJson(STORAGE_KEYS.grocery, next);
        else if (isGuest) writeGuestGrocery(next);
        else if (supabase && userId) {
          void enqueueGroceryPersist(() =>
            replaceGroceryList(
              supabase,
              userId,
              resolveGroceryListForServerSync(next, savedManualGroceryByLocalIdRef.current),
            ),
          ).catch((error: unknown) => {
            setKitchenError(error instanceof Error ? error.message : 'Failed to update grocery list');
          });
        }
        return next;
      });
      if (!demoMode && supabase && userId) {
        try {
          if (target?.leftoverOfId) {
            await updateMealPlanItem(supabase, userId, target.leftoverOfId, { linkedLeftoverId: null });
          }
          for (const delId of deleteIds) {
            await deleteMealPlanItem(supabase, userId, delId);
          }
        } catch (error: unknown) {
          setAuthError(error instanceof Error ? error.message : 'Failed to remove meal plan item');
        }
      }
    },
    [demoMode, isGuest, mealPlan, supabase, userId],
  );

  const startMealMadeReview = useCallback(
    (
      recipeId: string,
      mealPlanItemId: string | null,
      pendingCookEngagement: CookConfirmPromptState | null,
    ) => {
      const recipe = feedKitchenRecipes.find((row) => row.id === recipeId);
      if (!recipe) return;
      if (mealPlanItemId) {
        const item = mealPlan.find((row) => row.id === mealPlanItemId);
        if (!item || item.made) return;
      }

      const match = scoreRecipeForPantryDeduction(recipe, pantry);
      const rows = matchedRowsForReview(match);
      setMealMadeReview({
        mealPlanItemId,
        recipeId,
        pendingCookEngagement,
        selectedPantryIds: new Set(rows.map((row) => row.matchedPantryItem!.id)),
      });
    },
    [feedKitchenRecipes, mealPlan, pantry],
  );

  const openMealMadeReview = useCallback(
    (mealPlanItemId: string) => {
      const item = mealPlan.find((row) => row.id === mealPlanItemId);
      if (!item || item.made) return;
      const recipeId = resolveMealPlanRecipeId(item, feedKitchenRecipes, ownerId);
      if (!recipeId) return;
      startMealMadeReview(recipeId, mealPlanItemId, null);
    },
    [feedKitchenRecipes, mealPlan, ownerId, startMealMadeReview],
  );

  const closeMealMadeReview = useCallback(() => {
    setMealMadeReview(null);
  }, []);

  const toggleMealMadePantryUse = useCallback((pantryItemId: string, useFromPantry: boolean) => {
    setMealMadeReview((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedPantryIds);
      if (useFromPantry) next.add(pantryItemId);
      else next.delete(pantryItemId);
      return { ...prev, selectedPantryIds: next };
    });
  }, []);

  useEffect(() => {
    latestPantryRef.current = pantry;
  }, [pantry]);

  /**
   * Undo one specific planned-meal cook. Only the latest undo state may run, and it is
   * cleared before any work so it can never be replayed against a newer pantry (FK3-1).
   * Restores just the deducted pantry rows to their pre-cook values.
   */
  const runMealMadeUndo = useCallback(
    async (undoState: MealMadeUndoState) => {
      if (mealMadeUndoRef.current !== undoState) return;
      if (!undoState.mealPlanItemId) return;
      mealMadeUndoRef.current = null;
      setUndoToast(null);

      const { mealPlanItemId: targetId, previousMeal, deductionLines } = undoState;
      const pantryBeforeUndo = latestPantryRef.current;
      const currentIds = new Set(pantryBeforeUndo.map((row) => row.id));
      const restoredPantry = restorePantryFromDeductions(pantryBeforeUndo, deductionLines);
      setPantry(restoredPantry);
      latestPantryRef.current = restoredPantry;
      if (previousMeal) {
        setMealPlan((prev) => prev.map((row) => (row.id === targetId ? previousMeal : row)));
      }

      if (!demoMode && supabase && userId) {
        try {
          for (const line of deductionLines) {
            const row = line.previous;
            if (currentIds.has(row.id)) {
              await updatePantryItem(supabase, userId, row);
            } else {
              const inserted = await insertPantryItem(supabase, userId, row);
              if (inserted.id !== row.id) {
                setPantry((prev) => prev.map((item) => (item.id === row.id ? inserted : item)));
              }
            }
          }
          if (previousMeal) {
            await updateMealPlanItem(supabase, userId, targetId, {
              made: previousMeal.made,
              madeAt: previousMeal.madeAt,
            });
          }
        } catch (error: unknown) {
          setAuthError(error instanceof Error ? error.message : 'Failed to undo');
        }
      }
    },
    [demoMode, supabase, userId],
  );

  const undoLastMealMade = useCallback(
    async (mealPlanItemId?: string) => {
      const undoState = mealMadeUndoRef.current;
      if (!undoState?.mealPlanItemId) return;
      if (mealPlanItemId != null && undoState.mealPlanItemId !== mealPlanItemId) return;
      await runMealMadeUndo(undoState);
    },
    [runMealMadeUndo],
  );

  const confirmMealMade = useCallback(async () => {
    if (!mealMadeReview) return;
    const recipe = feedKitchenRecipes.find((row) => row.id === mealMadeReview.recipeId);
    if (!recipe) {
      setMealMadeReview(null);
      return;
    }
    const item = mealMadeReview.mealPlanItemId
      ? mealPlan.find((row) => row.id === mealMadeReview.mealPlanItemId)
      : null;
    if (mealMadeReview.mealPlanItemId && !item) {
      setMealMadeReview(null);
      return;
    }

    const match = scoreRecipeForPantryDeduction(recipe, pantry);
    const excluded = new Set(
      matchedRowsForReview(match)
        .map((row) => row.matchedPantryItem!.id)
        .filter((id) => !mealMadeReview.selectedPantryIds.has(id)),
    );
    const lines = buildPantryDeductionLines(
      match,
      recipe,
      servingOverrides,
      excluded,
      profile.householdSize,
    );
    const pantrySnapshot = pantry.map((row) => ({ ...row }));
    const { nextPantry } = applyPantryDeductions(pantry, lines);
    const madeAt = new Date().toISOString();
    const previousMeal = item ? { ...item } : null;
    const pendingCook = mealMadeReview.pendingCookEngagement;

    setMealMadeBusy(true);
    try {
      setPantry(nextPantry);
      if (item) {
        setMealPlan((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, made: true, madeAt } : row,
          ),
        );
      }
      // A new cook always replaces any older undo; off-plan cooks have no Undo (known gap).
      const undoState: MealMadeUndoState | null = item
        ? {
            mealPlanItemId: item.id,
            previousMeal,
            pantrySnapshot,
            deductionLines: lines,
          }
        : null;
      mealMadeUndoRef.current = undoState;

      if (!demoMode && supabase && userId) {
        for (const line of lines) {
          const updated = nextPantry.find((row) => row.id === line.pantryItemId);
          if (updated) {
            await updatePantryItem(supabase, userId, updated);
          } else {
            await deletePantryItemsByIds(supabase, userId, [line.pantryItemId]);
          }
        }
        if (item) {
          await updateMealPlanItem(supabase, userId, item.id, { made: true, madeAt });
        }
      }

      if (pendingCook) {
        logCookEngagement(pendingCook, 'cook_confirmed');
        markCookPromptAsked(ownerId, pendingCook.key);
        setCookConfirmPrompt(null);
      }

      setMealMadeReview(null);
      const toastTitle = item?.title ?? recipe.name;
      setUndoToast({
        message: item ? `Marked “${toastTitle}” as made` : SEAMLESS_FLOW_COPY.pantryUpdatedToast,
        onUndo: () => {
          if (undoState) void runMealMadeUndo(undoState);
        },
        showUndo: Boolean(undoState),
      });

      if (lines.some((line) => line.quantityApplied)) {
        emitForkinatorRestockAfterCook({
          nextPantry,
          deductedPantryRows: lines
            .filter((line) => line.quantityApplied)
            .map((line) => line.previous),
          pantryDeductionApplied: true,
        });
      }
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : 'Failed to mark meal as made');
      mealMadeUndoRef.current = null;
      setPantry(pantrySnapshot);
      if (!demoMode && supabase && userId) {
        // Some of the pantry rows may have been saved before the failure. The screen goes back to
        // before the cook, so the server must too, or pressing "Made it" again would take the
        // ingredients out a second time. A row the cook used up was deleted: it is put back.
        void (async () => {
          for (const line of lines) {
            try {
              await updatePantryItem(supabase, userId, line.previous);
            } catch {
              try {
                await insertPantryItem(supabase, userId, line.previous);
              } catch {
                // Still no connection: nothing more can be done from here.
              }
            }
          }
        })();
      }
      if (item && previousMeal) {
        setMealPlan((prev) => prev.map((row) => (row.id === item.id ? previousMeal : row)));
      }
    } finally {
      setMealMadeBusy(false);
    }
  }, [
    demoMode,
    mealMadeReview,
    mealPlan,
    ownerId,
    pantry,
    feedKitchenRecipes,
    profile.householdSize,
    runMealMadeUndo,
    servingOverrides,
    supabase,
    userId,
  ]);

  const logCookEngagement = useCallback(
    (prompt: CookConfirmPromptState, type: 'cook_confirmed' | 'cook_declined') => {
      appendRecipeEngagementEvent(
        ownerId,
        createSeamlessEngagementEvent(prompt.refKey, type, {
          ts: Date.now(),
          recipeId: prompt.recipeId,
          source: prompt.source,
          group: prompt.group,
          sheetId: prompt.sheetId ?? 'sheet-unknown',
          via: prompt.via,
        }),
      );
    },
    [ownerId],
  );

  const buildCookPromptFromTarget = useCallback(
    (target: ScheduleRecipeTarget, via: CookConfirmVia): CookConfirmPromptState => {
      const key =
        via === 'cook_now'
          ? cookPromptKeyForCookNow(target.pantryRecipeId, target.sheetId ?? null)
          : cookPromptKeyForMeal(target.pantryRecipeId);
      return {
        key,
        title: target.title,
        mealPlanItemId: null,
        recipeId: target.pantryRecipeId,
        refKey: target.refKey,
        source: target.source,
        group: categoryGroupForTarget(target),
        sheetId: target.sheetId ?? null,
        via,
      };
    },
    [],
  );

  const buildCookPromptFromMeal = useCallback(
    (item: MealPlanItem, recipeId: string): CookConfirmPromptState | null => {
      const recipe = feedKitchenRecipes.find((row) => row.id === recipeId);
      const target = recipe
        ? scheduleTargetFromKitchenRecipe(recipe, null)
        : scheduleTargetFromMealPlanItem(item);
      return {
        key: cookPromptKeyForMeal(item.id),
        title: item.title.replace(/^Leftovers:\s*/i, ''),
        mealPlanItemId: item.id,
        recipeId,
        refKey: target.refKey,
        source: target.source,
        group: categoryGroupForTarget(target),
        sheetId: null,
        via: 'planned',
      };
    },
    [feedKitchenRecipes],
  );

  const beginCookViewSession = useCallback((target: ScheduleRecipeTarget) => {
    cookViewSessionRef.current = target;
  }, []);

  const finishCookViewSession = useCallback(() => {
    const target = cookViewSessionRef.current;
    cookViewSessionRef.current = null;
    if (!target) return;

    const prompt = buildCookPromptFromTarget(target, 'cook_now');
    const asked = readCookPromptAskedKeys(ownerId);
    if (asked.has(prompt.key)) return;

    setCookConfirmPrompt((current) => current ?? prompt);
  }, [buildCookPromptFromTarget, ownerId]);

  const dismissCookConfirmPrompt = useCallback(() => {
    if (!cookConfirmPrompt) return;
    markCookPromptAsked(ownerId, cookConfirmPrompt.key);
    setCookConfirmPrompt(null);
  }, [cookConfirmPrompt, ownerId]);

  const declineCookConfirmPrompt = useCallback(() => {
    if (!cookConfirmPrompt) return;
    logCookEngagement(cookConfirmPrompt, 'cook_declined');
    markCookPromptAsked(ownerId, cookConfirmPrompt.key);
    setCookConfirmPrompt(null);
    refreshGroceryNow();
  }, [cookConfirmPrompt, logCookEngagement, ownerId, refreshGroceryNow]);

  const confirmCookConfirmPrompt = useCallback(async () => {
    if (!cookConfirmPrompt) return;
    const prompt = cookConfirmPrompt;
    const recipe = feedKitchenRecipes.find((row) => row.id === prompt.recipeId);
    if (!recipe) {
      dismissCookConfirmPrompt();
      return;
    }
    startMealMadeReview(prompt.recipeId, prompt.mealPlanItemId, prompt);
    setCookConfirmPrompt(null);
  }, [cookConfirmPrompt, dismissCookConfirmPrompt, feedKitchenRecipes, startMealMadeReview]);

  useEffect(() => {
    if (cookConfirmPrompt) {
      if (cookConfirmPrompt.mealPlanItemId) {
        const stillPlanned = mealPlan.some((row) => row.id === cookConfirmPrompt.mealPlanItemId);
        if (!stillPlanned) {
          setCookConfirmPrompt(null);
        }
      }
      return;
    }
    const asked = readCookPromptAskedKeys(ownerId);
    const due = pickDuePlannedMeal(mealPlan, asked);
    if (!due) return;
    const recipeId = resolveMealPlanRecipeId(due, feedKitchenRecipes, ownerId);
    if (!recipeId) return;
    const prompt = buildCookPromptFromMeal(due, recipeId);
    if (prompt) setCookConfirmPrompt(prompt);
  }, [buildCookPromptFromMeal, cookConfirmPrompt, feedKitchenRecipes, mealPlan, ownerId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (cookConfirmPrompt) return;
      const asked = readCookPromptAskedKeys(ownerId);
      const due = pickDuePlannedMeal(mealPlan, asked);
      if (!due) return;
      const recipeId = resolveMealPlanRecipeId(due, feedKitchenRecipes, ownerId);
      if (!recipeId) return;
      const prompt = buildCookPromptFromMeal(due, recipeId);
      if (prompt) setCookConfirmPrompt(prompt);
    }, 60_000);
    return () => clearInterval(timer);
  }, [buildCookPromptFromMeal, cookConfirmPrompt, feedKitchenRecipes, mealPlan, ownerId]);

  const addMealPlanEntry = useCallback(
    async (entry: Omit<MealPlanItem, 'id'>) => {
      const normalized: Omit<MealPlanItem, 'id'> = {
        ...entry,
        madeAt: entry.madeAt ?? null,
        scheduledOn: entry.scheduledOn ?? null,
        mealSlot: entry.mealSlot ?? null,
        leftoverOfId: entry.leftoverOfId ?? null,
        linkedLeftoverId: entry.linkedLeftoverId ?? null,
      };
      const recipeId = resolveMealPlanRecipeId(
        { ...normalized, id: 'pending' },
        feedKitchenRecipes,
        ownerId,
      );

      if (demoMode || isGuest) {
        const id = isGuest ? `guest-plan-${Date.now()}` : `demo-plan-${Date.now()}`;
        setMealPlan((prev) => [{ ...normalized, id }, ...prev]);
        if (
          userPreferences.autoAddMissingToGrocery &&
          recipeId &&
          !normalized.leftoverOfId &&
          !featureFlags.grocerySync
        ) {
          const missing = pantryRecipeMatches.byRecipeId.get(recipeId)?.missing ?? [];
          appendMissingIngredientsForRecipe(recipeId, missing, { showToast: true });
        }
        return;
      }
      if (!supabase || !userId) throw new Error('Sign in to save your meal plan.');
      const saved = await insertMealPlanItem(supabase, userId, normalized);
      setMealPlan((prev) => [saved, ...prev]);
      if (
        userPreferences.autoAddMissingToGrocery &&
        recipeId &&
        !normalized.leftoverOfId &&
        !featureFlags.grocerySync
      ) {
        const missing = pantryRecipeMatches.byRecipeId.get(recipeId)?.missing ?? [];
        appendMissingIngredientsForRecipe(recipeId, missing, { showToast: true });
      }
    },
    [
      appendMissingIngredientsForRecipe,
      demoMode,
      isGuest,
      ownerId,
      pantryRecipeMatches.byRecipeId,
      feedKitchenRecipes,
      supabase,
      userId,
      userPreferences.autoAddMissingToGrocery,
      featureFlags.grocerySync,
    ],
  );

  const updateMealPlanSchedule = useCallback(
    async (id: string, patch: Partial<Pick<MealPlanItem, 'scheduledOn' | 'mealSlot'>>) => {
      let previous: MealPlanItem | undefined;
      setMealPlan((prev) => {
        previous = prev.find((row) => row.id === id);
        return prev.map((row) => (row.id === id ? { ...row, ...patch } : row));
      });
      if (!previous) return;
      if (demoMode || isGuest) return;
      if (!supabase || !userId) return;
      try {
        await updateMealPlanItem(supabase, userId, id, patch);
      } catch (error: unknown) {
        setMealPlan((prev) => prev.map((row) => (row.id === id ? previous! : row)));
        setAuthError(error instanceof Error ? error.message : 'Failed to update meal schedule');
      }
    },
    [demoMode, isGuest, supabase, userId],
  );

  const scheduleMealFromRecipe = useCallback(
    async (input: {
      recipeId: string;
      recipeSlug: string | null;
      recipeApiId: number | null;
      title: string;
      imageUrl: string | null;
      scheduledOn: string;
      mealSlot: MealSlot;
      makesLeftovers?: boolean;
    }) => {
      const parentBase: Omit<MealPlanItem, 'id'> = {
        recipeSlug: input.recipeSlug,
        recipeApiId: input.recipeApiId,
        title: input.title,
        imageUrl: input.imageUrl,
        made: false,
        madeAt: null,
        addedAt: new Date().toISOString(),
        scheduledOn: input.scheduledOn,
        mealSlot: input.mealSlot,
        leftoverOfId: null,
        linkedLeftoverId: null,
      };

      const maybeAppendMissing = (recipeId: string | null) => {
        if (!userPreferences.autoAddMissingToGrocery || !recipeId || featureFlags.grocerySync) return;
        const missing = pantryRecipeMatches.byRecipeId.get(recipeId)?.missing ?? [];
        appendMissingIngredientsForRecipe(recipeId, missing, { showToast: true });
      };

      if (demoMode || isGuest) {
        const parentId = isGuest ? `guest-plan-${Date.now()}` : `demo-plan-${Date.now()}`;
        let parent: MealPlanItem = { ...parentBase, id: parentId };
        const rows: MealPlanItem[] = [parent];
        if (input.makesLeftovers) {
          const childId = isGuest ? `guest-plan-${Date.now()}-lo` : `demo-plan-${Date.now()}-lo`;
          const child: MealPlanItem = { ...buildLinkedLeftoverEntry(parent), id: childId };
          parent = { ...parent, linkedLeftoverId: childId };
          rows[0] = parent;
          rows.push(child);
        }
        setMealPlan((prev) => [...rows, ...prev]);
        maybeAppendMissing(
          resolveMealPlanRecipeId(parent, feedKitchenRecipes, ownerId),
        );
        return {
          parentId: parent.id,
          leftoverId: rows.length > 1 ? rows[1].id : null,
        };
      }

      if (!supabase || !userId) throw new Error('Sign in to save your meal plan.');
      const savedParent = await insertMealPlanItem(supabase, userId, parentBase);
      let rows: MealPlanItem[] = [savedParent];
      if (input.makesLeftovers) {
        const childBase = buildLinkedLeftoverEntry(savedParent);
        const savedChild = await insertMealPlanItem(supabase, userId, childBase);
        const linkedParent = await updateMealPlanItem(supabase, userId, savedParent.id, {
          linkedLeftoverId: savedChild.id,
        });
        rows = [linkedParent, savedChild];
      }
      setMealPlan((prev) => [...rows, ...prev]);
      maybeAppendMissing(resolveMealPlanRecipeId(rows[0], feedKitchenRecipes, ownerId));
      return {
        parentId: rows[0].id,
        leftoverId: rows.length > 1 ? rows[1].id : null,
      };
    },
    [
      appendMissingIngredientsForRecipe,
      demoMode,
      isGuest,
      ownerId,
      pantryRecipeMatches.byRecipeId,
      feedKitchenRecipes,
      supabase,
      userId,
      userPreferences.autoAddMissingToGrocery,
    ],
  );

  const notifyMealScheduled = useCallback(
    (
      result: { parentId: string; leftoverId?: string | null },
      scheduledOn: string,
      mealSlot: MealSlot,
    ) => {
      setUndoToast({
        message: formatAddedToCalendarMessage(scheduledOn, mealSlot),
        onUndo: () => {
          void removeMealPlanItem(result.parentId);
        },
      });
    },
    [removeMealPlanItem],
  );

  const toggleMealPlanKitchenRecipe = useCallback(
    async (recipeId: string) => {
      const recipe = findKitchenRecipeById(recipes, recipeId, libraryRecipes);
      if (!recipe) return;
      const existing = isRecipeOnMealPlan(mealPlan, { recipeSlug: recipeId });
      if (existing) {
        await removeMealPlanItem(existing.id);
        return;
      }
      await addMealPlanEntry({
        recipeSlug: recipeId,
        recipeApiId: null,
        title: recipe.name,
        imageUrl: resolveKitchenRecipeImageUrl(recipe),
        made: false,
        madeAt: null,
        addedAt: new Date().toISOString(),
        scheduledOn: null,
        mealSlot: null,
        leftoverOfId: null,
        linkedLeftoverId: null,
      });
    },
    [addMealPlanEntry, mealPlan, recipes, removeMealPlanItem],
  );

  const restockGroceriesToPantry = useCallback(
    async (items: GroceryListItem[]) => {
      if (!userPreferences.addCheckedItemsToPantry || items.length === 0) return;

      const toRestock = items.filter((item) => !groceryRestockLedgerRef.current.has(item.id));
      if (toRestock.length === 0) return;

      const pantrySnapshot = pantry.map((row) => ({ ...row }));
      const nextPantry = applyGroceryCheckRestockBatch(
        pantry,
        toRestock,
        groceryRestockLedgerRef.current,
      );

      setPantry(nextPantry);

      if (!demoMode && !isGuest && supabase && userId) {
        try {
          // What the screen shows is what is saved: the same rows, under the same ids. (Saving a
          // second, separately built set of rows left the screen, the server and the untick
          // ledger pointing at different ids, so Undo and unticking missed the new rows.)
          const { inserted, updated } = diffPantryForServer(pantrySnapshot, nextPantry);
          for (const row of updated) {
            await updatePantryItem(supabase, userId, row);
          }
          if (inserted.length > 0) {
            const saved = await insertPantryItems(supabase, userId, inserted);
            setPantry((prev) => replacePantryRowsById(prev, saved));
          }
        } catch (error: unknown) {
          setKitchenError(error instanceof Error ? error.message : 'Failed to update pantry');
          setPantry(pantrySnapshot);
          for (const item of toRestock) {
            groceryRestockLedgerRef.current.delete(item.id);
          }
          // Some quantity updates may have been saved before the failure: put the server back as
          // well, so ticking the item again does not add the stock a second time.
          void syncPantryToSnapshot(supabase, userId, nextPantry, pantrySnapshot).catch(() => undefined);
          return;
        }
      }

      const toastMessage = PANTRY_RESTOCK_COPY.addedToPantry(toRestock.length);
      setUndoToast({
        message: toastMessage,
        onUndo: () => {
          setPantry(pantrySnapshot);
          setUndoToast(null);
          if (!demoMode && !isGuest && supabase && userId) {
            void syncPantryToSnapshot(supabase, userId, nextPantry, pantrySnapshot).catch((error: unknown) => {
              setAuthError(error instanceof Error ? error.message : 'Failed to undo pantry update');
            });
          }
        },
      });
    },
    [demoMode, isGuest, pantry, supabase, userId, userPreferences.addCheckedItemsToPantry],
  );

  const toggleGroceryItem = useCallback(
    (id: string) => {
      const current = grocery.find((item) => item.id === id);
      const willCheck = Boolean(current && !current.checked);
      const willUncheck = Boolean(current && current.checked);

      setGrocery((prev) => {
        const next = prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item));
        if (demoMode) writeJson(STORAGE_KEYS.grocery, next);
        else if (isGuest) writeGuestGrocery(next);
        if (supabase && userId) {
          const changed = next.find((item) => item.id === id);
          if (changed && !changed.id.startsWith('groc-')) {
            void updateGroceryChecked(supabase, changed.id, changed.checked).catch((error: unknown) => {
              setKitchenError(error instanceof Error ? error.message : 'Failed to update grocery item');
            });
          }
        }
        return next;
      });

      if (willCheck && current) {
        void restockGroceriesToPantry([current]);
      } else if (willUncheck && current && userPreferences.addCheckedItemsToPantry) {
        // Unticking takes the stock back out, on the screen and on the server. (The server call
        // used to compare the pantry with a copy of itself, so the server kept the stock.)
        const reversed = reverseGroceryCheckRestock(pantry, id, groceryRestockLedgerRef.current);
        if (reversed !== pantry) {
          setPantry(reversed);
          if (!demoMode && !isGuest && supabase && userId) {
            void syncPantryToSnapshot(supabase, userId, pantry, reversed).catch((error: unknown) => {
              setKitchenError(error instanceof Error ? error.message : 'Failed to update pantry');
            });
          }
        }
      }
    },
    [demoMode, grocery, isGuest, pantry, restockGroceriesToPantry, supabase, userId, userPreferences.addCheckedItemsToPantry],
  );

  const toggleGroceryItemsChecked = useCallback(
    (ids: string[], checked?: boolean) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const targets = grocery.filter((item) => idSet.has(item.id));
      if (targets.length === 0) return;

      const nextChecked = checked ?? !targets.every((item) => item.checked);
      const toCheck = targets.filter((item) => (nextChecked ? !item.checked : item.checked));
      if (toCheck.length === 0) return;

      setGrocery((prev) => {
        const next = prev.map((item) => (idSet.has(item.id) ? { ...item, checked: nextChecked } : item));
        if (demoMode) writeJson(STORAGE_KEYS.grocery, next);
        else if (isGuest) writeGuestGrocery(next);
        if (supabase && userId) {
          for (const item of next.filter((row) => idSet.has(row.id) && !row.id.startsWith('groc-'))) {
            void updateGroceryChecked(supabase, item.id, item.checked).catch((error: unknown) => {
              setKitchenError(error instanceof Error ? error.message : 'Failed to update grocery item');
            });
          }
        }
        return next;
      });

      if (nextChecked) {
        void restockGroceriesToPantry(toCheck);
      } else if (userPreferences.addCheckedItemsToPantry) {
        let reversed = pantry;
        for (const item of toCheck) {
          reversed = reverseGroceryCheckRestock(reversed, item.id, groceryRestockLedgerRef.current);
        }
        if (reversed !== pantry) {
          setPantry(reversed);
          if (!demoMode && !isGuest && supabase && userId) {
            void syncPantryToSnapshot(supabase, userId, pantry, reversed).catch((error: unknown) => {
              setKitchenError(error instanceof Error ? error.message : 'Failed to update pantry');
            });
          }
        }
      }
    },
    [
      demoMode,
      grocery,
      isGuest,
      pantry,
      restockGroceriesToPantry,
      supabase,
      userId,
      userPreferences.addCheckedItemsToPantry,
    ],
  );

  const markGroceryItemsBought = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setGrocery((prev) => {
        const changedIds = prev.filter((item) => idSet.has(item.id) && !item.checked).map((item) => item.id);
        if (changedIds.length === 0) return prev;
        const changed = new Set(changedIds);
        const next = prev.map((item) => (changed.has(item.id) ? { ...item, checked: true } : item));
        if (demoMode) writeJson(STORAGE_KEYS.grocery, next);
        else if (isGuest) writeGuestGrocery(next);
        if (supabase && userId) {
          for (const id of changedIds) {
            if (id.startsWith('groc-')) continue;
            void updateGroceryChecked(supabase, id, true).catch((error: unknown) => {
              setKitchenError(error instanceof Error ? error.message : 'Failed to update grocery item');
            });
          }
        }
        return next;
      });
      // No restock and no ledger entry: the receipt already put these in the pantry, and
      // unticking later must not take stock back out.
    },
    [demoMode, isGuest, supabase, userId],
  );

  const addManualGroceryItem = useCallback(
    async (input: { name: string; quantity: number; unit: string; category: PantryCategory }) => {
      const trimmed = input.name.trim();
      if (!trimmed) return null;
      const unit = input.unit.trim() || 'each';
      removeGroceryDismissals(ownerId, [groceryManualLineDismissalKey(trimmed, unit)]);
      const item = createManualGroceryItem({ ...input, name: trimmed, unit });

      if (demoMode || isGuest) {
        setGrocery((prev) => {
          const next = [...prev, item];
          if (demoMode) writeJson(STORAGE_KEYS.grocery, next);
          else writeGuestGrocery(next);
          return next;
        });
        return item.id;
      }
      if (!supabase || !userId) {
        throw new Error('Sign in to add grocery items.');
      }

      trackManualGroceryInsert(pendingManualGroceryInsertsRef.current, item.id);
      setGrocery((prev) => [...prev, item]);

      if (isOffline()) {
        const cached = readAccountKitchenCache(userId);
        if (cached) {
          writeAccountKitchenCache({
            ...cached,
            grocery: [...cached.grocery, item],
            savedAt: new Date().toISOString(),
          });
        }
        return item.id;
      }

      try {
        // FK3-6: serialize with full-list grocery syncs (e.g. the refresh after a meal is
        // marked made) so a replace that started earlier cannot drop this row from memory.
        const saved = await enqueueGroceryPersist(() => insertGroceryItem(supabase, userId, item));
        if (!saved) {
          completeManualGroceryInsertTracking(pendingManualGroceryInsertsRef.current, item.id);
          return item.id;
        }
        const cancelled = isManualGroceryInsertCancelled(pendingManualGroceryInsertsRef.current, item.id);
        completeManualGroceryInsertTracking(pendingManualGroceryInsertsRef.current, item.id);

        let deleteServerId: string | null = null;
        setGrocery((prev) => {
          const merged = mergeSavedManualGroceryItem(prev, item.id, saved, cancelled);
          deleteServerId = merged.shouldDeleteServerId;
          if (merged.shouldDeleteServerId) {
            return prev;
          }
          const next = merged.grocery;
          const cached = readAccountKitchenCache(userId);
          if (cached) {
            writeAccountKitchenCache({ ...cached, grocery: next, savedAt: new Date().toISOString() });
          }
          return next;
        });

        if (deleteServerId) {
          await deleteGroceryItems(supabase, userId, [deleteServerId]);
          return null;
        }
        savedManualGroceryByLocalIdRef.current.set(item.id, saved);
        return saved.id;
      } catch (error: unknown) {
        completeManualGroceryInsertTracking(pendingManualGroceryInsertsRef.current, item.id);
        if (isOffline()) return item.id;
        setGrocery((prev) => {
          const next = rollbackManualGroceryItem(prev, item.id);
          const cached = readAccountKitchenCache(userId);
          if (cached) {
            writeAccountKitchenCache({ ...cached, grocery: next, savedAt: new Date().toISOString() });
          }
          return next;
        });
        throw error instanceof Error ? error : new Error('Failed to add grocery item');
      }
    },
    [demoMode, isGuest, ownerId, supabase, userId],
  );

  const clearCheckedGroceryItems = useCallback(() => {
    const removed = grocery.filter((item) => item.checked);
    if (removed.length === 0) return;

    const dismissalKeys = removed.flatMap((item) =>
      groceryDismissalKeysForItem(item, groceryDismissalContext),
    );
    addGroceryDismissals(ownerId, dismissalKeys);

    const previousGrocery = grocery;
    const nextGrocery = grocery.filter((item) => !item.checked);
    persistGroceryList(nextGrocery);
    setGrocery(nextGrocery);

    // Clearing never touches the pantry. Ticking an item is what adds it to the pantry; adding
    // again here counted the same shopping twice whenever the app had been reopened in between
    // (and after a receipt scan), and drew new items twice on the Pantry tab.
    setUndoToast({
      message: GROCERY_COPY.undoCleared(removed.length),
      onUndo: () => {
        removeGroceryDismissals(ownerId, dismissalKeys);
        setGrocery(previousGrocery);
        persistGroceryList(previousGrocery);
        setUndoToast(null);
      },
    });
  }, [grocery, groceryDismissalContext, ownerId, persistGroceryList]);

  const removeGroceryItem = useCallback(
    (id: string) => {
      cancelManualGroceryInsert(pendingManualGroceryInsertsRef.current, id);
      setGrocery((prev) => {
        const removed = prev.find((item) => item.id === id);
        if (!removed) {
          // FK3-6: Forky's restock Undo passes the saved server id; if a list refresh already
          // dropped the row from memory, still delete it on the server.
          if (!demoMode && !isGuest && supabase && userId && isPersistedGroceryUuid(id)) {
            void enqueueGroceryPersist(() => deleteGroceryItems(supabase, userId, [id])).catch(
              (error: unknown) => {
                setKitchenError(error instanceof Error ? error.message : 'Failed to remove grocery item');
              },
            );
          }
          return prev;
        }

        const dismissalKeys = groceryDismissalKeysForItem(removed, groceryDismissalContext);
        addGroceryDismissals(ownerId, dismissalKeys);

        const previous = prev;
        const next = prev.filter((item) => item.id !== id);
        persistGroceryList(next);

        setUndoToast({
          message: GROCERY_COPY.undoRemoved(removed.name),
          onUndo: () => {
            removeGroceryDismissals(ownerId, dismissalKeys);
            setGrocery(previous);
            persistGroceryList(previous);
            setUndoToast(null);
          },
        });

        return next;
      });
    },
    [demoMode, groceryDismissalContext, isGuest, ownerId, persistGroceryList, supabase, userId],
  );

  const seedPantry = useCallback(() => {
    if (demoMode) {
      setPantry(MOCK_PANTRY);
      return;
    }
    if (!supabase || !userId) return;
    void (async () => {
      const inserted: PantryItem[] = [];
      for (const item of MOCK_PANTRY) {
        inserted.push(await insertPantryItem(supabase, userId, { ...item, id: `seed-${item.id}` }));
      }
      setPantry((prev) => [...inserted, ...prev]);
    })().catch((error: unknown) => {
      setAuthError(error instanceof Error ? error.message : 'Failed to seed pantry');
    });
  }, [demoMode, supabase, userId]);

  const updateRecipe = useCallback(
    (recipe: Recipe) => {
      setRecipes((prev) => prev.map((r) => (r.id === recipe.id ? recipe : r)));
      if (!demoMode && supabase && isAdmin) {
        void updateMasterRecipe(supabase, recipe).catch((error: unknown) => {
          setAuthError(error instanceof Error ? error.message : 'Failed to update recipe');
        });
      }
    },
    [demoMode, isAdmin, supabase],
  );

  const importDiscoveredRecipe = useCallback(
    async (recipe: Recipe, options: { asMaster: boolean; recipeApiId: number }): Promise<Recipe> => {
      if (options.asMaster && !isAdmin) {
        throw new Error('Only admins can add recipes to the shared kitchen catalog.');
      }
      if (demoMode || isGuest) {
        const saved = { ...recipe, isMaster: isGuest ? false : options.asMaster };
        setRecipes((prev) => {
          const exists = prev.some((r) => r.id === recipe.id);
          const next = exists
            ? prev.map((r) => (r.id === recipe.id ? saved : r))
            : [saved, ...prev];
          if (demoMode) writeJson(STORAGE_KEYS.recipes, next);
          else writeGuestRecipes(next);
          return next;
        });
        return saved;
      }
      if (!supabase || !userId) {
        throw new Error('Sign in to save recipes.');
      }
      const saved = await upsertImportedRecipe(supabase, userId, recipe, options);
      setRecipes((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
      });
      return saved;
    },
    [demoMode, isAdmin, isGuest, supabase, userId],
  );

  const logImportedRecipeEngagement = useCallback(
    (saved: Recipe, tags: string[]) => {
      const refKey = refKeyForKitchenRecipe(saved);
      const group = recipeCategoryGroup({
        category: saved.tag,
        title: saved.name,
        tags,
      });
      appendRecipeEngagementEvent(
        ownerId,
        createSeamlessEngagementEvent(refKey, 'import', {
          ts: Date.now(),
          recipeId: saved.id,
          source: 'import',
          group,
          sheetId: `import-${saved.id}`,
          tags,
        }),
      );
    },
    [ownerId],
  );

  const saveLinkImportedRecipe = useCallback(
    async (extracted: RecipeImportExtractedDto): Promise<Recipe> => {
      const mapped = mapExtractedImportToRecipe(extracted, ownerId);
      const importTags = [extracted.title].filter(Boolean);
      if (demoMode || isGuest) {
        const saved = { ...mapped, isMaster: false };
        setRecipes((prev) => {
          const exists = prev.some((r) => r.id === saved.id);
          const next = exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
          if (demoMode) writeJson(STORAGE_KEYS.recipes, next);
          else writeGuestRecipes(next);
          return next;
        });
        logImportedRecipeEngagement(saved, importTags);
        return saved;
      }
      if (!supabase || !userId) {
        throw new Error('Sign in to save recipes.');
      }
      const saved = await upsertLinkImportedRecipe(supabase, userId, mapped);
      setRecipes((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
      });
      logImportedRecipeEngagement(saved, importTags);
      return saved;
    },
    [demoMode, isGuest, logImportedRecipeEngagement, ownerId, supabase, userId],
  );

  const clearImportedRecipeSource = useCallback(
    async (recipeId: string) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe?.sourceUrl) return;
      const cleared = recipeWithoutSourceAttribution(recipe);
      if (demoMode || isGuest) {
        setRecipes((prev) => {
          const next = prev.map((r) => (r.id === recipeId ? cleared : r));
          if (demoMode) writeJson(STORAGE_KEYS.recipes, next);
          else writeGuestRecipes(next);
          return next;
        });
        return;
      }
      if (!supabase || !userId) return;
      const saved = await upsertLinkImportedRecipe(supabase, userId, cleared);
      setRecipes((prev) => prev.map((r) => (r.id === recipeId ? saved : r)));
    },
    [demoMode, isGuest, recipes, supabase, userId],
  );

  const toggleMealPlanDiscoveryRecipe = useCallback(
    async (item: RecipeDiscoveryListItem) => {
      const existing = isRecipeOnMealPlan(mealPlan, { recipeApiId: item.id });
      if (existing) {
        await removeMealPlanItem(existing.id);
        return;
      }

      let slug = recipeApiMasterSlug(item.id);
      if (recipes.some((r) => r.id === slug)) {
        // shared catalog
      } else if (isRecipeApiInLibrary(recipes, item.id, ownerId)) {
        slug = recipes.find((r) => r.id === slug || r.id === recipeApiPersonalSlug(item.id, ownerId))?.id ?? slug;
      } else {
        const mapped = recipeApiToAppRecipe(item, { asMaster: isAdmin, userId: ownerId });
        const saved = await importDiscoveredRecipe(mapped, { asMaster: isAdmin, recipeApiId: item.id });
        slug = saved.id;
      }

      await addMealPlanEntry({
        recipeSlug: slug,
        recipeApiId: item.id,
        title: item.name,
        imageUrl: resolveDiscoveryRecipeImageUrl(item),
        made: false,
        madeAt: null,
        addedAt: new Date().toISOString(),
        scheduledOn: null,
        mealSlot: null,
        leftoverOfId: null,
        linkedLeftoverId: null,
      });
    },
    [
      addMealPlanEntry,
      importDiscoveredRecipe,
      isAdmin,
      mealPlan,
      ownerId,
      recipes,
      removeMealPlanItem,
    ],
  );

  const addMissingForPlannedMealsToGrocery = useCallback(() => {
    const dismissals = readGroceryDismissals(ownerId);
    setGrocery((prev) => {
      let next = prev;
      const allAdded: GroceryListItem[] = [];
      for (const recipeId of plannedRecipeIds) {
        const match = pantryRecipeMatches.byRecipeId.get(recipeId);
        if (!match || match.missing.length === 0) continue;
        const result = mergeMissingIntoGrocery({
          missing: match.missing,
          recipeId,
          pantry,
          previous: next,
          groceryDismissals: dismissals,
        });
        next = result.items;
        allAdded.push(...result.added);
      }
      if (allAdded.length > 0) {
        persistGroceryList(next);
        showGroceryAddedToast(allAdded, prev);
      }
      return next;
    });
  }, [ownerId, pantry, pantryRecipeMatches.byRecipeId, persistGroceryList, plannedRecipeIds, showGroceryAddedToast]);

  const shopForWeekScheduledMeals = useCallback(() => {
    const startIso = localDateString();
    const weekItems = mealPlanItemsInWeekWindow(mealPlan, startIso, MEAL_CALENDAR.daysAhead);
    const recipeIds = recipeIdsForScheduledMeals(weekItems, recipes, ownerId);
    const dismissals = readGroceryDismissals(ownerId);
    setGrocery((prev) => {
      let next = prev;
      for (const recipeId of recipeIds) {
        const match = pantryRecipeMatches.byRecipeId.get(recipeId);
        if (!match || match.missing.length === 0) continue;
        next = mergeMissingIntoGrocery({
          missing: match.missing,
          recipeId,
          pantry,
          previous: next,
          groceryDismissals: dismissals,
        }).items;
      }
      persistGroceryList(next);
      return next;
    });
    router.push(APP_ROUTES.grocery);
  }, [
    mealPlan,
    ownerId,
    pantry,
    pantryRecipeMatches.byRecipeId,
    persistGroceryList,
    recipes,
  ]);

  const addPantryFromScan = useCallback(
    (name: string, photoUri: string | null) => {
      const item: PantryItem = {
        id: `scan-${Date.now()}`,
        ingredientId: `scan-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        category: 'produce',
        quantity: 1,
        unit: 'each',
        location: DEFAULT_PANTRY_STORAGE_LOCATION,
        photoUri,
        expiresOn: null,
        updatedAt: new Date().toISOString(),
      };
      if (demoMode || isGuest) {
        setPantry((prev) => [item, ...prev]);
        return;
      }
      if (!supabase || !userId) return;
      void insertPantryItem(supabase, userId, item)
        .then((saved) => setPantry((prev) => [saved, ...prev]))
        .catch((error: unknown) => {
          setAuthError(error instanceof Error ? error.message : 'Failed to add pantry item');
        });
    },
    [demoMode, isGuest, supabase, userId],
  );

  const addManualPantryItem = useCallback(
    async (input: {
      name: string;
      quantity: number;
      unit: string;
      category: PantryCategory;
      location: PantryStorageLocation;
      expiresOn?: string | null;
    }) => {
      const item = buildManualPantryItem(input);
      if (demoMode || isGuest) {
        setPantry((prev) => [item, ...prev]);
        return;
      }
      if (!supabase || !userId) {
        throw new Error('Sign in to add pantry items.');
      }

      trackManualInsert(pendingManualPantryInsertsRef.current, item.id);

      setPantry((prev) => {
        const next = [item, ...prev];
        writeAccountPantryCache(userId, next, { profile });
        return next;
      });

      if (isOffline()) {
        return;
      }

      manualPantryInsertsInFlightRef.current.add(item.id);
      try {
        const saved = await insertPantryItem(supabase, userId, item);
        const cancelled = isManualInsertCancelled(pendingManualPantryInsertsRef.current, item.id);
        completeManualInsertTracking(pendingManualPantryInsertsRef.current, item.id);

        let deleteServerId: string | null = null;
        setPantry((prev) => {
          const merged = mergeSavedManualPantryItem(prev, item.id, saved, cancelled);
          deleteServerId = merged.shouldDeleteServerId;
          if (merged.shouldDeleteServerId) {
            return prev;
          }
          writeAccountPantryCache(userId, merged.pantry, { profile });
          return merged.pantry;
        });

        if (deleteServerId) {
          await deletePantryItemsByIds(supabase, userId, [deleteServerId]);
        }
      } catch (error: unknown) {
        completeManualInsertTracking(pendingManualPantryInsertsRef.current, item.id);
        if (isOffline()) return;
        setPantry((prev) => {
          const next = rollbackManualPantryItem(prev, item.id);
          writeAccountPantryCache(userId, next, { profile });
          return next;
        });
        throw error instanceof Error ? error : new Error('Failed to add pantry item');
      } finally {
        manualPantryInsertsInFlightRef.current.delete(item.id);
      }
    },
    [demoMode, isGuest, profile, supabase, userId],
  );

  const updatePantryItemEntry = useCallback(
    async (item: PantryItem) => {
      if (demoMode || isGuest) {
        setPantry((prev) => prev.map((row) => (row.id === item.id ? { ...item, updatedAt: new Date().toISOString() } : row)));
        return;
      }
      if (!supabase || !userId) {
        throw new Error('Sign in to update pantry items.');
      }
      if (!isPersistedRowUuid(item.id)) {
        // Added while offline (or its first save is still on its way): the server has no row to
        // update yet, and asking it to answered with a database error about the id. Keep the edit
        // on this device; it is saved with the row.
        const edited = { ...item, updatedAt: new Date().toISOString() };
        setPantry((prev) => {
          const next = prev.map((row) => (row.id === item.id ? edited : row));
          writeAccountPantryCache(userId, next, { profile });
          return next;
        });
        return;
      }
      const saved = await updatePantryItem(supabase, userId, item);
      setPantry((prev) => {
        const next = prev.map((row) => (row.id === saved.id ? saved : row));
        writeAccountPantryCache(userId, next, { profile });
        return next;
      });
    },
    [demoMode, isGuest, profile, supabase, userId],
  );

  const deletePantryItemEntry = useCallback(
    async (id: string) => {
      cancelManualInsert(pendingManualPantryInsertsRef.current, id);
      if (demoMode || isGuest) {
        setPantry((prev) => prev.filter((row) => row.id !== id));
        return;
      }
      if (!supabase || !userId) {
        throw new Error('Sign in to update pantry.');
      }
      if (!isManualPantryLocalId(id)) {
        await deletePantryItemsByIds(supabase, userId, [id]);
      }
      setPantry((prev) => {
        const next = prev.filter((row) => row.id !== id);
        writeAccountPantryCache(userId, next, { profile });
        return next;
      });
    },
    [demoMode, isGuest, profile, supabase, userId],
  );

  const clearPantryLocation = useCallback(
    async (location: PantryStorageLocation) => {
      const ids = pantry.filter((item) => item.location === location).map((item) => item.id);
      if (ids.length === 0) return;
      if (demoMode || isGuest) {
        setPantry((prev) => prev.filter((item) => item.location !== location));
        return;
      }
      if (!supabase || !userId) {
        throw new Error('Sign in to update pantry.');
      }
      await deletePantryItemsByIds(supabase, userId, ids);
      setPantry((prev) => {
        const next = prev.filter((item) => item.location !== location);
        writeAccountPantryCache(userId, next, { profile });
        return next;
      });
    },
    [demoMode, isGuest, pantry, profile, supabase, userId],
  );

  const previewPantryResort = useCallback(() => previewResortFromDefaultPantry(pantry), [pantry]);

  const resortPantryItemsInDefaultLocation = useCallback(async () => {
    const preview = previewResortFromDefaultPantry(pantry);
    if (preview.total === 0) return preview;

    const next = pantry.map((item) => resortPantryItemIfDefault(item));
    const changed = next.filter((item, index) => item.location !== pantry[index].location);

    if (demoMode || isGuest) {
      setPantry(next);
      return preview;
    }
    if (!supabase || !userId) {
      throw new Error('Sign in to update pantry items.');
    }

    for (const item of changed) {
      await updatePantryItem(supabase, userId, item);
    }
    setPantry(next);
    return preview;
  }, [demoMode, isGuest, pantry, supabase, userId]);

  const clearAllPantry = useCallback(async () => {
    if (pantry.length === 0) return;
    bumpGroceryPersistGeneration();
    groceryRestockLedgerRef.current.clear();
    if (demoMode) {
      removeStorageKey(STORAGE_KEYS.pantry);
      setPantry([]);
      return;
    }
    if (isGuest) {
      writeGuestPantry([]);
      setPantry([]);
      return;
    }
    if (!supabase || !userId) {
      throw new Error('Sign in to update pantry.');
    }
    await deleteAllPantryItems(supabase, userId);
    removeStorageKey(STORAGE_KEYS.pantry);
    writeAccountPantryCache(userId, [], { profile });
    setPantry([]);
  }, [demoMode, isGuest, pantry.length, profile, supabase, userId]);

  const savePantryScanReview = useCallback(
    async (
      items: PantryScanReviewItem[],
      scanPhotoPath?: string | null,
      scanLocation?: PantryStorageLocation,
    ) => {
      const toSave = reviewItemsToPantryItems(items, scanPhotoPath);
      if (toSave.length === 0) return;

      markForkinatorPantryScanCompleted();

      if (scanLocation) {
        writeLastPantryScanLocation(scanLocation);
      }

      const pantrySnapshot = pantry.map((row) => ({ ...row }));
      const { pantry: nextPantry, inserted, updated } = mergePantryStock(pantry, toSave);
      /** The pantry as the server holds it after this save: new rows under the ids the server gave them. */
      let savedPantry = nextPantry;

      setPantry(nextPantry);

      if (!demoMode && !isGuest) {
        if (!supabase || !userId) {
          setPantry(pantrySnapshot);
          throw new Error('Sign in to save pantry items.');
        }
        let savedInserts: PantryItem[] = [];
        try {
          // New rows first, in one request: if that fails nothing has changed anywhere.
          if (inserted.length > 0) {
            savedInserts = await insertPantryItems(supabase, userId, inserted);
          }
          for (const row of updated) {
            await updatePantryItem(supabase, userId, row);
          }
        } catch (error: unknown) {
          // Put the screen back. Left in place, the unsaved rows made every retry fail (they were
          // sent as updates to rows the server never had) and stayed on this device as items the
          // account does not own.
          setPantry(pantrySnapshot);
          if (savedInserts.length > 0 || updated.length > 0) {
            // Something reached the server before the failure (the new rows, or some of the
            // quantity updates). Take the server back to where it was too, so "Save" can be
            // pressed again without doubling anything.
            const insertIds = new Set(inserted.map((row) => row.id));
            const attempted = [...savedInserts, ...nextPantry.filter((row) => !insertIds.has(row.id))];
            void syncPantryToSnapshot(supabase, userId, attempted, pantrySnapshot).catch(() => undefined);
          }
          throw error;
        }
        if (savedInserts.length > 0) {
          const insertIds = new Set(inserted.map((row) => row.id));
          savedPantry = [...savedInserts, ...nextPantry.filter((row) => !insertIds.has(row.id))];
          setPantry((prev) => [...savedInserts, ...prev.filter((row) => !insertIds.has(row.id))]);
        }
        writeAccountPantryCache(userId, savedPantry, { profile });
      }

      setUndoToast({
        message: PANTRY_SCAN_UI_COPY.addedToPantry(toSave.length),
        onUndo: () => {
          setPantry(pantrySnapshot);
          setUndoToast(null);
          if (!demoMode && !isGuest && supabase && userId) {
            // Compared against the saved ids: with the local "scan-…" ids nothing matched on the
            // server, so the undone items came back on the next load.
            void syncPantryToSnapshot(supabase, userId, savedPantry, pantrySnapshot)
              .then(() => writeAccountPantryCache(userId, pantrySnapshot, { profile }))
              .catch((error: unknown) => {
                setAuthError(error instanceof Error ? error.message : 'Failed to undo pantry update');
              });
          }
        },
      });
    },
    [demoMode, isGuest, pantry, profile, supabase, userId],
  );

  const addPantryStaples = useCallback(
    async (selections: StapleSelectionState[]) => {
      const toSave = stapleSelectionsToPantryItems(selections);
      if (toSave.length === 0) return;

      const pantrySnapshot = pantry.map((row) => ({ ...row }));
      let nextPantry: PantryItem[] = pantry;
      let inserted: PantryItem[] = [];
      let updated: PantryItem[] = [];

      setPantry((prev) => {
        const merged = mergePantryStock(prev, toSave);
        nextPantry = merged.pantry;
        inserted = merged.inserted;
        updated = merged.updated;
        if (!demoMode && !isGuest && userId) {
          writeAccountPantryCache(userId, nextPantry, { profile });
        }
        return nextPantry;
      });

      if (!demoMode && !isGuest) {
        if (!supabase || !userId) {
          throw new Error('Sign in to save pantry items.');
        }
        for (const row of updated) {
          await updatePantryItem(supabase, userId, row);
        }
        if (inserted.length > 0) {
          const savedInserts = await insertPantryItems(supabase, userId, inserted);
          setPantry((prev) => {
            const insertIds = new Set(inserted.map((row) => row.id));
            const without = prev.filter((row) => !insertIds.has(row.id));
            const withSaved = [...savedInserts, ...without];
            writeAccountPantryCache(userId, withSaved, { profile });
            return withSaved;
          });
        }
      }

      setUndoToast({
        message: PANTRY_STAPLES_COPY.addedToast(toSave.length),
        showUndo: false,
        onUndo: () => {
          setPantry(pantrySnapshot);
          setUndoToast(null);
          if (!demoMode && !isGuest && supabase && userId) {
            void syncPantryToSnapshot(supabase, userId, nextPantry, pantrySnapshot).catch((error: unknown) => {
              setAuthError(error instanceof Error ? error.message : 'Failed to undo pantry update');
            });
          }
        },
      });
    },
    [demoMode, isGuest, pantry, profile, supabase, userId],
  );

  const setFeatureFlag = useCallback(
    (key: keyof FeatureFlags, value: boolean) => {
      setFeatureFlags((prev) => ({ ...prev, [key]: value }));
      if (!demoMode && supabase && isAdmin) {
        void upsertFeatureFlag(supabase, key, value).catch((error: unknown) => {
          setAuthError(error instanceof Error ? error.message : 'Failed to update feature flag');
        });
      }
    },
    [demoMode, isAdmin, supabase],
  );

  const addMissingRecipeIngredientsToGrocery = useCallback(
    (recipeId: string, matchOverride?: RecipePantryMatch) => {
      const match = matchOverride ?? pantryRecipeMatches.byRecipeId.get(recipeId);
      if (!match) {
        setUndoToast({
          message: GROCERY_COPY.addMissingUnavailable,
          showUndo: false,
          onUndo: () => setUndoToast(null),
        });
        return;
      }
      appendMissingIngredientsForRecipe(recipeId, match.missing, { showToast: true });
    },
    [appendMissingIngredientsForRecipe, pantryRecipeMatches.byRecipeId],
  );

  const addMissingDiscoveryRecipeIngredientsToGrocery = useCallback(
    (item: RecipeDiscoveryListItem) => {
      const recipeId = resolveDiscoveryGroceryRecipeId(recipes, item.id, ownerId);
      const libraryRecipe = recipes.find((row) => row.id === recipeId);
      let missing: RecipeIngredient[];
      if (libraryRecipe) {
        missing = scoreRecipeAgainstPantry(
          withServingScale(libraryRecipe, servingOverrides),
          pantry,
        ).missing;
      } else {
        const scale = recipeServingScale({ id: recipeId, servings: item.servings }, servingOverrides);
        missing = scaleRecipeIngredients(
          scoreDiscoveryRecipeAgainstPantry(item, pantry).missing,
          scale,
        );
      }
      appendMissingIngredientsForRecipe(recipeId, missing, { showToast: true });
    },
    [appendMissingIngredientsForRecipe, ownerId, pantry, recipes, servingOverrides],
  );

  const setUserPreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setUserPreferences((prev) => ({ ...prev, [key]: value }));
      if (!demoMode && supabase && userId && key === 'autoAddMissingToGrocery') {
        void updateProfilePreferences(supabase, userId, {
          autoAddMissingToGrocery: value as boolean,
        }).catch((error: unknown) => {
          setAuthError(error instanceof Error ? error.message : 'Failed to save preference');
        });
      }
    },
    [demoMode, supabase, userId],
  );

  const dismissUndoToast = useCallback(() => setUndoToast(null), []);

  const notifySavedToMyRecipes = useCallback((onViewMyRecipes: () => void) => {
    setUndoToast({
      message: SAVED_RECIPES_COPY.toastSaved,
      showUndo: false,
      actionLabel: SAVED_RECIPES_COPY.myRecipesViewAction,
      onAction: () => {
        setUndoToast(null);
        onViewMyRecipes();
      },
      onUndo: () => setUndoToast(null),
    });
  }, []);

  const notifyRemovedFromMyRecipes = useCallback((onUndo: () => void) => {
    setUndoToast({
      message: SAVED_RECIPES_COPY.toastRemoved,
      onUndo: () => {
        onUndo();
        setUndoToast(null);
      },
    });
  }, []);

  const notifyMyRecipesSaveFailed = useCallback(() => {
    setUndoToast({
      message: SAVED_RECIPES_COPY.toastSaveFailed,
      showUndo: false,
      onUndo: () => setUndoToast(null),
    });
  }, []);

  const notifyRecipeHiddenForDietSettings = useCallback(() => {
    setUndoToast({
      message: DIET_PREF_COPY.hiddenForAllergySettingsToast,
      showUndo: false,
      onUndo: () => setUndoToast(null),
    });
  }, []);

  const notifyRecipeOfflineUnavailable = useCallback(() => {
    setUndoToast({
      message: DIET_PREF_COPY.recipeOfflineUnavailableToast,
      showUndo: false,
      onUndo: () => setUndoToast(null),
    });
  }, []);

  const notifyRecipeLookupNotReady = useCallback(() => {
    setUndoToast({
      message: RECIPES_COPY.recipeCard.lookupBookmarkNotReady,
      showUndo: false,
      onUndo: () => setUndoToast(null),
    });
  }, []);

  const kitchenPantryReady =
    demoMode ||
    (hydrated &&
      authReady &&
      (userId ? liveDataLoaded : guestKitchenHydrated));

  const mealMadeReviewTitle = useMemo(() => {
    if (!mealMadeReview) return null;
    if (mealMadeReview.mealPlanItemId) {
      const fromPlan = mealPlan.find((row) => row.id === mealMadeReview.mealPlanItemId)?.title;
      if (fromPlan) return fromPlan;
    }
    return feedKitchenRecipes.find((row) => row.id === mealMadeReview.recipeId)?.name ?? null;
  }, [feedKitchenRecipes, mealMadeReview, mealPlan]);

  const mealMadeReviewRows = useMemo(() => {
    if (!mealMadeReview) return [];
    const recipe = feedKitchenRecipes.find((row) => row.id === mealMadeReview.recipeId);
    if (!recipe) return [];
    return mealMadeReviewRowsWithDeductions(
      scoreRecipeForPantryDeduction(recipe, pantry),
      recipe,
      servingOverrides,
      profile.householdSize,
    );
  }, [feedKitchenRecipes, mealMadeReview, pantry, profile.householdSize, servingOverrides]);

  const value = useMemo(
    () => ({
      appName: APP_NAME,
      demoMode,
      isGuest,
      profileReady,
      authReady,
      authError,
      kitchenError,
      clearKitchenError,
      session,
      profile,
      isAdmin,
      setDemoRole,
      signInWithPassword,
      signUpWithPassword,
      signInWithMagicLink,
      requestPasswordReset,
      updatePassword,
      signOut,
      pantry,
      recipes,
      grocery,
      mealPlan,
      plannedRecipeIds,
      servingOverrides,
      featureFlags,
      maintenanceActive,
      summary,
      analytics,
      analyticsLoaded: demoMode || liveAnalytics != null,
      toggleMealPlanKitchenRecipe,
      toggleMealPlanDiscoveryRecipe,
      removeMealPlanItem,
      openMealMadeReview,
      closeMealMadeReview,
      toggleMealMadePantryUse,
      confirmMealMade,
      undoLastMealMade,
      mealMadeReview,
      mealMadeReviewTitle,
      mealMadeReviewRows,
      mealMadeBusy,
      cookConfirmPrompt,
      beginCookViewSession,
      finishCookViewSession,
      confirmCookConfirmPrompt,
      declineCookConfirmPrompt,
      dismissCookConfirmPrompt,
      cookConfirmBusy,
      kitchenPantryReady,
      isOnMealPlan,
      scheduleMealFromRecipe,
      notifyMealScheduled,
      updateMealPlanSchedule,
      shopForWeekScheduledMeals,
      addMissingForPlannedMealsToGrocery,
      userPreferences,
      setUserPreference,
      userDietPrefs,
      saveUserDietPrefs,
      undoToast,
      dismissUndoToast,
      notifySavedToMyRecipes,
      notifyRemovedFromMyRecipes,
      notifyMyRecipesSaveFailed,
      notifyRecipeHiddenForDietSettings,
      notifyRecipeOfflineUnavailable,
      notifyRecipeLookupNotReady,
      savedRecipes,
      registerSavedRecipeToggleOutcome,
      toggleGroceryItem,
      toggleGroceryItemsChecked,
      markGroceryItemsBought,
      addManualGroceryItem,
      clearCheckedGroceryItems,
      removeGroceryItem,
      seedPantry,
      updateRecipe,
      importDiscoveredRecipe,
      saveLinkImportedRecipe,
      clearImportedRecipeSource,
      addPantryFromScan,
      addManualPantryItem,
      updatePantryItemEntry,
      deletePantryItemEntry,
      clearPantryLocation,
      clearAllPantry,
      previewPantryResort,
      resortPantryItemsInDefaultLocation,
      savePantryScanReview,
      addPantryStaples,
      setFeatureFlag,
      refreshGrocery,
      appendMissingIngredientsForPlannedMeal,
      pantryRecipeMatches,
      pantryRecipeMatchesRankedFiltered,
      pantryRecipeRecommendations,
      libraryRecipes,
      feedKitchenRecipes,
      catalogKitchenRecipes,
      refreshLibraryRecipes,
      libraryRecipesLoading,
      addMissingRecipeIngredientsToGrocery,
      addMissingDiscoveryRecipeIngredientsToGrocery,
      accountUi: {
        sheet: accountSheet,
        showPostSignupSetup,
        showPasswordRecovery,
        dismissPasswordRecovery,
        openAuthSheet,
        openAccountSheet,
        closeSheet: closeAccountSheet,
      },
      openAuthSheet,
      openAccountSheet,
      saveProfileSetup,
      uploadProfilePhoto,
      removeProfilePhoto,
      deleteAccount,
      refreshProfilePlan,
      showNotice,
      completePostSignupSetup,
    }),
    [
      accountSheet,
      showPasswordRecovery,
      dismissPasswordRecovery,
      addPantryFromScan,
      addManualPantryItem,
      updatePantryItemEntry,
      deletePantryItemEntry,
      clearPantryLocation,
      clearAllPantry,
      previewPantryResort,
      resortPantryItemsInDefaultLocation,
      savePantryScanReview,
      addPantryStaples,
      analytics,
      liveAnalytics,
      authError,
      kitchenError,
      clearKitchenError,
      authReady,
      demoMode,
      isGuest,
      profileReady,
      featureFlags,
      grocery,
      isAdmin,
      maintenanceActive,
      pantry,
      profile,
      recipes,
      refreshGrocery,
      appendMissingIngredientsForPlannedMeal,
      mealPlan,
      plannedRecipeIds,
      servingOverrides,
      session,
      seedPantry,
      setDemoRole,
      setFeatureFlag,
      signInWithMagicLink,
      requestPasswordReset,
      updatePassword,
      signInWithPassword,
      signOut,
      signUpWithPassword,
      summary,
      toggleGroceryItem,
      toggleGroceryItemsChecked,
      markGroceryItemsBought,
      addManualGroceryItem,
      clearCheckedGroceryItems,
      removeGroceryItem,
      toggleMealPlanKitchenRecipe,
      toggleMealPlanDiscoveryRecipe,
      removeMealPlanItem,
      openMealMadeReview,
      closeMealMadeReview,
      toggleMealMadePantryUse,
      confirmMealMade,
      undoLastMealMade,
      mealMadeReview,
      mealMadeReviewTitle,
      mealMadeReviewRows,
      mealMadeBusy,
      cookConfirmPrompt,
      beginCookViewSession,
      finishCookViewSession,
      confirmCookConfirmPrompt,
      declineCookConfirmPrompt,
      dismissCookConfirmPrompt,
      cookConfirmBusy,
      kitchenPantryReady,
      isOnMealPlan,
      scheduleMealFromRecipe,
      notifyMealScheduled,
      updateMealPlanSchedule,
      shopForWeekScheduledMeals,
      addMissingForPlannedMealsToGrocery,
      userPreferences,
      setUserPreference,
      userDietPrefs,
      saveUserDietPrefs,
      undoToast,
      dismissUndoToast,
      notifySavedToMyRecipes,
      notifyRemovedFromMyRecipes,
      notifyMyRecipesSaveFailed,
      notifyRecipeHiddenForDietSettings,
      notifyRecipeOfflineUnavailable,
      notifyRecipeLookupNotReady,
      savedRecipes,
      registerSavedRecipeToggleOutcome,
      updateRecipe,
      importDiscoveredRecipe,
      saveLinkImportedRecipe,
      clearImportedRecipeSource,
      pantryRecipeMatches,
      pantryRecipeMatchesRankedFiltered,
      pantryRecipeRecommendations,
      libraryRecipes,
      feedKitchenRecipes,
      catalogKitchenRecipes,
      refreshLibraryRecipes,
      libraryRecipesLoading,
      addMissingRecipeIngredientsToGrocery,
      addMissingDiscoveryRecipeIngredientsToGrocery,
      previewPantryResort,
      resortPantryItemsInDefaultLocation,
      notifyMealScheduled,
      scheduleMealFromRecipe,
      shopForWeekScheduledMeals,
      showPostSignupSetup,
      openAuthSheet,
      openAccountSheet,
      closeAccountSheet,
      saveProfileSetup,
      uploadProfilePhoto,
      removeProfilePhoto,
      deleteAccount,
      refreshProfilePlan,
      showNotice,
      completePostSignupSetup,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function resetFeatureFlags(): FeatureFlags {
  return { ...FEATURE_FLAG_DEFAULTS };
}
