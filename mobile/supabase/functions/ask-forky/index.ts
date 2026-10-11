// Ask Forky: one typed question in, one short answer out, from Claude (Anthropic).
//
// Deploy: Actions -> "Deploy Supabase function" -> ask-forky (gateway JWT verification ON).
// Requires SQL migration: 20261009210000_ask_forky_usage.sql
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY         Anthropic API key. Set a monthly spend limit on it in the Anthropic console.
//   FORKY_MODEL               optional: model id (default claude-haiku-5-5). A value set here wins over the
//                             default in the code, so remove or update it when the default changes.
//   FORKY_PLUS_MONTHLY_LIMIT  optional: messages a month for Plus (default 200)
//   FORKY_FREE_TOTAL_LIMIT    optional: one-time messages for a free account (default 2; 0 = Plus only)
// Provided by the platform: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//
// Request:  POST { question, history: [{role,text}], pantry: [{name,amount?,expiresOn?}],
//                  recipes: [{id,title,have?,total?,missing?}],
//                  household?: {size?, usualItems?: string[], cookedRecently?: string[]} }   (signed-in user)
// Response: 200 { answer, recipeIds, offTopic, safetyNote, remaining, limit, isPlus }
//           401 UNAUTHENTICATED · 403 FEATURE_OFF · 429 LIMIT_REACHED · 400 BAD_REQUEST · 502 UPSTREAM_ERROR
//
// Rules this function keeps:
// - The key never leaves the server. The app cannot choose the model, the prompt or the limits.
// - The sign-in token is verified with Supabase Auth, never just decoded.
// - A message is claimed from the user's allowance BEFORE the model is called, and given back if
//   the model fails, so spend is bounded per account.
// - The feature flag `askForky` switches it off for everyone except admin accounts.
// - Questions and answers are not stored. Only counts and token totals are.
// - Recipe ids in the reply are checked against the shortlist that was sent.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  ASK_FORKY_DEFAULT_CAPS,
  ASK_FORKY_DEFAULT_MODEL,
  ASK_FORKY_LIMITS,
  FORKY_REPLY_TOOL,
  forkyMessages,
  forkySystemPrompt,
  forkyUsagePeriod,
  parseCap,
  parseForkyRequest,
  readForkyReply,
} from '../_shared/askForkyText.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL_TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 40_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const anthropicKey = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
  if (!supabaseUrl || !serviceKey || !anonKey || !anthropicKey) {
    return jsonResponse({ error: 'Ask Forky is not set up yet.', code: 'NOT_CONFIGURED' }, 503);
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
  const userId = userData.user.id;

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request too large', code: 'BAD_REQUEST' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, 400);
  }
  const parsed = parseForkyRequest(body);
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error, code: 'BAD_REQUEST' }, 400);
  }
  const request = parsed.request;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const [{ data: profile, error: profileError }, { data: flag, error: flagError }] = await Promise.all([
      admin.from('profiles').select('plan, role').eq('id', userId).maybeSingle(),
      admin.from('feature_flags').select('enabled').eq('key', 'askForky').maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (flagError) throw flagError;

    const profileRow = profile as { plan?: string | null; role?: string | null } | null;
    const isAdmin = profileRow?.role === 'admin';
    const flagOn = (flag as { enabled?: boolean } | null)?.enabled === true;
    if (!flagOn && !isAdmin) {
      return jsonResponse({ error: 'Ask Forky is not available yet.', code: 'FEATURE_OFF' }, 403);
    }

    const now = new Date();
    const { period, isPlus } = forkyUsagePeriod(profileRow?.plan, now, isAdmin);
    const limit = isPlus
      ? parseCap(Deno.env.get('FORKY_PLUS_MONTHLY_LIMIT'), ASK_FORKY_DEFAULT_CAPS.plusPerMonth)
      : parseCap(Deno.env.get('FORKY_FREE_TOTAL_LIMIT'), ASK_FORKY_DEFAULT_CAPS.freeTotal);

    const { data: remaining, error: claimError } = await admin.rpc('claim_forky_message', {
      p_user_id: userId,
      p_period: period,
      p_limit: limit,
    });
    if (claimError) throw claimError;
    if (typeof remaining !== 'number' || remaining < 0) {
      return jsonResponse(
        { error: 'No questions left for now.', code: 'LIMIT_REACHED', remaining: 0, limit, isPlus },
        429,
      );
    }

    const settle = async (inputTokens: number, outputTokens: number, refund: boolean) => {
      const { error } = await admin.rpc('settle_forky_message', {
        p_user_id: userId,
        p_period: period,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_refund: refund,
      });
      if (error) console.error('ask-forky: settle failed', error.message);
    };

    const model = (Deno.env.get('FORKY_MODEL') ?? '').trim() || ASK_FORKY_DEFAULT_MODEL;
    let apiResponse: Response;
    try {
      apiResponse = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: ASK_FORKY_LIMITS.maxOutputTokens,
          system: forkySystemPrompt(now.toISOString().slice(0, 10)),
          messages: forkyMessages(request),
          tools: [FORKY_REPLY_TOOL],
          tool_choice: { type: 'tool', name: FORKY_REPLY_TOOL.name },
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
    } catch (error) {
      await settle(0, 0, true);
      console.error('ask-forky: model request failed', error instanceof Error ? error.name : 'unknown');
      return jsonResponse({ error: 'Forky could not answer. Please try again.', code: 'UPSTREAM_ERROR' }, 502);
    }

    const apiJson = (await apiResponse.json().catch(() => null)) as
      | { usage?: { input_tokens?: number; output_tokens?: number }; error?: { type?: string }; stop_reason?: string }
      | null;
    const inputTokens = apiJson?.usage?.input_tokens ?? 0;
    const outputTokens = apiJson?.usage?.output_tokens ?? 0;

    if (!apiResponse.ok) {
      await settle(0, 0, true);
      // Status and error type only: never the question, the answer or the key.
      console.error('ask-forky: model error', apiResponse.status, apiJson?.error?.type ?? '');
      return jsonResponse({ error: 'Forky could not answer. Please try again.', code: 'UPSTREAM_ERROR' }, 502);
    }

    const reply = readForkyReply(apiJson, request);
    if (!reply) {
      // We were billed for the tokens, so log them, but give the user their message back.
      await settle(inputTokens, outputTokens, true);
      // Stop reason only (for example max_tokens or refusal): never the question or the answer.
      console.error('ask-forky: unreadable model reply', model, apiJson?.stop_reason ?? '');
      return jsonResponse({ error: 'Forky could not answer. Please try again.', code: 'UPSTREAM_ERROR' }, 502);
    }

    await settle(inputTokens, outputTokens, false);
    console.log('ask-forky: ok', JSON.stringify({ model, inputTokens, outputTokens, isPlus, offTopic: reply.offTopic }));

    return jsonResponse({ ...reply, remaining, limit, isPlus });
  } catch (error) {
    console.error('ask-forky failed', error instanceof Error ? error.message : error);
    return jsonResponse({ error: 'Forky could not answer. Please try again.', code: 'UPSTREAM_ERROR' }, 502);
  }
});
