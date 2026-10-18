import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { containsLine } from '../allergens/copy';
import type { AllergenKey } from '../allergens/types';
import { recipeHref, servingsAndTime, type AppRecipe } from '../data/recipes';
import { recipeStatus, recipeStatusLabel } from '../kitchen/recipeFeed';
import type { RecipePantryMatch } from '../kitchen/recipeMatch';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { RecipePhoto } from '../ui/RecipePhoto';
import { StatusSticker } from './StatusSticker';

const THUMB = 72;

/** One recipe in the feed: photo, name, servings and time, and its status sticker. Opens the detail. */
export function RecipeCard({ recipe, match, allergens = [], gearNote = null }: { recipe: AppRecipe; match: RecipePantryMatch; allergens?: readonly AllergenKey[]; gearNote?: string | null }) {
  const router = useRouter();
  const status = recipeStatus(match);
  const contains = containsLine(allergens);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, ${recipeStatusLabel(status)}${contains ? `, ${contains}` : ''}`}
      accessibilityHint="Opens the recipe"
      onPress={() => router.push(recipeHref(recipe.source, recipe.rowId))}
      style={({ pressed }) => ({
        minHeight: touch.min,
        flexDirection: 'row',
        gap: space.gap,
        padding: 12,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <RecipePhoto uri={recipe.imageUrl} tags={recipe.tags} title={recipe.name} width={THUMB} height={THUMB} />
      <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
        <AppText bold numberOfLines={2}>
          {recipe.name}
        </AppText>
        <AppText variant="secondary" color="muted">
          {servingsAndTime(recipe)}
        </AppText>
        <StatusSticker status={status} />
        {gearNote ? (
          <AppText variant="secondary" color="muted" testID="gear-note">
            {gearNote}
          </AppText>
        ) : null}
        {contains ? (
          <AppText variant="secondary" color="danger" bold testID="allergen-contains">
            {contains}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}
