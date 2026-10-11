// Start a MealPlanatic subscription (Plus, Pro or Family): returns the URL of a Stripe-hosted Checkout page.
//
// Deploy: Actions -> "Deploy Supabase function" -> stripe-checkout (gateway JWT verification ON).
// Requires SQL migrations: 20261009020000_billing_subscriptions.sql, 20261011180000_plan_tiers.sql
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY  Stripe secret or restricted key (test key while testing)
//   APP_WEB_URL        https://mealplanatic.app/
// Provided by the platform: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//
// Stripe setup this relies on:
//   - One active price per tier and period, with lookup keys plus_monthly, plus_yearly,
//     pro_monthly, pro_yearly, family_monthly, family_yearly (so test and live need no code
//     change). A tier whose price is missing answers PRICE_NOT_FOUND and cannot be bought.
//   - A Terms of Service URL in Stripe's public business details; the required consent box
//     cannot be shown without it.
//
// Request:  POST { "interval": "month" | "year", "tier"?: "plus" | "pro" | "family" }   (signed-in user;
//           no tier means Plus)
// Response: 200 { "url": "https://checkout.stripe.com/..." }
//           409 { code: "ALREADY_SUBSCRIBED" } when the user already has a live subscription
//
// Rules this function keeps:
// - The price and the return URLs come from server configuration, never from the request.
// - The renewal wording is built from the real Stripe price, shown beside the pay button, and
//   its version is saved in the session metadata for the consent record the webhook writes.
// - The customer must tick an unticked box agreeing to automatic renewal before paying.
// - Stripe is asked whether the customer already has a subscription or an open Checkout page
//   before a new page is made, so nobody can end up paying twice.
// - A stored customer id Stripe does not know (a test-mode id after the switch to live keys) is
//   replaced with a new customer instead of failing checkout for that account for good.

import {
  billingContextFromRequest,
  corsHeaders,
  findBillingRow,
  jsonResponse,
  StripeRequestError,
  stripeRequest,
} from '../_shared/billingServer.ts';
import {
  checkoutReturnUrls,
  consentCheckboxText,
  DISCLOSURE_VERSION,
  isLiveSubscriptionStatus,
  lookupKeyFor,
  normalizeAppUrl,
  parseBillingInterval,
  parseCheckoutTier,
  renewalDisclosure,
  TERMS_VERSION,
} from '../_shared/billingText.ts';
import {
  hasLiveStripeSubscription,
  isUnknownStripeCustomer,
  planOpenCheckoutSessions,
  type OpenCheckoutSession,
} from '../_shared/checkoutGuards.ts';

interface StripePrice {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval?: string } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const context = await billingContextFromRequest(req);
  if (context instanceof Response) return context;
  const { admin, userId, userEmail, stripeSecretKey } = context;

  const appUrl = normalizeAppUrl(context.appUrlRaw);
  if (!appUrl) {
    return jsonResponse({ error: 'Billing is not set up yet.', code: 'NOT_CONFIGURED' }, 503);
  }

  let body: { interval?: unknown; tier?: unknown } = {};
  try {
    body = (await req.json()) as { interval?: unknown; tier?: unknown };
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }
  const interval = parseBillingInterval(body.interval);
  if (!interval) {
    return jsonResponse({ error: 'Choose a monthly or yearly plan.', code: 'BAD_REQUEST' }, 400);
  }
  const tier = parseCheckoutTier(body.tier);
  if (!tier) {
    return jsonResponse({ error: 'Choose Plus, Pro or Family.', code: 'BAD_REQUEST' }, 400);
  }
  const lookupKey = lookupKeyFor(tier, interval);

  try {
    const existing = await findBillingRow(admin, userId);
    if (existing && isLiveSubscriptionStatus(existing.status)) {
      return jsonResponse(
        { error: 'You already have a MealPlanatic plan. Use Manage subscription to make changes.', code: 'ALREADY_SUBSCRIBED' },
        409,
      );
    }

    // One Stripe customer per account, created once and remembered.
    let customerId = existing?.stripe_customer_id ?? null;
    let openSessions: OpenCheckoutSession[] = [];

    if (customerId) {
      // Ask Stripe, not our table: our row only shows a subscription once the webhook has landed.
      try {
        const subscriptions = await stripeRequest<{ data: Array<{ status?: string }> }>(
          stripeSecretKey,
          'GET',
          '/subscriptions',
          { form: { customer: customerId, status: 'all', limit: 20 } },
        );
        if (hasLiveStripeSubscription(subscriptions.data ?? [])) {
          return jsonResponse(
            { error: 'You already have a MealPlanatic plan. Use Manage subscription to make changes.', code: 'ALREADY_SUBSCRIBED' },
            409,
          );
        }
        const sessions = await stripeRequest<{ data: OpenCheckoutSession[] }>(
          stripeSecretKey,
          'GET',
          '/checkout/sessions',
          { form: { customer: customerId, status: 'open', limit: 20 } },
        );
        openSessions = sessions.data ?? [];
      } catch (lookupError) {
        if (!isUnknownStripeCustomer(lookupError)) throw lookupError;
        // Stripe has no such customer under this key. Start again with a new one below.
        console.warn('stripe-checkout: stored customer is unknown to Stripe; creating a new one');
        const staleCustomerId = customerId;
        customerId = null;
        // The old row is kept as a record but unlinked, so it no longer counts for this account.
        const { error: unlinkError } = await admin
          .from('billing_subscriptions')
          .update({ user_id: null, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('stripe_customer_id', staleCustomerId);
        if (unlinkError) throw unlinkError;
      }
    }

    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>(stripeSecretKey, 'POST', '/customers', {
        form: { email: userEmail, metadata: { supabase_user_id: userId } },
        // Not keyed on the user alone: after a stale customer is dropped, Stripe must not hand
        // the same idempotent answer back.
        idempotencyKey: `mp-customer-${userId}-${existing?.stripe_customer_id ?? 'first'}`,
      });
      customerId = customer.id;
      const { error: insertError } = await admin
        .from('billing_subscriptions')
        .upsert(
          { user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
          { onConflict: 'stripe_customer_id', ignoreDuplicates: true },
        );
      if (insertError) throw insertError;
    }

    const prices = await stripeRequest<{ data: StripePrice[] }>(stripeSecretKey, 'GET', '/prices', {
      form: { lookup_keys: [lookupKey], active: true, limit: 1 },
    });
    const price = prices.data[0];
    if (!price || price.unit_amount === null || price.recurring?.interval !== interval) {
      console.error('stripe-checkout: no active price for lookup key', lookupKey);
      return jsonResponse({ error: 'This plan is not available right now.', code: 'PRICE_NOT_FOUND' }, 503);
    }

    // A page already open for this plan is handed back; any other open page is closed first,
    // so there is never more than one page this customer could pay on.
    const openPlan = planOpenCheckoutSessions(openSessions, { priceId: price.id });
    for (const sessionId of openPlan.expireIds) {
      try {
        await stripeRequest(stripeSecretKey, 'POST', `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`);
      } catch (expireError) {
        // Paid or expired a moment ago. If it was paid, do not open a second page.
        const status = expireError instanceof StripeRequestError ? expireError.status : 0;
        if (status < 400 || status >= 500) throw expireError;
        const recheck = await stripeRequest<{ data: Array<{ status?: string }> }>(stripeSecretKey, 'GET', '/subscriptions', {
          form: { customer: customerId, status: 'all', limit: 20 },
        });
        if (hasLiveStripeSubscription(recheck.data ?? [])) {
          return jsonResponse(
            { error: 'You already have a MealPlanatic plan. Use Manage subscription to make changes.', code: 'ALREADY_SUBSCRIBED' },
            409,
          );
        }
      }
    }
    if (openPlan.reuseUrl) {
      return jsonResponse({ url: openPlan.reuseUrl });
    }

    const urls = checkoutReturnUrls(appUrl);
    // Same button pressed twice within a minute returns the same Checkout page, not two.
    const minuteBucket = Math.floor(Date.now() / 60_000);

    const session = await stripeRequest<{ url: string | null }>(stripeSecretKey, 'POST', '/checkout/sessions', {
      form: {
        mode: 'subscription',
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: urls.success,
        cancel_url: urls.cancel,
        consent_collection: { terms_of_service: 'required' },
        custom_text: {
          submit: { message: renewalDisclosure(price.unit_amount, price.currency, interval, tier) },
          terms_of_service_acceptance: {
            message: consentCheckboxText(price.unit_amount, price.currency, interval, urls.terms, tier),
          },
        },
        metadata: {
          supabase_user_id: userId,
          price_id: price.id,
          billing_interval: interval,
          plan_tier: tier,
          terms_version: TERMS_VERSION,
          disclosure_version: DISCLOSURE_VERSION,
        },
        subscription_data: {
          billing_mode: { type: 'flexible' },
          metadata: { supabase_user_id: userId },
        },
      },
      idempotencyKey: `mp-checkout-${userId}-${price.id}-${minuteBucket}`,
    });

    if (!session.url) {
      throw new Error('Stripe returned a Checkout Session without a URL');
    }
    return jsonResponse({ url: session.url });
  } catch (error) {
    if (error instanceof StripeRequestError) {
      console.error('stripe-checkout: Stripe error', error.status, error.stripeCode, error.message);
    } else {
      console.error('stripe-checkout failed', error);
    }
    return jsonResponse({ error: 'Could not start checkout. Please try again.', code: 'UPSTREAM_ERROR' }, 502);
  }
});
