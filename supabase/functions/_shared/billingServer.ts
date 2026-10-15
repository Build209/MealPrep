// Server-side plumbing shared by stripe-checkout and stripe-portal: CORS, verified sign-in,
// and calls to Stripe's REST API (no Stripe SDK: the bundler only allows supabase-js).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { encodeStripeForm } from './billingText.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_REQUEST_TIMEOUT_MS = 15_000;

export type Admin = ReturnType<typeof createClient>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export interface BillingContext {
  admin: Admin;
  userId: string;
  userEmail: string | null;
  stripeSecretKey: string;
  appUrlRaw: string;
}

/**
 * Checks configuration and the caller's sign-in. The token is verified with Supabase Auth
 * (`auth.getUser()`); it is never just decoded, because these functions start payments.
 * Returns a Response to send back when the request cannot proceed.
 */
export async function billingContextFromRequest(req: Request): Promise<BillingContext | Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const stripeSecretKey = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim();
  const appUrlRaw = (Deno.env.get('APP_WEB_URL') ?? '').trim();

  if (!supabaseUrl || !serviceKey || !anonKey || !stripeSecretKey || !appUrlRaw) {
    return jsonResponse({ error: 'Billing is not set up yet.', code: 'NOT_CONFIGURED' }, 503);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Sign in required', code: 'UNAUTHENTICATED' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    admin,
    userId: userData.user.id,
    userEmail: userData.user.email ?? null,
    stripeSecretKey,
    appUrlRaw,
  };
}

export class StripeRequestError extends Error {
  status: number;
  stripeCode: string | null;
  constructor(message: string, status: number, stripeCode: string | null) {
    super(message);
    this.status = status;
    this.stripeCode = stripeCode;
  }
}

/** One call to Stripe. Throws StripeRequestError with Stripe's message on a non-2xx reply. */
export async function stripeRequest<T>(
  secretKey: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options: { form?: Parameters<typeof encodeStripeForm>[0]; idempotencyKey?: string } = {},
): Promise<T> {
  const encoded = options.form ? encodeStripeForm(options.form) : '';
  const url = method === 'GET' && encoded ? `${STRIPE_API_BASE}${path}?${encoded}` : `${STRIPE_API_BASE}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? encoded : undefined,
    signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep null */
  }
  if (!response.ok) {
    const err = (parsed as { error?: { message?: string; code?: string } } | null)?.error;
    throw new StripeRequestError(err?.message ?? `Stripe request failed (${response.status})`, response.status, err?.code ?? null);
  }
  return parsed as T;
}

export interface BillingRow {
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string | null;
}

/** The caller's billing row, newest first. A user normally has at most one. */
export async function findBillingRow(admin: Admin, userId: string): Promise<BillingRow | null> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const rows = (data ?? []) as BillingRow[];
  return rows[0] ?? null;
}
