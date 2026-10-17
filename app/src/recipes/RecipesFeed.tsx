import { hideThinLibraryRecipe } from '../kitchen/recipeFeed';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useScoredRecipes } from '../kitchen/useScoredRecipes';
import { ActivityIndicator, View } from 'react-native';
import { usePantryItems } from '../data';
import { useRecipes } from '../data/recipes';
import { ALLERGEN_COPY } from '../allergens/copy';
import { rankFeedWithAllergens } from '../allergens/rank';
import { useAllergenPrefs } from '../allergens/useAllergenPrefs';
import { colors, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FEED_COPY } from './recipeLogic';
import { RecipeCard } from './RecipeCard';

function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="sectionTitle" bold accessibilityRole="header">
      {children}
    </AppText>
  );
}

/**
 * "Cook from your pantry": every recipe the person can read (master, their own, the published
 * library), ranked against the pantry on the server. Both lists come from queries; nothing is copied.
 */
export function RecipesFeed() {
  const router = useRouter();
  const recipes = useRecipes();
  const pantry = usePantryItems();
  const prefs = useAllergenPrefs();
  const userAllergens = prefs.allergens;

  const scored = useScoredRecipes(recipes.data, pantry.data);
  const feed = useMemo(
    () =>
      recipes.data && pantry.data && scored
        ? rankFeedWithAllergens(recipes.data, pantry.data, userAllergens, { hideFromMore: hideThinLibraryRecipe, scoredById: scored })
        : null,
    [recipes.data, pantry.data, userAllergens, scored],
  );
  const scoring = Boolean(recipes.data && pantry.data && !scored);

  if (recipes.isPending || pantry.isPending || prefs.isLoading || scoring) {
    return (
      <View style={{ paddingVertical: space.groupGap, alignItems: 'center' }}>
        <ActivityIndicator color={colors.ink} accessibilityLabel={FEED_COPY.loading} />
      </View>
    );
  }

  const error = recipes.error ?? pantry.error;
  if (!feed) {
    return (
      <Card>
        <AppText bold>{FEED_COPY.loadError}</AppText>
        {error ? (
          <AppText variant="secondary" color="muted">
            {error instanceof Error ? error.message : String(error)}
          </AppText>
        ) : null}
        <Button
          label={FEED_COPY.retry}
          kind="secondary"
          onPress={() => {
            void recipes.refetch();
            void pantry.refetch();
          }}
        />
      </Card>
    );
  }

  const pantryEmpty = (pantry.data?.length ?? 0) === 0;

  return (
    <View style={{ gap: space.groupGap }}>
      <View style={{ gap: space.gap }}>
        <SectionTitle>{FEED_COPY.cookTitle}</SectionTitle>
        {pantryEmpty ? (
          <Card>
            <AppText bold>{FEED_COPY.emptyPantryTitle}</AppText>
            <AppText color="muted">{FEED_COPY.emptyPantryBody}</AppText>
            <Button label={FEED_COPY.goToPantry} kind="secondary" onPress={() => router.push('/pantry')} />
          </Card>
        ) : feed.cookable.length === 0 ? (
          <AppText color="muted">{FEED_COPY.noMatches}</AppText>
        ) : (
          <>
            <AppText variant="secondary" color="muted">
              {feed.usedPartialFallback ? FEED_COPY.partialIntro : FEED_COPY.cookIntro}
            </AppText>
            {feed.cookable.map(({ recipe, match }) => (
              <RecipeCard key={recipe.id} recipe={recipe} match={match} />
            ))}
            {feed.cookableHidden > 0 ? (
              <AppText variant="secondary" color="muted">
                {FEED_COPY.moreHidden(feed.cookableHidden)}
              </AppText>
            ) : null}
          </>
        )}
      </View>

      {feed.more.length > 0 ? (
        <View style={{ gap: space.gap }}>
          <SectionTitle>{FEED_COPY.moreTitle}</SectionTitle>
          {feed.more.map(({ recipe, match }) => (
            <RecipeCard key={recipe.id} recipe={recipe} match={match} />
          ))}
          {feed.moreHidden > 0 ? (
            <AppText variant="secondary" color="muted">
              {FEED_COPY.moreHidden(feed.moreHidden)}
            </AppText>
          ) : null}
        </View>
      ) : feed.cookable.length === 0 && feed.flagged.length === 0 ? (
        <AppText color="muted">{FEED_COPY.noRecipes}</AppText>
      ) : null}

      {feed.flagged.length > 0 ? (
        <View style={{ gap: space.gap }}>
          <SectionTitle>{ALLERGEN_COPY.flaggedTitle}</SectionTitle>
          <AppText variant="secondary" color="muted">
            {ALLERGEN_COPY.flaggedIntro}
          </AppText>
          {feed.flagged.map(({ recipe, match, allergens }) => (
            <RecipeCard key={recipe.id} recipe={recipe} match={match} allergens={allergens} />
          ))}
          {feed.flaggedHidden > 0 ? (
            <AppText variant="secondary" color="muted">
              {ALLERGEN_COPY.flaggedHidden(feed.flaggedHidden)}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
