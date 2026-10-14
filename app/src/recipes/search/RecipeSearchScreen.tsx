import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { CreatorVideoListRow } from '../../creators/CreatorVideoCard';
import { useCreatorVideoSearch } from '../../data/creators';
import { useRecipeSearchCatalog } from '../../data/recipeSearch';
import { colors, fonts, radius, space, touch, type as typeScale } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { RecipeResultRow } from './RecipeResultRow';
import { MAX_SEARCH_LENGTH, buildSearchResults, recipeResultNote, searchWords } from './searchLogic';
import { useDebounced } from './useDebounced';

const SEARCH_LABEL = 'Search recipes';

/** The pill search field with its label as visible text above it (DESIGN.md inputs). */
function SearchField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="secondary" bold>
        {SEARCH_LABEL}
      </AppText>
      <TextInput
        accessibilityLabel={SEARCH_LABEL}
        value={value}
        onChangeText={onChange}
        placeholder="A dish or an ingredient"
        placeholderTextColor={colors.muted}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        maxLength={MAX_SEARCH_LENGTH}
        style={{
          minHeight: touch.min + 4,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.pill,
          backgroundColor: colors.card,
          paddingHorizontal: 18,
          color: colors.ink,
          fontFamily: fonts.body,
          fontSize: typeScale.body.fontSize,
        }}
      />
    </View>
  );
}

/**
 * /recipes/search: master and own recipes and published library recipes by title or ingredient,
 * plus creator videos. Recipes open their page; videos open outside the app.
 */
export function RecipeSearchScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const settled = useDebounced(query, 300);
  const words = useMemo(() => searchWords(settled), [settled]);
  const active = words.length > 0;

  const catalog = useRecipeSearchCatalog(!!session);
  const videos = useCreatorVideoSearch(active ? settled : '');

  const results = useMemo(
    () => (active ? buildSearchResults(catalog.data ?? [], videos.data ?? [], settled) : []),
    [active, catalog.data, videos.data, settled],
  );

  if (ready && !session) return <Redirect href="/sign-in" />;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const loading = active && (catalog.isPending || videos.isPending);
  const typing = query.trim() !== settled.trim();
  const problems = [catalog.error, videos.error].filter((e): e is Error => e instanceof Error);

  return (
    <Screen title="Search">
      <Button label="Back" kind="quiet" onPress={back} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <SearchField value={query} onChange={setQuery} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="Saved recipes" kind="secondary" onPress={() => router.push('/recipes/saved')} />
        <Button label="Creator videos" kind="secondary" onPress={() => router.push('/creators')} />
      </View>

      {!active ? (
        <AppText variant="secondary" color="muted">
          Type at least 2 letters. Searches recipe names and ingredients, and recipe videos from creators.
        </AppText>
      ) : null}

      {problems.map((error, i) => (
        <AppText key={String(i)} variant="secondary" color="danger" bold accessibilityRole="alert">
          {error.message}
        </AppText>
      ))}

      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <ActivityIndicator color={colors.ink} />
          <AppText variant="secondary" color="muted">
            Searching...
          </AppText>
        </View>
      ) : null}

      {active && !loading && !typing && results.length === 0 && problems.length === 0 ? (
        <Card>
          <AppText bold>{`Nothing matches "${settled.trim()}".`}</AppText>
          <AppText variant="secondary" color="muted">
            Try one ingredient, like chicken or rice.
          </AppText>
        </Card>
      ) : null}

      {results.length > 0 ? (
        <View style={{ gap: space.gap }}>
          <AppText variant="label" color="muted" accessibilityLiveRegion="polite">
            {results.length === 1 ? '1 result' : `${results.length} results`}
          </AppText>
          {results.map((item) =>
            item.kind === 'recipe' ? (
              <RecipeResultRow key={item.key} recipe={item.hit.recipe} note={recipeResultNote(item.hit.recipe, item.hit.match, words)} />
            ) : (
              <CreatorVideoListRow key={item.key} video={item.video} />
            ),
          )}
        </View>
      ) : null}
    </Screen>
  );
}
