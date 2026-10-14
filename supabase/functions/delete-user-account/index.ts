// Delete the signed-in user's account and kitchen data.
//
// Deploy: Actions -> "Deploy Supabase function" -> delete-user-account (gateway JWT verification ON).
// It imports ../_shared, so it can no longer be pasted into the dashboard editor as one file.
//
// Requires SQL migrations: 20261002150000_account_deletion_fks_and_rpc.sql,
// 20261002143000_avatars_storage.sql (avatars bucket) and 20261009020000_billing_subscriptions.sql.
//
// Secrets: SUPABASE_SERVICE_ROLE_KEY (default), SUPABASE_URL, SUPABASE_ANON_KEY,
//          STRIPE_SECRET_KEY (same key stripe-checkout uses).
//
// Order matters: MealPlanatic Plus is cancelled at Stripe FIRST. If that fails, nothing is
// deleted and the caller is told, because a deleted account with a live subscription would keep
// being charged with no way left to cancel. Billing rows are kept after deletion (consumer law
// asks for a 3-year record); the database unlinks them from the account.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { stripeRequest } from '../_shared/billingServer.ts';
import { isLiveSubscriptionStatus } from '../_shared/billingText.ts';
import { stopBillingForCustomers } from '../_shared/stopBilling.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_STORAGE_BUCKETS = ['avatars', 'scan-photos'] as const;

type StorageListEntry = { name: string; id: string | null };

function isSafeUserStoragePath(objectPath: string, userId: string): boolean {
  const normalized = objectPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return false;
  const prefix = `${userId}/`;
  return normalized === userId || normalized.startsWith(prefix);
}

function collectPathsFromListPage(
  userId: string,
  folderPrefix: string,
  entries: StorageListEntry[],
): { filePaths: string[]; childFolderPrefixes: string[] } {
  const filePaths: string[] = [];
  const childFolderPrefixes: string[] = [];
  const base = folderPrefix.replace(/\/$/, '') || userId;
  if (!isSafeUserStoragePath(base, userId)) return { filePaths, childFolderPrefixes };

  for (const entry of entries) {
    if (!entry.name) continue;
    const fullPath = `${base}/${entry.name}`;
    if (!isSafeUserStoragePath(fullPath, userId)) continue;
    if (entry.id === null) childFolderPrefixes.push(fullPath);
    else filePaths.push(fullPath);
  }
  return { filePaths, childFolderPrefixes };
}

/** @sync mobile/lib/account/deleteUserServerLogic.ts */
async function listAllObjectPathsUnderUserPrefix(
  admin: ReturnType<typeof createClient>,
  bucketId: string,
  userId: string,
): Promise<string[]> {
  const files: string[] = [];
  const queue = [userId];

  while (queue.length > 0) {
    const folder = queue.shift()!;
    if (!isSafeUserStoragePath(folder, userId)) continue;

    const { data, error } = await admin.storage.from(bucketId).list(folder, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error || !data?.length) continue;

    const { filePaths, childFolderPrefixes } = collectPathsFromListPage(
      userId,
      folder,
      data as StorageListEntry[],
    );
    files.push(...filePaths);
    queue.push(...childFolderPrefixes);
  }

  return [...new Set(files.filter((path) => isSafeUserStoragePath(path, userId)))];
}

async function deleteUserStorage(admin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  for (const bucketId of USER_STORAGE_BUCKETS) {
    const paths = await listAllObjectPathsUnderUserPrefix(admin, bucketId, userId);
    if (paths.length === 0) continue;
    const chunkSize = 100;
    for (let i = 0; i < paths.length; i += chunkSize) {
      const chunk = paths.slice(i, i + chunkSize);
      const { error } = await admin.storage.from(bucketId).remove(chunk);
      if (error) {
        console.warn('[delete-user-account] storage remove failed', bucketId, error.message);
      }
    }
  }
}

const CANCEL_FAILED_MESSAGE =
  'We could not cancel your MealPlanatic Plus subscription, so your account was not deleted. ' +
  'Try again in a few minutes, or cancel in Account, Manage subscription first.';

function cancelFailedResponse(): Response {
  return new Response(JSON.stringify({ error: CANCEL_FAILED_MESSAGE, code: 'CANCEL_FAILED' }), {
    status: 502,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Cancels the user's Stripe subscriptions and closes any open Checkout page.
 * Returns false when billing could not be stopped; the account must then be left alone.
 */
async function stopUserBilling(admin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id, status')
    .eq('user_id', userId);
  if (error) {
    console.error('[delete-user-account] billing lookup failed', error.message);
    return false;
  }

  const rows = (data ?? []) as Array<{ stripe_customer_id: string | null; status: string | null }>;
  const customerIds = rows.map((row) => row.stripe_customer_id ?? '').filter(Boolean);
  if (customerIds.length === 0) return true; // Never started a checkout.

  const stripeSecretKey = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim();
  if (!stripeSecretKey) {
    // Without the key nothing can be cancelled. Only safe when no subscription is live.
    const hasLive = rows.some((row) => isLiveSubscriptionStatus(row.status));
    if (hasLive) console.error('[delete-user-account] STRIPE_SECRET_KEY missing; live subscription not cancelled');
    return !hasLive;
  }

  try {
    const result = await stopBillingForCustomers(customerIds, (method, path, form) =>
      stripeRequest(stripeSecretKey, method, path, form ? { form } : {}),
    );
    console.log(
      '[delete-user-account] billing stopped',
      JSON.stringify({
        canceled: result.canceledSubscriptions.length,
        expiredSessions: result.expiredCheckoutSessions.length,
        missingCustomers: result.missingCustomers.length,
      }),
    );
    return true;
  } catch (stripeError) {
    console.error(
      '[delete-user-account] could not stop billing',
      stripeError instanceof Error ? stripeError.message : String(stripeError),
    );
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = userData.user.id;
  const admin = createClient(supabaseUrl, serviceKey);

  if (!(await stopUserBilling(admin, userId))) {
    return cancelFailedResponse();
  }

  const { error: rpcError } = await admin.rpc('delete_user_owned_data', { p_user_id: userId });
  if (rpcError) {
    return new Response(JSON.stringify({ error: rpcError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await deleteUserStorage(admin, userId);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
