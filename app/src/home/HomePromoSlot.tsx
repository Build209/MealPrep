import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { useCurrentPlan } from '../plans/CurrentPlan';
import { PLANS_COPY, USAGE_COPY } from '../plans/copy';
import { touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';

/**
 * Home's reserved slot under the counters (owner, 2026-10-15: "leave for ads or a small store").
 *
 * For now it shows NO third-party ads and loads nothing from outside the app: ads would first need
 * changes to the privacy page (it promises we don't sell or share data), a consent step, and a
 * compliance review. Until then the slot is a small card that points to our own plans, using only
 * approved wording (PLANS_COPY.freeBlurb is LIVE; "Plans" is the existing link label), never new
 * money wording.
 *
 * Shown only where plans are sold and only to a free account with no live subscription: the same
 * rule as the buy buttons on /plans (planScreenState showBuy, which includes canBuyHere(): web only;
 * phone builds must not point to another way to pay). Nothing shows while the plan is loading
 * or if it could not be read.
 */
export function HomePromoSlot() {
  const { state, subscription, loading } = useCurrentPlan();
  // A failed subscription read could hide a live subscription: show nothing rather than guess.
  if (loading || subscription.error || !state?.showBuy) return null;
  return (
    <Card>
      <AppText variant="secondary">{PLANS_COPY.freeBlurb}</AppText>
      <Link href="/plans" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={USAGE_COPY.plansLink}
          testID="home-promo-plans"
          style={{ minHeight: touch.min, minWidth: touch.min, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
          <AppText bold style={{ textDecorationLine: 'underline' }}>
            {USAGE_COPY.plansLink}
          </AppText>
        </Pressable>
      </Link>
    </Card>
  );
}
