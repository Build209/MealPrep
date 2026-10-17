import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { containsLine } from '../../allergens/copy';
import type { AllergenKey } from '../../allergens/types';
import type { SearchableRecipe } from '../../data/recipeSearch';
import { saveTargetForRecipe } from '../../data/savedRecipes';
import { space } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { RecipePhoto } from '../../ui/RecipePhoto';
import { recipeHref } from '../links';
import { SaveButton } from '../saved/SaveButton';

/** One recipe in the search results: photo, title, a short note; opens the recipe page. Heart on the right. */
export function RecipeResultRow({ recipe, note, allergens = [] }: { recipe: SearchableRecipe; note: string; allergens?: readonly AllergenKey[] }) {
  const router = useRouter();
  const contains = containsLine(allergens);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={[recipe.title, note, contains].filter(Boolean).join('. ')}
        onPress={() => router.push(recipeHref(recipe.routeId))}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.gap, minHeight: 44, opacity: pressed ? 0.85 : 1 })}
      >
        <RecipePhoto uri={recipe.imageUrl} tags={recipe.tags} title={recipe.title} width={64} height={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body" bold numberOfLines={2}>
            {recipe.title}
          </AppText>
          {note ? (
            <AppText variant="secondary" color="muted" numberOfLines={1}>
              {note}
            </AppText>
          ) : null}
          {contains ? (
            <AppText variant="secondary" color="danger" bold numberOfLines={2} testID="allergen-contains">
              {contains}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <SaveButton target={saveTargetForRecipe(recipe)} />
    </View>
  );
}
