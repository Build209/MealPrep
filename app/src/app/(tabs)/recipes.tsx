import { Redirect, useLocalSearchParams } from 'expo-router';
import { RecipesScreen } from '../../recipes/RecipesScreen';

/**
 * The Recipes tab (/recipes). The screen lives in src/recipes/. The old app's /recipes?q=<words>
 * links were searches, so a `q` still opens Search with it.
 */
export default function RecipesRoute() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  if (typeof q === 'string' && q.trim()) return <Redirect href={`/recipes/search?q=${encodeURIComponent(q)}`} />;
  return <RecipesScreen />;
}
