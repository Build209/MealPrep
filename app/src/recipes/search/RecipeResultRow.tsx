import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { SearchableRecipe } from '../../data/recipeSearch';
import { saveTargetForRecipe } from '../../data/savedRecipes';
import { space } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { PhotoThumb } from '../../ui/PhotoThumb';
import { recipeHref } from '../links';
import { SaveButton } from '../saved/SaveButton';

/** One recipe in the search results: photo, title, a short note; opens the recipe page. Heart on the right. */
export function RecipeResultRow({ recipe, note }: { recipe: SearchableRecipe; note: string }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={note ? `${recipe.title}. ${note}` : recipe.title}
        onPress={() => router.push(recipeHref(recipe.routeId))}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.gap, minHeight: 44, opacity: pressed ? 0.85 : 1 })}
      >
        <PhotoThumb uri={recipe.imageUrl} width={64} height={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body" bold numberOfLines={2}>
            {recipe.title}
          </AppText>
          {note ? (
            <AppText variant="secondary" color="muted" numberOfLines={1}>
              {note}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <SaveButton target={saveTargetForRecipe(recipe)} />
    </View>
  );
}
