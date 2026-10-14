import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { ACCOUNT_SCREEN_COPY } from '../../account/copy';
import { CreatorVideosRow } from '../../creators/CreatorVideosRow';
import { buildLine } from '../../lib/channel';
import { env } from '../../lib/env';
import { HomeActions } from '../../recipes/HomeActions';
import { HomeFeed } from '../../recipes/HomeFeed';
import { FEED_COPY } from '../../recipes/recipeLogic';
import { space } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';

const build = buildLine(env.gitSha);

/**
 * Home: the ways into Search, Saved and Import, then "Cook from your pantry" (PRODUCT.md: recipes
 * someone can cook now come first), creator videos under it, then the link to Account (plan, Manage subscription, sign out).
 */
export default function HomeScreen() {
  const router = useRouter();
  return (
    <Screen title={FEED_COPY.title}>
      <HomeActions />
      <HomeFeed />
      <View style={{ gap: 4, marginTop: space.gap }}>
        <CreatorVideosRow title={FEED_COPY.creatorsTitle} limit={12} />
        <Button
          label={FEED_COPY.creatorsSeeAll}
          kind="quiet"
          onPress={() => router.push('/creators')}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        />
      </View>
      <AppText
        bold
        accessibilityRole="link"
        onPress={() => router.push('/account')}
        style={{ alignSelf: 'flex-start', textDecorationLine: 'underline', paddingVertical: 10 }}
      >
        {ACCOUNT_SCREEN_COPY.title}
      </AppText>
      {build ? (
        <AppText variant="label" color="muted">
          {build}
        </AppText>
      ) : null}
    </Screen>
  );
}
