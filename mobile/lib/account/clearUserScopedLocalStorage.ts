import { DIET_PREFS_STORAGE_KEY, DEFAULT_USER_DIET_PREFS, normalizeUserDietPrefs } from '../diet/prefs';
import { clearRecipeEngagementForOwner } from '../recipeRanking/eventStore';
import {
  writeSavedCoords,
  writeSavedStoreIds,
  writeSavedStoreSummaries,
  writeSavedZip,
} from '../smartShop/storage';
import { writeJson } from '../storage';
import { clearAccountKitchenCache } from './accountKitchenCache';
import { clearLastAccountUserId } from './lastAccountUser';
import { clearAccountSavedRecipesCache } from '../savedRecipes/accountCache';
import { clearUsualItemsForOwner } from '../usual/usualItems';

/** Remove per-user prefs from device storage on sign-out (keep recipe catalog caches). */
export function clearUserScopedLocalStorage(userId: string | null | undefined): void {
  writeJson(DIET_PREFS_STORAGE_KEY, normalizeUserDietPrefs(DEFAULT_USER_DIET_PREFS));
  writeSavedZip('');
  writeSavedStoreIds([]);
  writeSavedStoreSummaries([]);
  writeSavedCoords(null);
  if (userId) {
    clearRecipeEngagementForOwner(userId);
    clearAccountKitchenCache(userId);
    clearAccountSavedRecipesCache(userId);
    clearUsualItemsForOwner(userId);
  }
  clearLastAccountUserId();
}
