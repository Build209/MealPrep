import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { THEME } from '../../config/appConfig';
import type { RecipesTabRow } from '../../config/recipesTabFilters';
import { Ionicons } from '../../lib/icons/Ionicons';
import { resolveKitchenRecipeImageUrl } from '../../lib/recipes/recipeImageUrl';
import { pantryCircleSticker } from '../../lib/recipesTab/pantryCircles';

const CIRCLE = 64;

/**
 * "Cook tonight" circles under From your pantry on Home (owner picked option B, 2026-10-11):
 * round recipe photos with a Ready / Need N sticker. Tapping one opens that recipe; the last
 * circle opens the whole section.
 */
export function PantryRecipeCirclesRow({
  rows,
  onOpen,
  onSeeAll,
}: {
  rows: readonly RecipesTabRow[];
  onOpen: (row: RecipesTabRow) => void;
  onSeeAll: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="list"
      accessibilityLabel="Recipes you can cook from your pantry"
      contentContainerStyle={{ gap: 12, paddingTop: 6, paddingRight: 4 }}
    >
      {rows.map((row) => {
        const sticker = pantryCircleSticker(row.match.missingCount);
        const uri = row.kind === 'kitchen' ? resolveKitchenRecipeImageUrl(row.recipe) : null;
        const name = row.match.recipeName || String(row.recipe.name ?? '');
        return (
          <Pressable
            key={String(row.recipe.id)}
            onPress={() => onOpen(row)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${sticker.ready ? 'ready to cook' : `need ${row.match.missingCount} more`}`}
            className="min-h-[44px] items-center"
            style={{ width: 72 }}
          >
            <View style={{ width: CIRCLE, height: CIRCLE }}>
              {uri ? (
                <Image
                  source={{ uri }}
                  className={`rounded-full bg-card ${sticker.ready ? 'border-[3px] border-success' : 'border border-border'}`}
                  style={{ width: CIRCLE, height: CIRCLE }}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View
                  className={`items-center justify-center rounded-full bg-card ${sticker.ready ? 'border-[3px] border-success' : 'border border-border'}`}
                  style={{ width: CIRCLE, height: CIRCLE }}
                >
                  <Ionicons name="restaurant-outline" size={24} color={THEME.muted} />
                </View>
              )}
              <View
                className={`absolute rounded-md px-1.5 py-0.5 ${sticker.ready ? 'bg-success' : 'border border-border bg-card'}`}
                style={{ top: -6, right: -8, transform: [{ rotate: sticker.ready ? '6deg' : '-5deg' }] }}
              >
                <Text
                  className={`text-[10px] font-extrabold ${sticker.ready ? 'text-on-success' : 'text-ink'}`}
                >
                  {sticker.label}
                </Text>
              </View>
            </View>
            <Text className="mt-1.5 text-center text-xs font-semibold text-muted" numberOfLines={2}>
              {name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={onSeeAll}
        accessibilityRole="button"
        accessibilityLabel="See all recipes from your pantry"
        className="min-h-[44px] items-center"
        style={{ width: CIRCLE + 4 }}
      >
        <View
          className="items-center justify-center rounded-full border-2 border-dashed border-muted"
          style={{ width: CIRCLE, height: CIRCLE }}
        >
          <Ionicons name="chevron-forward" size={22} color={THEME.ink} />
        </View>
        <Text className="mt-1.5 text-center text-xs font-bold text-ink">See all</Text>
      </Pressable>
    </ScrollView>
  );
}
