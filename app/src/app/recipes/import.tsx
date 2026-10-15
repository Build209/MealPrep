import { useLocalSearchParams } from 'expo-router';
import { ImportScreen } from '../../recipes/import/ImportScreen';
import { initialImportText } from '../../recipes/import/shareParams';

/**
 * /recipes/import: paste a link or recipe text (or use a recipe photo or a saved video), review,
 * then save as your own recipe. `?url=` or `?text=` fills the box (a shared link); nothing is
 * imported until the person taps Import, so an import is never spent without a tap.
 */
export default function RecipeImportRoute() {
  const params = useLocalSearchParams<{ url?: string | string[]; text?: string | string[] }>();
  return <ImportScreen initialText={initialImportText(params)} />;
}
