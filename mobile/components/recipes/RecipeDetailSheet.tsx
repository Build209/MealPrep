import { Ionicons } from '../../lib/icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CookThisButton } from '../mealCalendar/CookThisButton';
import { THEME } from '../../config/appConfig';
import { RECIPES_COPY } from '../../config/recipesCopy';
import { RECIPE_IMPORT_COPY } from '../../config/recipeImport';
import { RecipeSourceCreditLine } from './RecipeSourceCreditLine';
import { RecipeThumbnail } from './RecipeThumbnail';
import { RECIPE_IMAGE } from '../../config/recipeImages';
import { sourceCreditFromRecipe } from '../../lib/recipeImport/sourceCredit';
import type { RecipesTabRow } from '../../config/recipesTabFilters';
import { discoveryRecipeServingOverrideId } from '../../config/recipesTabFilters';
import {
  resolveDiscoveryRecipeImageUrl,
  resolveKitchenRecipeImageUrl,
} from '../../lib/recipes/recipeImageUrl';
import {
  scheduleTargetFromDiscoveryRecipe,
  scheduleTargetFromKitchenRecipe,
} from '../../lib/mealCalendar/scheduleTarget';
import type { RecipePantryMatch } from '../../lib/recipeMatch';
import { LIBRARY_RECIPES } from '../../config/libraryRecipes';
import { isLibraryRecipeAppId } from '../../lib/libraryRecipes/slug';
import { isMealDbRecipeId } from '../../lib/mealdb/normalize';
import { MealDbRecipeCreditLine } from './MealDbRecipeCreditLine';
import { formatIngredientText, formatQuantityWithUnit } from '../../lib/formatQuantity';
import type { Recipe } from '../../types/mealprep';
import type { RecipeDiscoveryListItem } from '../../lib/recipeDiscovery/types';
import { RecipeSaveButton } from './RecipeSaveButton';
import { RecipeSaveCta } from './RecipeSaveCta';
import type { ViralRecipeLinkItem } from '../../lib/viralRecipes/types';
import { RecipeDietNotice } from '../diet/RecipeDietNotice';
import { ingredientLinesFromRecipe } from '../../lib/diet/ingredientLines';
import { isVideoRecipeDetailContext, VideoRecipeDetailView } from './VideoRecipeDetailView';
import { RecipeCostPerServingForRecipe } from './RecipeCostPerServingForRecipe';
import { UndoToastModalHost } from '../UndoToastHosts';

export interface RecipeDetailSheetProps {
  visible: boolean;
  row: RecipesTabRow | null;
  match: RecipePantryMatch | null | undefined;
  onClose: () => void;
  onAddMissingKitchen: (recipeId: string, matchOverride?: RecipePantryMatch) => void;
  onAddMissingDiscovery: (recipe: RecipeDiscoveryListItem) => void;
  isOnMealPlan: (options: { recipeSlug?: string; recipeApiId?: number }) => boolean;
  onToggleKitchen: (recipeId: string) => void;
  onToggleDiscovery: (recipe: RecipeDiscoveryListItem) => void;
  importing?: boolean;
  importError?: string | null;
  onRetryImport?: () => void;
  onStartImport?: () => void;
  onSignInForImport?: () => void;
  recipeSaved?: boolean;
  onToggleSaveRecipe?: () => void;
  saveDisabled?: boolean;
  onClearRecipeSource?: (recipeId: string) => void;
  viralItem?: ViralRecipeLinkItem | null;
  creatorAvatarUrl?: string | null;
  wontCookAgain?: boolean;
  onToggleWontCook?: () => void;
  cookTarget?: import('../../lib/mealCalendar/scheduleTarget').ScheduleRecipeTarget | null;
  initialDetailSection?: 'ingredients' | 'steps';
}

type DetailSection = 'ingredients' | 'steps';

function kitchenRecipeFromRow(row: Extract<RecipesTabRow, { kind: 'kitchen' }>): Recipe {
  return row.recipe;
}

function stubKitchenFromDiscovery(row: Extract<RecipesTabRow, { kind: 'discovery' }>): Recipe {
  const item = row.recipe;
  return {
    id: discoveryRecipeServingOverrideId(item.id),
    name: item.name,
    tag: item.cuisine,
    description: item.description,
    servings: item.servings,
    minutes: (item.prep_time ?? 0) + (item.cook_time ?? 0),
    calories: item.calories_per_serving,
    protein: item.protein,
    carbs: item.carbs ?? 0,
    fat: item.fat ?? 0,
    ingredients: item.ingredients.map((ing) => ({
      ingredientId: `recipeapi-ing-${ing.id}`,
      name: ing.optional ? `${ing.name} (optional)` : ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
    })),
    steps: item.instructions ?? [],
    isMaster: false,
    createdAt: '',
    imageUrl: resolveDiscoveryRecipeImageUrl(item),
  };
}

function SectionToggle({
  section,
  onSection,
}: {
  section: DetailSection;
  onSection: (next: DetailSection) => void;
}) {
  const tabs: { id: DetailSection; label: string }[] = [
    { id: 'ingredients', label: RECIPES_COPY.recipeDetail.ingredientsTab },
    { id: 'steps', label: RECIPES_COPY.recipeDetail.stepsTab },
  ];
  return (
    <View className="mt-4 flex-row rounded-lg border border-border bg-paper p-0.5">
      {tabs.map((tab) => {
        const selected = section === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSection(tab.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`flex-1 items-center rounded-md py-2 ${selected ? 'bg-card' : ''}`}
          >
            <Text className={`text-sm font-semibold ${selected ? 'text-ink' : 'text-muted'}`}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ClassicRecipeDetailBody({
  row,
  match,
  kitchenRecipe,
  heroUri,
  onClose,
  onAddMissingKitchen,
  onAddMissingDiscovery,
  isOnMealPlan,
  onToggleKitchen,
  onToggleDiscovery,
  importing,
  importError,
  onRetryImport,
  onSignInForImport,
  recipeSaved,
  onToggleSaveRecipe,
  saveDisabled = false,
  onClearRecipeSource,
  wontCookAgain = false,
  onToggleWontCook,
  cookTarget = null,
  initialDetailSection,
}: {
  row: RecipesTabRow;
  match: RecipePantryMatch | null | undefined;
  kitchenRecipe: Recipe;
  heroUri: string | null;
  onClose: () => void;
  onAddMissingKitchen: (recipeId: string, matchOverride?: RecipePantryMatch) => void;
  onAddMissingDiscovery: (recipe: RecipeDiscoveryListItem) => void;
  isOnMealPlan: (options: { recipeSlug?: string; recipeApiId?: number }) => boolean;
  onToggleKitchen: (recipeId: string) => void;
  onToggleDiscovery: (recipe: RecipeDiscoveryListItem) => void;
  importing: boolean;
  importError: string | null;
  onRetryImport?: () => void;
  onStartImport?: () => void;
  onSignInForImport?: () => void;
  recipeSaved?: boolean;
  onToggleSaveRecipe?: () => void;
  saveDisabled?: boolean;
  onClearRecipeSource?: (recipeId: string) => void;
  wontCookAgain?: boolean;
  onToggleWontCook?: () => void;
  cookTarget?: import('../../lib/mealCalendar/scheduleTarget').ScheduleRecipeTarget | null;
  initialDetailSection?: DetailSection;
}) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<DetailSection>(initialDetailSection ?? 'ingredients');

  useEffect(() => {
    if (initialDetailSection) setSection(initialDetailSection);
  }, [initialDetailSection, row.kind === 'kitchen' ? row.recipe.id : row.recipe.id]);

  const sourceCredit = row.kind === 'kitchen' ? sourceCreditFromRecipe(row.recipe) : null;
  const minutes =
    row.kind === 'kitchen'
      ? row.recipe.minutes
      : (row.recipe.prep_time ?? 0) + (row.recipe.cook_time ?? 0);

  const scheduleTarget =
    cookTarget ??
    (row.kind === 'kitchen'
      ? scheduleTargetFromKitchenRecipe(row.recipe, match ?? null)
      : scheduleTargetFromDiscoveryRecipe(row.recipe, match ?? null));

  const isMealDbCatalog =
    row.kind === 'kitchen' && (isMealDbRecipeId(row.recipe.id) || row.recipe.sourceType === 'themealdb');

  const missingCount = match?.missingCount ?? 0;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-border bg-card px-3 py-2">
        <Pressable onPress={onClose} accessibilityLabel="Close recipe details" className="p-2">
          <Ionicons name="close" size={24} color={THEME.ink} />
        </Pressable>
        <Text className="flex-1 text-center text-sm font-semibold text-muted" numberOfLines={1}>
          Recipe
        </Text>
        {onToggleSaveRecipe ? (
          <RecipeSaveButton
            saved={Boolean(recipeSaved)}
            onToggle={onToggleSaveRecipe}
            size={20}
            disabled={saveDisabled}
          />
        ) : (
          <View className="w-10" />
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: onToggleSaveRecipe ? 120 + insets.bottom : 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <RecipeThumbnail
          uri={heroUri}
          accessibilityLabel={`Photo for ${kitchenRecipe.name}`}
          aspectRatio={RECIPE_IMAGE.aspectRatio}
          className="rounded-none"
        />

        <View className="px-4 pt-3">
          <Text className="text-xl font-bold text-ink">{kitchenRecipe.name}</Text>

          {row.kind === 'kitchen' && isLibraryRecipeAppId(row.recipe.id) ? (
            <Text className="mt-1 text-xs text-muted">{LIBRARY_RECIPES.detailTag}</Text>
          ) : null}

          {row.kind === 'kitchen' && isMealDbCatalog ? (
            <MealDbRecipeCreditLine recipe={row.recipe} className="mt-1" />
          ) : null}

          {row.kind === 'kitchen' &&
          !isMealDbCatalog &&
          (sourceCredit?.creatorName || sourceCredit?.originalUrl) ? (
            <>
              <RecipeSourceCreditLine
                creatorName={sourceCredit.creatorName}
                creatorUrl={sourceCredit.creatorUrl}
                originalUrl={sourceCredit.originalUrl}
                plainCreatorCredit={sourceCredit.plainCreatorCredit}
                viewOriginalLabel={sourceCredit.viewOriginalLabel}
                viewOriginalAccessibility={sourceCredit.viewOriginalAccessibility}
                className="mt-1"
              />
              {row.recipe.sourceType === 'reddit' && onClearRecipeSource ? (
                <Pressable
                  onPress={() => onClearRecipeSource(row.recipe.id)}
                  className="mt-1 self-start"
                  accessibilityRole="button"
                  accessibilityLabel={RECIPE_IMPORT_COPY.removeSourceAccessibility}
                >
                  <Text className="text-xs font-semibold text-muted">
                    {RECIPE_IMPORT_COPY.removeSourceCta}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          <Text className="mt-1 text-xs text-muted">
            {RECIPES_COPY.recipeDetail.servingsAndTime(kitchenRecipe.servings, minutes)}
          </Text>

          <RecipeCostPerServingForRecipe recipe={kitchenRecipe} />

          <RecipeDietNotice ingredientLines={ingredientLinesFromRecipe(kitchenRecipe)} />

          <View className="mt-3 gap-2">
            <CookThisButton target={scheduleTarget} className="w-full" />
            <View className="flex-row flex-wrap items-center gap-2">
            {onToggleWontCook ? (
              <Pressable
                onPress={onToggleWontCook}
                className={`rounded-full px-3 py-1.5 ${wontCookAgain ? 'bg-border' : 'border border-border bg-card'}`}
                accessibilityRole="button"
                accessibilityLabel={
                  wontCookAgain
                    ? RECIPES_COPY.recipeDetail.wontCookAgainUndo
                    : RECIPES_COPY.recipeDetail.wontCookAgain
                }
              >
                <Text className={`text-xs font-bold ${wontCookAgain ? 'text-muted' : 'text-ink'}`}>
                  {wontCookAgain
                    ? RECIPES_COPY.recipeDetail.wontCookAgainUndo
                    : RECIPES_COPY.recipeDetail.wontCookAgain}
                </Text>
              </Pressable>
            ) : null}
            </View>
            {!importing && missingCount > 0 ? (
              <Pressable
                onPress={() => {
                  if (row.kind === 'kitchen') onAddMissingKitchen(row.recipe.id, match ?? undefined);
                  else onAddMissingDiscovery(row.recipe);
                }}
                className="rounded-full border border-primary bg-primary-light px-3 py-1.5"
                accessibilityRole="button"
              >
                <Text className="text-xs font-bold text-primary-dark">
                  {RECIPES_COPY.recipeCard.addMissingCta}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {importError ? (
            <View className="mt-3">
              <Text className="text-sm text-muted">{importError}</Text>
              {onRetryImport ? (
                <Pressable onPress={onRetryImport} className="mt-2 self-start rounded-lg border border-border px-3 py-2">
                  <Text className="text-xs font-bold text-primary">Try again</Text>
                </Pressable>
              ) : null}
              {onSignInForImport ? (
                <Pressable
                  onPress={onSignInForImport}
                  className="mt-2 self-start rounded-lg bg-primary px-3 py-2"
                >
                  <Text className="text-xs font-bold text-on-primary">{RECIPE_IMPORT_COPY.guestSignInCta}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <SectionToggle section={section} onSection={setSection} />

          {section === 'ingredients' ? (
            <View className="mt-3">
              {kitchenRecipe.ingredients.length === 0 ? (
                <Text className="text-sm text-muted">No ingredients listed.</Text>
              ) : (
                kitchenRecipe.ingredients.map((ing) => {
                  const name = formatIngredientText(ing.name);
                  const line =
                    ing.quantity > 0
                      ? `· ${name} — ${formatQuantityWithUnit(ing.quantity, ing.unit)}`
                      : `· ${name}`;
                  return (
                    <Text key={ing.ingredientId} className="mt-2 text-sm leading-6 text-ink">
                      {line}
                    </Text>
                  );
                })
              )}
            </View>
          ) : (
            <View className="mt-3">
              {kitchenRecipe.steps.length === 0 ? (
                <Text className="text-sm text-muted">
                  {kitchenRecipe.sourceUrl ? RECIPE_IMPORT_COPY.noSteps : 'No steps listed.'}
                </Text>
              ) : (
                kitchenRecipe.steps.map((step, index) => (
                  <View key={`${index}-${step.slice(0, 24)}`} className="mt-3 flex-row">
                    <Text className="mr-2 w-6 text-sm font-bold text-primary">{index + 1}.</Text>
                    <Text className="flex-1 text-sm leading-6 text-ink">{step}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {onToggleSaveRecipe ? (
        <View
          className="absolute bottom-0 left-0 right-0 border-t border-border bg-card px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <RecipeSaveCta
            saved={Boolean(recipeSaved)}
            onToggle={onToggleSaveRecipe}
            disabled={saveDisabled}
          />
        </View>
      ) : null}
    </View>
  );
}

export function RecipeDetailSheet({
  visible,
  row,
  match,
  onClose,
  onAddMissingKitchen,
  onAddMissingDiscovery,
  isOnMealPlan,
  onToggleKitchen,
  onToggleDiscovery,
  importing = false,
  importError = null,
  onRetryImport,
  onStartImport,
  onSignInForImport,
  recipeSaved,
  onToggleSaveRecipe,
  saveDisabled = false,
  onClearRecipeSource,
  viralItem = null,
  creatorAvatarUrl = null,
  wontCookAgain = false,
  onToggleWontCook,
  cookTarget = null,
  initialDetailSection,
}: RecipeDetailSheetProps) {
  const kitchenRecipe = useMemo(() => {
    if (!row) return null;
    if (row.kind === 'kitchen') return kitchenRecipeFromRow(row);
    return stubKitchenFromDiscovery(row);
  }, [row]);

  if (!row || !kitchenRecipe) return null;

  const heroUri =
    row.kind === 'kitchen'
      ? resolveKitchenRecipeImageUrl(row.recipe)
      : resolveDiscoveryRecipeImageUrl(row.recipe);

  const useVideoLayout = isVideoRecipeDetailContext(kitchenRecipe, viralItem);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {useVideoLayout ? (
        <VideoRecipeDetailView
          recipe={kitchenRecipe}
          match={match}
          viralItem={viralItem}
          creatorAvatarUrl={creatorAvatarUrl}
          importing={importing}
          importError={importError}
          onClose={onClose}
          onRetryImport={onRetryImport}
          onStartImport={onStartImport}
          onSignInForImport={onSignInForImport}
          recipeSaved={recipeSaved}
          onToggleSaveRecipe={onToggleSaveRecipe}
          saveDisabled={saveDisabled}
          onAddMissing={() => {
            if (row.kind === 'kitchen') onAddMissingKitchen(row.recipe.id, match ?? undefined);
            else onAddMissingDiscovery(row.recipe);
          }}
          wontCookAgain={wontCookAgain}
          onToggleWontCook={onToggleWontCook}
        />
      ) : (
        <ClassicRecipeDetailBody
          row={row}
          match={match}
          kitchenRecipe={kitchenRecipe}
          heroUri={heroUri}
          onClose={onClose}
          onAddMissingKitchen={onAddMissingKitchen}
          onAddMissingDiscovery={onAddMissingDiscovery}
          isOnMealPlan={isOnMealPlan}
          onToggleKitchen={onToggleKitchen}
          onToggleDiscovery={onToggleDiscovery}
          importing={importing}
          importError={importError}
          onRetryImport={onRetryImport}
          onSignInForImport={onSignInForImport}
          recipeSaved={recipeSaved}
          onToggleSaveRecipe={onToggleSaveRecipe}
          saveDisabled={saveDisabled}
          onClearRecipeSource={onClearRecipeSource}
          wontCookAgain={wontCookAgain}
          onToggleWontCook={onToggleWontCook}
          cookTarget={cookTarget}
          initialDetailSection={initialDetailSection}
        />
      )}
      <UndoToastModalHost />
    </Modal>
  );
}
