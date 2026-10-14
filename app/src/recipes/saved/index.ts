// Saved recipes. The recipe page (src/recipes/RecipeDetailScreen.tsx) uses
//   <SaveButton target={saveTargetForRecipe(saveableFromAppRecipe(recipe))} />  (when not null)
// legacyId is the old app's id: recipes row `slug ?? uuid`, library row `"library-" + slug`.
export { SaveButton } from './SaveButton';
export { SavedRecipesScreen } from './SavedRecipesScreen';
export { saveableFromAppRecipe, saveTargetForCreatorVideo, saveTargetForRecipe, type SaveTarget, type SaveableRecipe } from '../../data/savedRecipes';
