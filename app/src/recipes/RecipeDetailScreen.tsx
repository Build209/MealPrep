import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';
import { containsLine } from '../allergens/copy';
import { recipeAllergenStatus } from '../allergens/detect';
import { useAllergenPrefs } from '../allergens/useAllergenPrefs';
import { useAuth } from '../auth/AuthProvider';
import { DataError, OFFLINE_MESSAGE, useIsOnline, usePantryItems } from '../data';
import { useGroceryItems } from '../data/grocery';
import { newPantryItemVars, useAddPantryItem } from '../data/pantryMutations';
import { useAddMissingToGrocery } from '../data/recipeMutations';
import { servingsAndTime, useRecipe, type AppRecipe } from '../data/recipes';
import { saveableFromAppRecipe, saveTargetForRecipe } from '../data/savedRecipes';
import { groceryLinesForMissing, recipeStatus } from '../kitchen/recipeFeed';
import { scoreRecipeWithCart, type CartStatusLine } from '../kitchen/recipeCart';
import { RecipeNutritionSection } from '../nutrition-ui/RecipeNutritionSection';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { RecipePhoto } from '../ui/RecipePhoto';
import { Screen } from '../ui/Screen';
import {
  allSelected,
  cartBatch,
  cartBatchMessage,
  pantryBatch,
  pantryBatchMessage,
  pruneSelection,
  selectableIndexes,
  tickedIndexes,
  toggleSelectAll,
  toggleSelection,
  withoutIndexes,
  type Selection,
} from './ingredientSelect';
import { stapleHeldInPantry } from './pantryAdd';
import { addMissingMessage, DETAIL_COPY, ingredientRowText } from './recipeLogic';
import { SaveButton } from './saved/SaveButton';
import { StatusSticker } from './StatusSticker';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type RowCheck = { testId: string; checked: boolean; disabled: boolean; label: string; onToggle: () => void };

function IngredientRow({ line, heldStaple = false, check }: { line: CartStatusLine; heldStaple?: boolean; check?: RowCheck }) {
  const text = ingredientRowText(line, heldStaple);
  const have = line.status !== 'missing';
  const inCart = line.status === 'cart';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}>
      {check ? (
        <Pressable
          testID={check.testId}
          accessibilityRole="checkbox"
          accessibilityLabel={check.label}
          accessibilityState={{ checked: check.checked, disabled: check.disabled }}
          aria-checked={check.checked}
          disabled={check.disabled}
          onPress={check.onToggle}
          style={{ width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center', opacity: check.disabled ? 0.5 : 1 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: colors.ink,
              backgroundColor: check.checked ? colors.ink : colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {check.checked ? (
              <AppText variant="secondary" bold color="onPrimary">
                {'\u2713'}
              </AppText>
            ) : null}
          </View>
        </Pressable>
      ) : (
        // In pantry (or nothing to tick): a quiet status dot, no box to press.
        <View style={{ width: touch.min, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: radius.pill,
              backgroundColor: have && !inCart ? colors.success : colors.card,
              borderWidth: 2,
              borderColor: have ? colors.success : colors.ink,
              borderStyle: inCart ? 'dashed' : 'solid',
            }}
          />
        </View>
      )}
      <View
        accessible
        accessibilityLabel={`${text.name}${text.amount ? `, ${text.amount}` : ''}, ${text.status}`}
        style={{ flex: 1, paddingVertical: 4 }}
      >
        <AppText>
          {text.name}
          {text.amount ? <AppText color="muted">{` \u00b7 ${text.amount}`}</AppText> : null}
        </AppText>
        <AppText variant="secondary" color={line.status === 'missing' || inCart ? 'ink' : 'muted'} bold={line.status === 'missing' || inCart}>
          {text.status}
        </AppText>
      </View>
    </View>
  );
}

function Credit({ recipe }: { recipe: AppRecipe }) {
  if (recipe.credit) {
    const { creatorName, creatorUrl, originalUrl, sourceLine } = recipe.credit;
    return (
      <View style={{ gap: 2 }}>
        {sourceLine ? (
          originalUrl ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(originalUrl)} style={{ minHeight: touch.min, justifyContent: 'center' }}>
              <AppText variant="secondary" style={{ textDecorationLine: 'underline' }}>
                {sourceLine}
              </AppText>
            </Pressable>
          ) : (
            <AppText variant="secondary" color="muted">
              {sourceLine}
            </AppText>
          )
        ) : null}
        {creatorName ? (
          creatorUrl ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(creatorUrl)} style={{ minHeight: touch.min, justifyContent: 'center' }}>
              <AppText variant="secondary" style={{ textDecorationLine: 'underline' }}>
                {DETAIL_COPY.by(creatorName)}
              </AppText>
            </Pressable>
          ) : (
            <AppText variant="secondary" color="muted">
              {DETAIL_COPY.by(creatorName)}
            </AppText>
          )
        ) : null}
        {originalUrl && !sourceLine ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(originalUrl)} style={{ minHeight: touch.min, justifyContent: 'center' }}>
            <AppText variant="secondary" style={{ textDecorationLine: 'underline' }}>
              {DETAIL_COPY.viewOriginal}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return recipe.isMealPlanatic ? (
    <AppText variant="secondary" color="muted">
      {DETAIL_COPY.mealPlanaticRecipe}
    </AppText>
  ) : null;
}

/** /recipe/[id]: photo, title, time, servings, ingredients marked have/missing, steps, and add missing to grocery. */
export function RecipeDetailScreen({ id }: { id: string }) {
  const { ready, session } = useAuth();
  const router = useRouter();
  const recipe = useRecipe(id);
  const pantry = usePantryItems();
  const grocery = useGroceryItems();
  const online = useIsOnline();
  const prefs = useAllergenPrefs();
  const addMissing = useAddMissingToGrocery();
  const addToPantry = useAddPantryItem();
  const [notice, setNotice] = useState<string | null>(null);
  const [pantryNotice, setPantryNotice] = useState<string | null>(null);
  // Ticked ingredient rows (by line position), and which batch is saving right now, so a second tap does nothing.
  const [selection, setSelection] = useState<Selection>(new Set());
  const [batch, setBatch] = useState<'pantry' | 'cart' | null>(null);

  // Pantry first, then the open grocery rows ("cart") cover the rest. The grocery list is waited for,
  // so a row never flashes "Missing" before the cart is known.
  // If the grocery list can't load, the recipe still shows against the pantry alone.
  const cartRows = grocery.data ?? (grocery.isError ? [] : null);
  const cartMatch = useMemo(
    () => (recipe.data && pantry.data && cartRows ? scoreRecipeWithCart(recipe.data, pantry.data, cartRows) : null),
    [recipe.data, pantry.data, cartRows],
  );
  // The sticker stays pantry-only: you cannot cook with what is still in the cart.
  const match = cartMatch?.pantry ?? null;
  const lines = useMemo(
    () => (cartMatch && pantry.data ? groceryLinesForMissing({ missing: cartMatch.stillMissing }, pantry.data) : []),
    [cartMatch, pantry.data],
  );
  // Rows that get a checkbox, and the ticks that are still valid for them.
  const selectable = useMemo(
    () => (cartMatch && pantry.data ? selectableIndexes(cartMatch.lines, cartMatch.pantry.lines, pantry.data) : []),
    [cartMatch, pantry.data],
  );
  const activeSelection = useMemo(() => pruneSelection(selection, selectable), [selection, selectable]);
  // The heart: same saved row as the search heart (user_saved_recipes, old app's keys).
  const saveTarget = useMemo(() => {
    const saveable = recipe.data ? saveableFromAppRecipe(recipe.data) : null;
    return saveable ? saveTargetForRecipe(saveable) : null;
  }, [recipe.data]);

  if (ready && !session) return <Redirect href="/sign-in" />;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const backButton = <Button label={DETAIL_COPY.back} kind="quiet" onPress={back} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />;

  if (!recipe.data) {
    if (recipe.isPending) {
      return (
        <Screen title="Recipe">
          {backButton}
          <ActivityIndicator color={colors.ink} accessibilityLabel={DETAIL_COPY.loading} />
        </Screen>
      );
    }
    const notFound = recipe.error instanceof DataError && recipe.error.kind === 'not-found';
    return (
      <Screen title={notFound ? DETAIL_COPY.notFoundTitle : 'Recipe'}>
        {backButton}
        <Card>
          <AppText>{notFound ? messageOf(recipe.error) : DETAIL_COPY.loadError}</AppText>
          {!notFound && recipe.error ? (
            <AppText variant="secondary" color="muted">
              {messageOf(recipe.error)}
            </AppText>
          ) : null}
          {notFound ? (
            <Button label={DETAIL_COPY.goHome} kind="secondary" onPress={() => router.replace('/')} />
          ) : (
            <Button label="Try again" kind="secondary" onPress={() => void recipe.refetch()} />
          )}
        </Card>
      </Screen>
    );
  }

  const r = recipe.data;
  const contains = r ? containsLine(recipeAllergenStatus(r, prefs.allergens)) : '';
  const neededCount = cartMatch?.neededCount ?? 0;
  const pantryRows = pantry.data ?? [];
  const inCartCount = cartMatch?.inCartCount ?? 0;

  function onAddMissing() {
    if (!r) return;
    setNotice(null);
    addMissing.mutate(
      { recipeId: r.id, lines },
      {
        onSuccess: (result) => setNotice(addMissingMessage(result)),
        onError: (error) => setNotice(DETAIL_COPY.addFailed(messageOf(error))),
      },
    );
  }

  const tickedCount = activeSelection.size;
  const busy = batch !== null;

  async function onAddTickedToPantry() {
    if (busy || tickedCount === 0) return;
    setPantryNotice(null);
    if (!online) {
      setPantryNotice(OFFLINE_MESSAGE);
      return;
    }
    const items = pantryBatch(tickedIndexes(activeSelection), cartMatch?.lines ?? [], pantryRows);
    setBatch('pantry');
    const done: number[] = [];
    const failed: { name: string; message: string }[] = [];
    // One at a time through the pantry's own add; a failure does not stop the rest.
    for (const item of items) {
      try {
        await addToPantry.mutateAsync(newPantryItemVars({ ...item.add.fields, ingredientId: item.add.ingredientId }));
        done.push(item.index);
      } catch (error) {
        failed.push({ name: item.name, message: messageOf(error) });
      }
    }
    setSelection((prev) => withoutIndexes(prev, done));
    setPantryNotice(pantryBatchMessage(done.length, failed));
    setBatch(null);
  }

  async function onAddTickedToCart() {
    if (busy || tickedCount === 0 || !r) return;
    setPantryNotice(null);
    if (!online) {
      setPantryNotice(OFFLINE_MESSAGE);
      return;
    }
    const { lines: cartLines, alreadyInCart } = cartBatch(tickedIndexes(activeSelection), cartMatch?.lines ?? [], pantryRows);
    setBatch('cart');
    try {
      const result = cartLines.length > 0 ? await addMissing.mutateAsync({ recipeId: r.id, lines: cartLines }) : null;
      setSelection(new Set());
      setPantryNotice(cartBatchMessage(result, alreadyInCart));
    } catch (error) {
      setPantryNotice(DETAIL_COPY.addTickedFailed(messageOf(error)));
    } finally {
      setBatch(null);
    }
  }

  return (
    <Screen title={r.name}>
      {backButton}
      {r.imageUrl ? (
        <Image
          source={{ uri: r.imageUrl }}
          accessibilityLabel={`Photo of ${r.name}`}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.card, backgroundColor: colors.sand }}
        />
      ) : (
        <RecipePhoto uri={null} tags={r.tags} title={r.name} width="100%" aspectRatio={16 / 9} iconSize={72} borderRadius={radius.card} />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.gap }}>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText color="muted">{servingsAndTime(r)}</AppText>
          {match ? <StatusSticker status={recipeStatus(match)} /> : null}
          <Credit recipe={r} />
        </View>
        {saveTarget ? <SaveButton target={saveTarget} /> : null}
      </View>

      {cartMatch && match ? (
        <View style={{ gap: 8 }}>
          <AppText bold>{DETAIL_COPY.itemsNeeded(neededCount)}</AppText>
          <AppText variant="secondary" color="muted">
            {DETAIL_COPY.breakdown(cartMatch.inPantryCount, inCartCount)}
          </AppText>
          {neededCount > 0 ? (
            <Button
              label={addMissing.isPending ? DETAIL_COPY.adding : DETAIL_COPY.addMissing(neededCount)}
              main
              disabled={addMissing.isPending || busy || !online || lines.length === 0}
              onPress={onAddMissing}
            />
          ) : inCartCount > 0 ? (
            <>
              <AppText bold>{DETAIL_COPY.onList}</AppText>
              <Button label={DETAIL_COPY.seeList} kind="secondary" onPress={() => router.push('/grocery')} />
            </>
          ) : (
            <AppText bold>{DETAIL_COPY.allHave}</AppText>
          )}
          {!online && neededCount > 0 ? (
            <AppText variant="secondary" color="muted">
              {OFFLINE_MESSAGE}
            </AppText>
          ) : null}
          {notice ? (
            <AppText variant="secondary" accessibilityRole="alert">
              {notice}
            </AppText>
          ) : null}
        </View>
      ) : pantry.error ? (
        <AppText variant="secondary" color="muted">
          {messageOf(pantry.error)}
        </AppText>
      ) : null}

      <Card>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {DETAIL_COPY.ingredients}
        </AppText>
        {r.ingredients.length === 0 ? (
          <AppText color="muted">{DETAIL_COPY.noIngredients}</AppText>
        ) : cartMatch ? (
          <>
            {selectable.length > 0 ? (
              <Button
                label={allSelected(activeSelection, selectable) ? DETAIL_COPY.clearSelection : DETAIL_COPY.selectAll}
                kind="secondary"
                testID="recipe-ingredient-select-all"
                disabled={busy}
                onPress={() => setSelection(toggleSelectAll(activeSelection, selectable))}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
            {cartMatch.lines.map((line, index) => {
              const tickable = selectable.includes(index);
              return (
                <IngredientRow
                  key={`${index}-${line.ingredient.ingredientId}`}
                  line={line}
                  heldStaple={stapleHeldInPantry(line, pantryRows)}
                  check={
                    tickable
                      ? {
                          testId: `recipe-ingredient-check-${line.ingredient.ingredientId || index}`,
                          checked: activeSelection.has(index),
                          disabled: busy,
                          label: DETAIL_COPY.selectLabel(ingredientRowText(line).name),
                          onToggle: () => setSelection(toggleSelection(activeSelection, index)),
                        }
                      : undefined
                  }
                />
              );
            })}
            {tickedCount > 0 ? (
              <View style={{ gap: 8 }} testID="recipe-ingredient-actions">
                <AppText variant="secondary" bold>
                  {DETAIL_COPY.tickedCount(tickedCount)}
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Button
                    label={batch === 'pantry' ? DETAIL_COPY.addingTicked : DETAIL_COPY.addTickedToPantry(tickedCount)}
                    kind="primary"
                    testID="recipe-ingredient-add-pantry"
                    disabled={busy || !online}
                    onPress={() => void onAddTickedToPantry()}
                  />
                  <Button
                    label={batch === 'cart' ? DETAIL_COPY.addingTicked : DETAIL_COPY.addTickedToCart(tickedCount)}
                    kind="secondary"
                    testID="recipe-ingredient-add-cart"
                    disabled={busy || !online}
                    onPress={() => void onAddTickedToCart()}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={colors.ink} />
        )}
        {pantryNotice ? (
          <AppText variant="secondary" accessibilityRole="alert">
            {pantryNotice}
          </AppText>
        ) : null}
        {!online && selectable.length > 0 ? (
          <AppText variant="secondary" color="muted">
            {OFFLINE_MESSAGE}
          </AppText>
        ) : null}
        {inCartCount > 0 ? (
          <AppText variant="label" color="muted">
            {DETAIL_COPY.cartHint}
          </AppText>
        ) : null}
        {contains ? (
          <AppText variant="secondary" color="danger" bold testID="allergen-contains">
            {contains}
          </AppText>
        ) : null}
        <AppText variant="label" color="muted">
          {DETAIL_COPY.checkLabels}
        </AppText>
      </Card>

      <RecipeNutritionSection recipe={r} />

      <Card>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {DETAIL_COPY.steps}
        </AppText>
        {r.steps.length === 0 ? (
          <AppText color="muted">{DETAIL_COPY.noSteps}</AppText>
        ) : (
          r.steps.map((step, index) => (
            <View key={`${index}-${step.slice(0, 16)}`} style={{ flexDirection: 'row', gap: 10 }}>
              <AppText bold style={{ width: 24 }}>{`${index + 1}.`}</AppText>
              <AppText style={{ flex: 1 }}>{step}</AppText>
            </View>
          ))
        )}
      </Card>
      <View style={{ height: space.groupGap }} />
    </Screen>
  );
}
