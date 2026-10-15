import { useQuery } from '@tanstack/react-query';
import type { OwnSubscription } from '../plans/pricing';
import { retryUnlessPermanent, toDataError } from './errors';
import { SIGNED_OUT } from './keys';
import { requireClient, requireUserId, useSessionUserId } from './session';

/**
 * The signed-in person's own subscription row, or null when they never subscribed. Row level
 * security (billing_subscriptions_select_self) only returns the caller's rows; only the
 * stripe-webhook function writes them. Same read as the live app (lib/billing/client.ts), plus
 * plan_tier and an explicit user filter.
 */
export async function fetchOwnSubscription(userId: string | null | undefined): Promise<OwnSubscription | null> {
  const client = requireClient();
  const id = requireUserId(userId);
  let response: { data: unknown; error: unknown };
  try {
    response = await client
      .from('billing_subscriptions')
      .select('status, billing_interval, current_period_end, cancel_at_period_end, plan_tier, stripe_subscription_id')
      .eq('user_id', id)
      .not('stripe_subscription_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1);
  } catch (thrown) {
    throw toDataError(thrown);
  }
  if (response.error) throw toDataError(response.error);
  const row = ((response.data as unknown[] | null) ?? [])[0] as
    | {
        status: string | null;
        billing_interval: string | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean | null;
        plan_tier: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    status: row.status,
    billingInterval: row.billing_interval,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    planTier: row.plan_tier,
  };
}

export const subscriptionKey = (userId: string | null | undefined) => ['billing', userId ? userId : SIGNED_OUT] as const;

export function useOwnSubscription() {
  const session = useSessionUserId();
  const userId = session.data ?? null;
  return useQuery({
    queryKey: subscriptionKey(userId),
    queryFn: () => fetchOwnSubscription(userId),
    enabled: !session.isPending && userId !== null,
    retry: retryUnlessPermanent,
  });
}
