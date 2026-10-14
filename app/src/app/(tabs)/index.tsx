import { SignOutCard } from '../../auth/SignOutCard';
import { buildLine } from '../../lib/channel';
import { env } from '../../lib/env';
import { HomeFeed } from '../../recipes/HomeFeed';
import { FEED_COPY } from '../../recipes/recipeLogic';
import { AppText } from '../../ui/AppText';
import { Screen } from '../../ui/Screen';

const build = buildLine(env.gitSha);

/** Home: "Cook from your pantry" first (PRODUCT.md: recipes someone can cook now come first), then the account card. */
export default function HomeScreen() {
  return (
    <Screen title={FEED_COPY.title}>
      <HomeFeed />
      <SignOutCard />
      {build ? (
        <AppText variant="label" color="muted">
          {build}
        </AppText>
      ) : null}
    </Screen>
  );
}
