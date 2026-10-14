// Stripe webhook: keeps billing_subscriptions in step with Stripe and re-derives profiles.plan.
//
// Deploy: Actions -> "Deploy Supabase function" -> stripe-webhook (gateway JWT verification OFF:
// Stripe cannot send a Supabase token; the Stripe signature is the authentication).
//
// Requires SQL migrations: 20261009020000_billing_subscriptions.sql and, for tiers,
// 20261011180000_plan_tiers.sql (without it every subscription unlocks Plus).
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY      restricted or secret key; used only to re-read subscriptions
//   STRIPE_WEBHOOK_SECRET  signing secret of this endpoint (starts with whsec_)
// Provided by the platform: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Stripe dashboard -> Developers -> Webhooks -> endpoint
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
// Events: checkout.session.completed, customer.subscription.created,
//         customer.subscription.updated, customer.subscription.deleted,
//         invoice.paid, invoice.payment_failed
//
// Design notes:
// - The signature is checked on the raw body before anything is parsed.
// - Events can arrive late, twice or out of order, so the payload is treated as a hint: the
//   subscription is re-read from Stripe and that state is stored.
// - This function never writes profiles.plan. It stores the subscription and calls
//   recompute_user_plan(), so an admin comp is not lost when a subscription ends.
// - Any failure to store returns 500 so Stripe retries.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { verifyStripeSignature } from './signature.ts';
import {
  asUuid,
  consentRowFromCheckoutSession,
  isHandledEventType,
  resolveLinkedUserId,
  shouldApplySubscriptionUpdate,
  stripeId,
  subscriptionIdFromInvoice,
  subscriptionRowFromStripe,
  type SubscriptionRow,
} from './subscriptionState.ts';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;

type Admin = ReturnType<typeof createClient>;

interface StripeEvent {
  id?: unknown;
  type?: unknown;
  data?: { object?: unknown };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Re-read a subscription from Stripe. Returns null when Stripe no longer has it. */
async function fetchStripeSubscription(secretKey: string, subscriptionId: string): Promise<unknown | null> {
  const response = await fetch(`${STRIPE_API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Stripe subscription lookup failed (${response.status})`);
  }
  return await response.json();
}

async function eventAlreadyHandled(admin: Admin, eventId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('stripe_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function recordEvent(admin: Admin, eventId: string, type: string): Promise<void> {
  const { error } = await admin
    .from('stripe_events')
    .upsert({ event_id: eventId, type }, { onConflict: 'event_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** PostgREST (PGRST204) or Postgres (42703) saying the plan_tier column does not exist. */
function isMissingPlanTierColumn(error: { code?: string; message?: string }): boolean {
  return (error.code === 'PGRST204' || error.code === '42703') && /plan_tier/.test(error.message ?? '');
}

/** True while the account still exists. Deleted accounts keep their billing rows, unlinked. */
async function profileExists(admin: Admin, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * Store the subscription and re-derive the user's plan.
 * `hintUserId` comes from the checkout session when the subscription metadata has no user id.
 */
async function syncSubscription(
  admin: Admin,
  row: SubscriptionRow,
  hintUserId: string | null,
): Promise<{ applied: boolean; userId: string | null }> {
  const { data: existing, error: existingError } = await admin
    .from('billing_subscriptions')
    .select('user_id, stripe_subscription_id, status')
    .eq('stripe_customer_id', row.stripe_customer_id)
    .maybeSingle();
  if (existingError) throw existingError;

  const existingRow = existing as
    | { user_id: string | null; stripe_subscription_id: string | null; status: string | null }
    | null;

  // Prefer what we already know; never let an event re-point a customer at another account,
  // and never link to an account that has been deleted since checkout.
  const userId = await resolveLinkedUserId(existingRow?.user_id, [row.metadata_user_id, hintUserId], (id) =>
    profileExists(admin, id),
  );

  if (!shouldApplySubscriptionUpdate(existingRow, row)) {
    return { applied: false, userId };
  }

  const stored = {
    user_id: userId,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    status: row.status,
    price_id: row.price_id,
    billing_interval: row.billing_interval,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };
  let { error: upsertError } = await admin
    .from('billing_subscriptions')
    .upsert({ ...stored, plan_tier: row.plan_tier }, { onConflict: 'stripe_customer_id' });
  if (upsertError && isMissingPlanTierColumn(upsertError)) {
    // Deployed before the plan_tiers migration: store the subscription without the tier, so
    // a payment is never lost over a missing column. The account gets Plus until the migration
    // is applied and the next event for this subscription arrives.
    console.error('stripe-webhook: billing_subscriptions.plan_tier is missing; apply 20261011180000_plan_tiers.sql');
    ({ error: upsertError } = await admin
      .from('billing_subscriptions')
      .upsert(stored, { onConflict: 'stripe_customer_id' }));
  }
  if (upsertError) throw upsertError;

  if (userId) {
    const { error: planError } = await admin.rpc('recompute_user_plan', { p_user_id: userId });
    if (planError) throw planError;
  } else {
    // Paid but not linked to an account: nothing unlocks. Loud log so it is noticed.
    console.error('stripe-webhook: subscription has no linked user', row.stripe_subscription_id);
  }

  return { applied: true, userId };
}

async function handleSubscriptionObject(
  admin: Admin,
  secretKey: string,
  payloadObject: unknown,
  hintUserId: string | null,
): Promise<void> {
  const subscriptionId = stripeId(payloadObject);
  if (!subscriptionId) return;

  // Current truth from Stripe; fall back to the event payload only if Stripe has dropped it.
  const fresh = await fetchStripeSubscription(secretKey, subscriptionId);
  const row = subscriptionRowFromStripe(fresh ?? payloadObject);
  if (!row) {
    throw new Error('Subscription payload missing id, customer or status');
  }
  await syncSubscription(admin, row, hintUserId);
}

async function handleCheckoutCompleted(admin: Admin, secretKey: string, session: unknown): Promise<void> {
  const consent = consentRowFromCheckoutSession(session, new Date().toISOString());
  if (!consent) return; // Not a subscription checkout.

  // The consent record is kept either way; it is only unlinked when the account is gone.
  consent.user_id = await resolveLinkedUserId(null, [consent.user_id], (id) => profileExists(admin, id));

  const { error: consentError } = await admin
    .from('billing_consents')
    .upsert(consent, { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true });
  if (consentError) throw consentError;

  if (consent.stripe_subscription_id) {
    await handleSubscriptionObject(admin, secretKey, consent.stripe_subscription_id, consent.user_id);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const webhookSecret = (Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '').trim();
  const stripeSecretKey = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!webhookSecret || !stripeSecretKey || !supabaseUrl || !serviceKey) {
    // 503 so Stripe retries once the secrets are in place.
    return jsonResponse({ error: 'Billing is not configured.', code: 'NOT_CONFIGURED' }, 503);
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Payload too large' }, 413);
  }

  const check = await verifyStripeSignature({
    secret: webhookSecret,
    header: req.headers.get('Stripe-Signature'),
    rawBody,
  });
  if (!check.ok) {
    return jsonResponse({ error: 'Invalid signature', code: 'BAD_SIGNATURE' }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const eventId = typeof event.id === 'string' ? event.id : '';
  const eventType = event.type;
  if (!eventId || typeof eventType !== 'string') {
    return jsonResponse({ error: 'Malformed event' }, 400);
  }

  // Acknowledge event types we do not use so Stripe stops retrying them.
  if (!isHandledEventType(eventType)) {
    return jsonResponse({ received: true, ignored: eventType });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (await eventAlreadyHandled(admin, eventId)) {
      return jsonResponse({ received: true, duplicate: true });
    }

    const object = event.data?.object;
    if (eventType === 'checkout.session.completed') {
      await handleCheckoutCompleted(admin, stripeSecretKey, object);
    } else if (eventType === 'invoice.paid' || eventType === 'invoice.payment_failed') {
      // Renewal succeeded or a charge failed: re-read the subscription so status and period
      // end are current. Invoices that are not for a subscription are ignored.
      const subscriptionId = subscriptionIdFromInvoice(object);
      if (subscriptionId) {
        await handleSubscriptionObject(admin, stripeSecretKey, subscriptionId, null);
      }
    } else {
      const metadata =
        object && typeof object === 'object'
          ? ((object as { metadata?: Record<string, unknown> }).metadata ?? {})
          : {};
      await handleSubscriptionObject(admin, stripeSecretKey, object, asUuid(metadata.supabase_user_id));
    }

    // Recorded only after the work succeeded, so a failed attempt is retried by Stripe.
    await recordEvent(admin, eventId, eventType);
    return jsonResponse({ received: true });
  } catch (error) {
    console.error('stripe-webhook failed', eventType, eventId, error);
    return jsonResponse({ error: 'Could not process event', code: 'PROCESSING_ERROR' }, 500);
  }
});
