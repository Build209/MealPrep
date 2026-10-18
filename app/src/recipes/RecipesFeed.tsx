import { hideThinLibraryRecipe, isComponentRecipe } from '../kitchen/recipeFeed';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useScoredRecipes } from '../kitchen/useScoredRecipes';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { usePantryItems } from '../data';
import { useRecipes, type AppRecipe } from '../data/recipes';
import { ALLERGEN_COPY } from '../allergens/copy';
import { rankFeedWithAllergens } from '../allergens/rank';
import { useAllergenPrefs } from '../allergens/useAllergenPrefs';
import { GEAR_COPY } from '../utensils/copy';
import { demoteLacking, gearStatus, sortByGear } from '../utensils/gear';
import { gearNote } from '../utensils/gearNote';
import { useGearCatalog, useGearSwaps, useOwnGear } from '../utensils/useGear';
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
  // Gear (soft sort): never blocks the feed. Skipped picker = owned null = nothing changes.
  const gear = useOwnGear();
  const gearCatalog = useGearCatalog();
  const gearSwaps = useGearSwaps();
  const owned = gear.owned;
  const swaps = useMemo(() => gearSwaps.data ?? [], [gearSwaps.data]);
  const [onlyMakeable, setOnlyMakeable] = useState(false);
  const gearReady = owned !== null && gearCatalog.data !== undefined;
  const nameOf = (slug: string) => gearCatalog.data?.find((g) => g.slug === slug)?.name ?? slug;

  const visibleRecipes = useMemo(
    () => (recipes.data && gearReady && onlyMakeable ? sortByGear(recipes.data, owned, swaps, { onlyMakeable: true }) : recipes.data),
    [recipes.data, gearReady, onlyMakeable, owned, swaps],
  );

  const scored = useScoredRecipes(recipes.data, pantry.data);
  const feed = useMemo(() => {
    if (!visibleRecipes || !pantry.data || !scored) return null;
    const ranked = rankFeedWithAllergens(visibleRecipes, pantry.data, userAllergens, { hideFromMore: hideThinLibraryRecipe, isComponent: isComponentRecipe, scoredById: scored });
    if (!gearReady) return ranked;
    return {
      ...ranked,
      cookable: demoteLacking(ranked.cookable, (e) => e.recipe, owned, swaps),
      more: demoteLacking(ranked.more, (e) => e.recipe, owned, swaps),
    };
  }, [visibleRecipes, pantry.data, userAllergens, scored, gearReady, owned, swaps]);
  const noteFor = (recipe: AppRecipe) => (gearReady ? gearNote(gearStatus(recipe, owned, swaps), nameOf) : null);
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
        {gearReady ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: onlyMakeable }}
            accessibilityLabel={GEAR_COPY.onlyMakeable}
            accessibilityHint={GEAR_COPY.onlyMakeableHint}
            onPress={() => setOnlyMakeable((v) => !v)}
            testID="gear-only-makeable"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <AppText bold={onlyMakeable}>{`${onlyMakeable ? '✓ ' : ''}${GEAR_COPY.onlyMakeable}`}</AppText>
          </Pressable>
        ) : null}
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
              <RecipeCard key={recipe.id} recipe={recipe} match={match} gearNote={noteFor(recipe)} />
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
            <RecipeCard key={recipe.id} recipe={recipe} match={match} gearNote={noteFor(recipe)} />
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
