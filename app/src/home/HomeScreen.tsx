import { useRouter } from 'expo-router';
import { openExternal } from '../stores/StoreCard';
import { dealsTargetFor } from '../stores/storeRow';
import { StoresRow } from '../stores/StoresRow';
import { Screen } from '../ui/Screen';
import { HOME_COPY } from './copy';
import { HomeCounters } from './HomeCounters';
import { HomeForkyBox } from './HomeForkyBox';
import { HomePromoSlot } from './HomePromoSlot';

/**
 * Home (owner, 2026-10-15): Ask Forky at the top, then three counters (ready to cook, pantry items,
 * on the grocery list) that open their tabs, then a reserved slot for later (HomePromoSlot: no ads
 * today), then a row of store circles that open each store's weekly ad. Account is the person icon
 * in the top bar (one tap from every tab). The recipes feed moved to
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
      <StoresRow
        variant="deals"
        onOpenStore={(key, store) => {
          const target = dealsTargetFor(store);
          if (target.kind === 'weekly-ad') openExternal(target.url);
          else router.push({ pathname: '/grocery', params: { view: 'stores', store: target.key } });
        }}
        onFindStores={() => router.push({ pathname: '/grocery', params: { view: 'stores' } })}
      />
    </Screen>
  );
}
