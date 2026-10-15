import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CreatorVideosRow } from '../creators/CreatorVideosRow';
import { space } from '../theme/tokens';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { FEED_COPY } from './recipeLogic';
import { RecipesActions } from './RecipesActions';
import { RecipesFeed } from './RecipesFeed';

/**
 * The Recipes tab (owner, 2026-10-15; this was Home until then): the ways into Search, Saved and
 * Import, then "Cook from your pantry" (PRODUCT.md: recipes someone can cook now come first), then
 * creator videos with "See all creator videos" (/creators).
 */
export function RecipesScreen() {
  const router = useRouter();
  return (
    <Screen title={FEED_COPY.title}>
      <RecipesActions />
      <RecipesFeed />
      <View style={{ gap: 4, marginTop: space.gap }}>
        <CreatorVideosRow title={FEED_COPY.creatorsTitle} limit={12} />
        <Button
          label={FEED_COPY.creatorsSeeAll}
          kind="quiet"
          onPress={() => router.push('/creators')}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        />
      </View>
    </Screen>
  );
}
