// Manage subscription: returns the URL of Stripe's hosted customer portal, where the customer
// can cancel online, update their card and see invoices.
//
// Deploy: Actions -> "Deploy Supabase function" -> stripe-portal (gateway JWT verification ON).
// Requires SQL migration: 20261009020000_billing_subscriptions.sql
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY              Stripe secret or restricted key
//   APP_WEB_URL                    https://mealplanatic.app/
//   STRIPE_PORTAL_CONFIGURATION    optional: id of a portal configuration (bpc_...). When unset,
//                                  Stripe uses the default portal settings saved in the Dashboard.
//
// Request:  POST {}   (signed-in user)
// Response: 200 { "url": "https://billing.stripe.com/..." }
//           404 { code: "NO_CUSTOMER" } when the user has never started a checkout
//
// The customer is looked up from the signed-in user only; a customer id is never accepted from
// the request, so nobody can open someone else's billing page.

import {
  billingContextFromRequest,
  corsHeaders,
  findBillingRow,
  jsonResponse,
  StripeRequestError,
  stripeRequest,
} from '../_shared/billingServer.ts';
import { checkoutReturnUrls, normalizeAppUrl } from '../_shared/billingText.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const context = await billingContextFromRequest(req);
  if (context instanceof Response) return context;
  const { admin, userId, stripeSecretKey } = context;

  const appUrl = normalizeAppUrl(context.appUrlRaw);
  if (!appUrl) {
    return jsonResponse({ error: 'Billing is not set up yet.', code: 'NOT_CONFIGURED' }, 503);
  }

  try {
    const row = await findBillingRow(admin, userId);
    if (!row) {
      return jsonResponse({ error: 'No subscription found for this account.', code: 'NO_CUSTOMER' }, 404);
    }

    const configuration = (Deno.env.get('STRIPE_PORTAL_CONFIGURATION') ?? '').trim() || null;
    const session = await stripeRequest<{ url: string }>(stripeSecretKey, 'POST', '/billing_portal/sessions', {
      form: {
        customer: row.stripe_customer_id,
        return_url: checkoutReturnUrls(appUrl).portal,
        configuration,
      },
    });
    return jsonResponse({ url: session.url });
  } catch (error) {
    if (error instanceof StripeRequestError) {
      console.error('stripe-portal: Stripe error', error.status, error.stripeCode, error.message);
    } else {
      console.error('stripe-portal failed', error);
    }
    return jsonResponse({ error: 'Could not open billing. Please try again.', code: 'UPSTREAM_ERROR' }, 502);
  }
});
