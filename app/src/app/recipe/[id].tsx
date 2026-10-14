import { useLocalSearchParams } from 'expo-router';
import { RecipeDetailScreen } from '../../recipes/RecipeDetailScreen';

/**
 * /recipe/[id]: one recipe from either table. Ids: r_<uuid> (public.recipes) or l_<uuid>
 * (published public.library_recipes). Build links with recipeHref() from src/data/recipes.ts.
 */
export default function RecipeRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  return <RecipeDetailScreen key={id} id={id} />;
}
