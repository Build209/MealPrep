import { useRouter } from 'expo-router';
import { Image, Pressable, View } from 'react-native';
import { recipeHref, servingsAndTime, type AppRecipe } from '../data/recipes';
import { recipeStatus, recipeStatusLabel } from '../kitchen/recipeFeed';
import type { RecipePantryMatch } from '../kitchen/recipeMatch';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { StatusSticker } from './StatusSticker';

const THUMB = 72;

/** One recipe in the feed: photo, name, servings and time, and its status sticker. Opens the detail. */
export function RecipeCard({ recipe, match }: { recipe: AppRecipe; match: RecipePantryMatch }) {
  const router = useRouter();
  const status = recipeStatus(match);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, ${recipeStatusLabel(status)}`}
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
      {recipe.imageUrl ? (
        <Image
          source={{ uri: recipe.imageUrl }}
          accessibilityIgnoresInvertColors
          style={{ width: THUMB, height: THUMB, borderRadius: radius.control, backgroundColor: colors.sand }}
        />
      ) : (
        <View style={{ width: THUMB, height: THUMB, borderRadius: radius.control, backgroundColor: colors.sand }} />
      )}
      <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
        <AppText bold numberOfLines={2}>
          {recipe.name}
        </AppText>
        <AppText variant="secondary" color="muted">
          {servingsAndTime(recipe)}
        </AppText>
        <StatusSticker status={status} />
      </View>
    </Pressable>
  );
}
