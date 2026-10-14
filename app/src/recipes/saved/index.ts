// Saved recipes. For the recipe page (helper F):
//   <SaveButton target={saveTargetForRecipe({ routeId, table, uuid, legacyId, title, imageUrl, ... })} />
// legacyId is the old app's id: recipes row `slug ?? uuid`, library row `"library-" + slug`.
export { SaveButton } from './SaveButton';
export { SavedRecipesScreen } from './SavedRecipesScreen';
export { saveTargetForCreatorVideo, saveTargetForRecipe, type SaveTarget, type SaveableRecipe } from '../../data/savedRecipes';
