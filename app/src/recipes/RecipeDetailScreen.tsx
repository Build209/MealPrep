import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { DataError, OFFLINE_MESSAGE, useIsOnline, usePantryItems } from '../data';
import { useGroceryItems } from '../data/grocery';
import { useAddMissingToGrocery } from '../data/recipeMutations';
import { missingAlreadyOnList } from '../data/recipeRows';
import { servingsAndTime, useRecipe, type AppRecipe } from '../data/recipes';
import { groceryLinesForMissing, matchRecipe, recipeStatus } from '../kitchen/recipeFeed';
import type { IngredientStatusLine } from '../kitchen/recipeMatch';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { addMissingMessage, DETAIL_COPY, ingredientRowText } from './recipeLogic';
import { StatusSticker } from './StatusSticker';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function IngredientRow({ line }: { line: IngredientStatusLine }) {
  const text = ingredientRowText(line);
  const have = line.status !== 'missing';
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
          backgroundColor: have ? colors.success : colors.card,
          borderWidth: 2,
          borderColor: have ? colors.success : colors.ink,
        }}
      />
      <View style={{ flex: 1 }}>
        <AppText>
          {text.name}
          {text.amount ? <AppText color="muted">{` · ${text.amount}`}</AppText> : null}
        </AppText>
        <AppText variant="secondary" color={line.status === 'missing' ? 'ink' : 'muted'} bold={line.status === 'missing'}>
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

  const match = useMemo(() => (recipe.data && pantry.data ? matchRecipe(recipe.data, pantry.data) : null), [recipe.data, pantry.data]);
  const lines = useMemo(() => (match && pantry.data ? groceryLinesForMissing(match, pantry.data) : []), [match, pantry.data]);
  const onList = recipe.data && grocery.data ? missingAlreadyOnList(recipe.data.id, lines, grocery.data) : false;

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
          <AppText>{notFound ? recipe.error?.message : DETAIL_COPY.loadError}</AppText>
          {!notFound && recipe.error ? (
            <AppText variant="secondary" color="muted">
              {recipe.error.message}
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
  const missingCount = match?.missingCount ?? 0;

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

      <View style={{ gap: 6 }}>
        <AppText color="muted">{servingsAndTime(r)}</AppText>
        {match ? <StatusSticker status={recipeStatus(match)} /> : null}
        <Credit recipe={r} />
      </View>

      {match ? (
        <View style={{ gap: 8 }}>
          {missingCount > 0 ? (
            onList ? (
              <>
                <AppText bold>{DETAIL_COPY.onList}</AppText>
                <Button label={DETAIL_COPY.seeList} kind="secondary" onPress={() => router.push('/grocery')} />
              </>
            ) : (
              <Button
                label={addMissing.isPending ? DETAIL_COPY.adding : DETAIL_COPY.addMissing(missingCount)}
                main
                disabled={addMissing.isPending || !online || lines.length === 0}
                onPress={onAddMissing}
              />
            )
          ) : (
            <AppText bold>{DETAIL_COPY.allHave}</AppText>
          )}
          {!online && missingCount > 0 && !onList ? (
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
          {pantry.error.message}
        </AppText>
      ) : null}

      <Card>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {DETAIL_COPY.ingredients}
        </AppText>
        {r.ingredients.length === 0 ? (
          <AppText color="muted">{DETAIL_COPY.noIngredients}</AppText>
        ) : match ? (
          match.lines.map((line, index) => <IngredientRow key={`${index}-${line.ingredient.ingredientId}`} line={line} />)
        ) : (
          <ActivityIndicator color={colors.ink} />
        )}
        <AppText variant="label" color="muted">
          {DETAIL_COPY.checkLabels}
        </AppText>
      </Card>

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
