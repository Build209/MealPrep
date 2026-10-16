import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { DataError, OFFLINE_MESSAGE, useIsOnline, usePantryItems } from '../data';
import { useGroceryItems } from '../data/grocery';
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
import { Screen } from '../ui/Screen';
import { addMissingMessage, DETAIL_COPY, ingredientRowText } from './recipeLogic';
import { SaveButton } from './saved/SaveButton';
import { StatusSticker } from './StatusSticker';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function IngredientRow({ line }: { line: CartStatusLine }) {
  const text = ingredientRowText(line);
  const have = line.status !== 'missing';
  const inCart = line.status === 'cart';
  return (
    <View
      accessible
      accessibilityLabel={`${text.name}${text.amount ? `, ${text.amount}` : ''}, ${text.status}`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 }}
    >
      <View
        style={{
          width: 12,
          height: 12,
          marginTop: 6,
          borderRadius: radius.pill,
          backgroundColor: have && !inCart ? colors.success : colors.card,
          borderWidth: 2,
          borderColor: have ? colors.success : colors.ink,
          borderStyle: inCart ? 'dashed' : 'solid',
        }}
      />
      <View style={{ flex: 1 }}>
        <AppText>
          {text.name}
          {text.amount ? <AppText color="muted">{` · ${text.amount}`}</AppText> : null}
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
    const { creatorName, creatorUrl, originalUrl } = recipe.credit;
    return (
      <View style={{ gap: 2 }}>
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
        {originalUrl ? (
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
  const addMissing = useAddMissingToGrocery();
  const [notice, setNotice] = useState<string | null>(null);

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
  const neededCount = cartMatch?.neededCount ?? 0;
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

  return (
    <Screen title={r.name}>
      {backButton}
      {r.imageUrl ? (
        <Image
          source={{ uri: r.imageUrl }}
          accessibilityLabel={`Photo of ${r.name}`}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.card, backgroundColor: colors.sand }}
        />
      ) : null}

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
              disabled={addMissing.isPending || !online || lines.length === 0}
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
          cartMatch.lines.map((line, index) => <IngredientRow key={`${index}-${line.ingredient.ingredientId}`} line={line} />)
        ) : (
          <ActivityIndicator color={colors.ink} />
        )}
        {inCartCount > 0 ? (
          <AppText variant="label" color="muted">
            {DETAIL_COPY.cartHint}
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
