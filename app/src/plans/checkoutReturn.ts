/**
 * The trip back from Stripe. Copied from the live app (mobile/lib/billing/checkoutReturn.ts):
 * stripe-checkout sends people back to `?checkout=success|cancel` (supabase/functions/_shared/billingText.ts)
 * and the billing portal to `?billing=return`.
 */
export type CheckoutReturn = 'success' | 'cancel' | 'portal';

/** Reads `?checkout=success|cancel` or `?billing=return` from a query string. */
export function parseCheckoutReturn(search: string): CheckoutReturn | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const checkout = params.get('checkout');
  if (checkout === 'success') return 'success';
  if (checkout === 'cancel') return 'cancel';
  if (params.get('billing') === 'return') return 'portal';
  return null;
}

/** The same query string without the return markers, so a reload does not repeat the message. */
export function stripCheckoutReturn(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('checkout');
  params.delete('billing');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/** Poll schedule after a successful checkout: the webhook usually lands within a few seconds (live values). */
export const PLAN_UNLOCK_POLL = { intervalMs: 2_000, attempts: 10 } as const;
