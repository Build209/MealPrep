import type { AppRecipe } from '../data/recipes';
import { useProfile } from '../data/profile';
import { useRecipeNutrition } from '../nutrition/useRecipeNutrition';
import { scanTierFor } from '../scan/allowance';
import { NutritionCard } from './NutritionCard';

/**
 * Plus gate, same rule as the scanner: scanTierFor(profile) (admins uncapped, otherwise
 * profiles.plan + plan_tier). Anything other than 'free' is a paid account.
 */
export function isPlusProfile(profile: { role?: string | null; plan?: string | null; planTier?: string | null }): boolean {
  return scanTierFor(profile) !== 'free';
}

/**
 * The nutrition card for one recipe. Free accounts get the locked teaser and the lookup is told
 * `enabled=false`, so no call is made for them. While the profile is still loading nothing shows,
 * so a paid account never sees a flash of the locked card.
 */
export function RecipeNutritionSection({ recipe }: { recipe: AppRecipe }) {
  const profile = useProfile();
  const isPlus = profile.data ? isPlusProfile(profile.data) : false;
  const nutrition = useRecipeNutrition(recipe, isPlus);
  if (!profile.data) return null;
  return <NutritionCard isPlus={isPlus} data={nutrition.data} isLoading={nutrition.isLoading} isError={nutrition.isError} isOffline={nutrition.isOffline} />;
}
