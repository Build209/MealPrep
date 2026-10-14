import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePantryItems } from '../data';
import { useRecipes } from '../data/recipes';
import { rankRecipeFeed } from '../kitchen/recipeFeed';
import { colors, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FEED_COPY } from './recipeLogic';
import { RecipeCard } from './RecipeCard';

/** Plain links to the other recipe screens (built in their own pull requests). */
function RecipeLinks() {
  const links = [
    { href: '/recipes/search', label: FEED_COPY.searchLink },
    { href: '/recipes/saved', label: FEED_COPY.savedLink },
    { href: '/recipes/import', label: FEED_COPY.importLink },
  ] as const;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.groupGap, rowGap: 4 }}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} style={{ minHeight: touch.min, justifyContent: 'center', paddingVertical: 10 }}>
          <AppText bold style={{ textDecorationLine: 'underline' }}>
            {link.label}
          </AppText>
        </Link>
      ))}
    </View>
  );
}

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
export function HomeFeed() {
  const router = useRouter();
  const recipes = useRecipes();
  const pantry = usePantryItems();

  const feed = useMemo(
    () => (recipes.data && pantry.data ? rankRecipeFeed(recipes.data, pantry.data) : null),
    [recipes.data, pantry.data],
  );

  if (recipes.isPending || pantry.isPending) {
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
      <RecipeLinks />

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
      ) : feed.cookable.length === 0 ? (
        <AppText color="muted">{FEED_COPY.noRecipes}</AppText>
      ) : null}
    </View>
  );
}
