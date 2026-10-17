import { Link, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePantryItems } from '../data';
import { useGroceryItems } from '../data/grocery';
import { useRecipes } from '../data/recipes';
import { useScoredRecipes } from '../kitchen/useScoredRecipes';
import { colors, fonts, radius, space, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { HOME_COPY, TAB_TITLES } from './copy';
import { homeCounts } from './counts';

type Query = { isPending: boolean; isError: boolean };

/** The number on a tile: the count, "…" while loading, "–" when it could not be read. */
function shown(value: number | null, query: Query): { text: string; a11y: string } {
  if (value !== null) return { text: String(value), a11y: String(value) };
  if (query.isPending && !query.isError) return { text: '…', a11y: HOME_COPY.loading };
  return { text: '–', a11y: HOME_COPY.unknown };
}

function Tile({ href, label, tab, value, testID }: { href: Href; label: string; tab: string; value: { text: string; a11y: string }; testID: string }) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={HOME_COPY.counterA11y(label, value.a11y, tab)}
        testID={testID}
        style={({ pressed }) => ({
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 96,
          minHeight: touch.min,
          minWidth: touch.min,
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          paddingHorizontal: 12,
          paddingVertical: 12,
          gap: 2,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {/* Plain Text, not a page title: the number is big but is not a heading. */}
        <Text testID={`${testID}-value`} style={{ ...typeScale.pageTitle, fontFamily: fonts.display, color: colors.ink }}>
          {value.text}
        </Text>
        <AppText variant="secondary" bold>
          {label}
        </AppText>
      </Pressable>
    </Link>
  );
}

/**
 * Home's three counters, each opening its tab: recipes ready to cook with what is in the pantry
 * (the feed's own scoring, src/kitchen/recipeFeed.ts readyToCookCount), pantry items, and grocery
 * items still to buy (not ticked). Read from the same queries the tabs use, so they always agree.
 */
export function HomeCounters() {
  const recipes = useRecipes();
  const pantry = usePantryItems();
  const grocery = useGroceryItems();
  const scored = useScoredRecipes(recipes.data, pantry.data);
  const counts = useMemo(
    () => homeCounts({ recipes: recipes.data, pantry: pantry.data, grocery: grocery.data, scoredById: scored }),
    [recipes.data, pantry.data, grocery.data, scored],
  );
  const readyQuery = {
    isPending: recipes.isPending || pantry.isPending || Boolean(recipes.data && pantry.data && !scored),
    isError: recipes.isError || pantry.isError,
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap }}>
      <Tile href="/recipes" label={HOME_COPY.readyToCook} tab={TAB_TITLES.recipes} value={shown(counts.ready, readyQuery)} testID="home-count-ready" />
      <Tile href="/pantry" label={HOME_COPY.pantryItems} tab={TAB_TITLES.pantry} value={shown(counts.pantry, pantry)} testID="home-count-pantry" />
      <Tile href="/grocery" label={HOME_COPY.groceryItems} tab={TAB_TITLES.grocery} value={shown(counts.grocery, grocery)} testID="home-count-grocery" />
    </View>
  );
}
