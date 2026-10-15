import { useRouter } from 'expo-router';
import { ACCOUNT_SCREEN_COPY } from '../account/copy';
import { buildLine } from '../lib/channel';
import { env } from '../lib/env';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';
import { HOME_COPY } from './copy';
import { HomeCounters } from './HomeCounters';
import { HomeForkyBox } from './HomeForkyBox';
import { HomePromoSlot } from './HomePromoSlot';

const build = buildLine(env.gitSha);

/**
 * Home (owner, 2026-10-15): Ask Forky at the top, then three counters (ready to cook, pantry items,
 * on the grocery list) that open their tabs, then a reserved slot for later (HomePromoSlot: no ads
 * today), then the link to Account (plan, Manage subscription, sign out). The recipes feed moved to
 * the Recipes tab. The trip back from Stripe (?checkout=success|cancel, ?billing=return) is handled
 * for every screen by CheckoutReturnNotice in the root layout, so it still works when Stripe sends
 * people back to Home.
 */
export function HomeScreen() {
  const router = useRouter();
  return (
    <Screen title={HOME_COPY.title}>
      <HomeForkyBox />
      <HomeCounters />
      <HomePromoSlot />
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
