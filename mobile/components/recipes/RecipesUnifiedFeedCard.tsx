import { memo, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { THEME } from '../../config/appConfig';
import type { RecipesTabRow } from '../../config/recipesTabFilters';
import { RECIPE_IMAGE } from '../../config/recipeImages';
import { recipeListShopLine } from '../../lib/recipes/recipeListShopLine';
import {
  resolveDiscoveryRecipeImageUrl,
  resolveKitchenRecipeImageUrl,
} from '../../lib/recipes/recipeImageUrl';
import { DietAllergenBadge } from '../diet/DietAllergenBadge';
import { dietCheckLinesFromRecipesTabRow } from '../../lib/diet/ingredientLines';
import { RecipeThumbnail } from './RecipeThumbnail';
import { RecipeSaveButton } from './RecipeSaveButton';
import { CookThisButton } from '../mealCalendar/CookThisButton';
import { RECIPES_COPY } from '../../config/recipesCopy';
import { Sticker } from '../ui/Sticker';

interface RecipesUnifiedFeedCardProps {
  row: RecipesTabRow;
  onOpen: () => void;
  onCook?: () => void;
  sourceTag?: string | null;
  saved?: boolean;
  onToggleSave?: () => void;
  saveDisabled?: boolean;
  interactionLoading?: boolean;
  /** Hide recipe title until MealDB details resolve (allergen safety). */
  maskTitle?: boolean;
  /** Hide thumbnail until safety check passes (paired with maskTitle). */
  maskImage?: boolean;
  /** Appended to the default accessibility label (e.g. diet conflict warning). */
  accessibilityDietWarning?: string | null;
  /** Home 2-column grid: half-width card with the shorter photo. */
  grid?: boolean;
}

const GRID_CARD_STYLE = { width: '48.4%' } as const;
const GRID_IMAGE_HEIGHT = 108;

function RecipesUnifiedFeedCardInner({
  row,
  onOpen,
  onCook,
  sourceTag,
  saved,
  onToggleSave,
  saveDisabled = false,
  interactionLoading = false,
  maskTitle = false,
  maskImage = false,
  accessibilityDietWarning = null,
  grid = false,
}: RecipesUnifiedFeedCardProps) {
  const imageHeight = grid ? GRID_IMAGE_HEIGHT : RECIPE_IMAGE.listHeight;
  const name = maskTitle ? '' : row.recipe.name;
  const imageUri = useMemo(() => {
    if (maskImage) return null;
    return row.kind === 'kitchen'
      ? resolveKitchenRecipeImageUrl(row.recipe)
      : resolveDiscoveryRecipeImageUrl(row.recipe);
  }, [maskImage, row]);
  const matchPending = row.kind === 'kitchen' && Boolean(row.pantryMatchPending);
  const matchFailed = row.kind === 'kitchen' && Boolean(row.pantryMatchFailed);
  const shopLine = useMemo(() => {
    if (matchFailed) return RECIPES_COPY.recipeCard.lookupFailed;
    if (matchPending) return RECIPES_COPY.recipeCard.checkingPantry;
    return recipeListShopLine(row.match);
  }, [matchFailed, matchPending, row.match]);
  const hasIngredients = row.kind === 'kitchen' && row.recipe.ingredients.length > 0;
  const readyToCook = !matchPending && hasIngredients && row.match.missingCount === 0;
  // Pantry match pill ("You have 6 of 8") — same numbers and wording as the pantry badge helper.
  // Nothing in the pantry matches: no sticker, the "Missing N items" line already says it.
  const pantryPill =
    matchPending || matchFailed || row.match.totalIngredients === 0 || row.match.matchedCount === 0
      ? null
      : row.match.missingCount === 0
        ? RECIPES_COPY.pantryOverlap.readyToCook
        : RECIPES_COPY.pantryOverlap.youHave(row.match.matchedCount, row.match.totalIngredients);
  const showShopLine = !(pantryPill && readyToCook);
  const ingredientLines = useMemo(() => dietCheckLinesFromRecipesTabRow(row), [row]);
  const accessibilityLabel = useMemo(() => {
    const base = maskTitle ? shopLine : `${row.recipe.name}. ${shopLine}`;
    if (!accessibilityDietWarning) return base;
    return `${base}. ${accessibilityDietWarning}`;
  }, [accessibilityDietWarning, maskTitle, row.recipe.name, shopLine]);

  return (
    <Pressable
      onPress={onOpen}
      disabled={interactionLoading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="relative mb-3 rounded-[18px] border border-border bg-card"
      style={grid ? GRID_CARD_STYLE : undefined}
    >
      <View className="relative">
        {maskImage ? (
          <View
            className="bg-border/40"
            style={{ height: imageHeight }}
            accessibilityLabel=""
          />
        ) : (
          <RecipeThumbnail
            uri={imageUri}
            accessibilityLabel=""
            height={imageHeight}
            lazy
          />
        )}
        <DietAllergenBadge ingredientLines={ingredientLines} />
        {/* Pantry match as a sticker on the corner of the photo: leaf when everything is in. */}
        {pantryPill ? (
          <View className="absolute -bottom-3 left-2">
            <Sticker label={pantryPill} tone={readyToCook ? 'leaf' : 'banana'} size="sm" tilt={readyToCook ? -5 : -3} />
          </View>
        ) : null}
        {onToggleSave ? (
          <View className="absolute right-1.5 top-1.5">
            <RecipeSaveButton
              saved={Boolean(saved)}
              onToggle={onToggleSave}
              size={20}
              disabled={saveDisabled}
              className="h-11 w-11"
            />
          </View>
        ) : null}
      </View>
      <View className={pantryPill ? 'px-3 pb-3 pt-5' : 'p-3'}>
        {name ? (
          <Text className="text-[15px] font-bold leading-[18px] text-ink" numberOfLines={2}>
            {name}
          </Text>
        ) : null}
        {showShopLine ? (
          <Text
            className={`mt-1.5 text-xs ${readyToCook ? 'text-success-accent' : 'text-danger'}`}
            numberOfLines={1}
          >
            {shopLine}
          </Text>
        ) : null}
        {sourceTag ? (
          <Text className="mt-1 text-[11px] text-muted" numberOfLines={1}>
            {sourceTag}
          </Text>
        ) : null}
        {onCook ? (
          <View className="mt-2">
            <CookThisButton
              compact
              className="min-h-[44px] justify-center self-start"
              onPress={onCook}
            />
          </View>
        ) : null}
      </View>
      {interactionLoading ? (
        <View
          className="absolute inset-0 items-center justify-center rounded-[18px] bg-paper/70"
          accessibilityLabel="Loading recipe details"
        >
          <ActivityIndicator color={THEME.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

export const RecipesUnifiedFeedCard = memo(RecipesUnifiedFeedCardInner);
