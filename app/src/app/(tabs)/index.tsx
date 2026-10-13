import { SignOutCard } from '../../auth/SignOutCard';
import { AppText } from '../../ui/AppText';
import { Card } from '../../ui/Card';
import { ComingSoon } from '../../ui/ComingSoon';
import { Screen } from '../../ui/Screen';
import { buildLine } from '../../lib/channel';
import { env, isSupabaseConfigured } from '../../lib/env';
import { ScanButton } from '../../scan';

const build = buildLine(env.gitSha);

export default function HomeScreen() {
  return (
    <Screen title="Home">
      <Card>
        <AppText variant="sectionTitle" bold>
          The new MealPlanatic
        </AppText>
        <AppText color="muted">
          This is the rebuild preview. Your real app is unchanged until switch-over.
        </AppText>
        <AppText variant="secondary" color="muted">
          {isSupabaseConfigured() ? 'Connected settings found.' : 'No server settings in this build.'}
        </AppText>
        {build ? (
          <AppText variant="label" color="muted">
            {build}
          </AppText>
        ) : null}
      </Card>
      {/* Temporary entry point until the Scan button moves to the Pantry tab. */}
      <Card>
        <AppText variant="sectionTitle" bold>
          Scan your food
        </AppText>
        <AppText color="muted">A shelf, the fridge or a grocery receipt. You check every item before it's saved.</AppText>
        <ScanButton />
      </Card>
      <ComingSoon phase={3} what="Recipes you can cook from your pantry." />
      <SignOutCard />
    </Screen>
  );
}
