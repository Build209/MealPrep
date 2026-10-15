import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase clients for the LOCAL stack only. Refuses anything that is not on this machine,
 * so these tests can never write to the live project.
 */
function setting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see playwright.config.ts).`);
  return value;
}

export function localUrl(): string {
  const url = setting('E2E_SUPABASE_URL');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
    throw new Error('E2E_SUPABASE_URL must be the local stack (http://127.0.0.1:<port>).');
  }
  return url;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Bypasses row level security: test setup only (seeding rows, creating a second user). */
export function adminClient(): SupabaseClient {
  return createClient(localUrl(), setting('E2E_SUPABASE_SERVICE_ROLE_KEY'), noSession);
}

/** Acts as a person, like the app does. Pass an access token to act as an existing session. */
export function userClient(accessToken?: string): SupabaseClient {
  return createClient(localUrl(), setting('E2E_SUPABASE_ANON_KEY'), {
    ...noSession,
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

/**
 * The local stack's mail catcher (Mailpit, or Inbucket on older Supabase CLIs), where the local
 * auth server delivers its emails. E2E_MAIL_URL comes from `supabase status`; 54324 is the CLI's
 * default port. Local only, like the rest of this file.
 */
export function localMailUrl(): string {
  const url = (process.env.E2E_MAIL_URL || 'http://127.0.0.1:54324').replace(/\/+$/, '');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error('E2E_MAIL_URL must be the local mail catcher (http://127.0.0.1:<port>).');
  }
  return url;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The text of the newest email sent to `to`, or null if none has arrived. Tries Mailpit, then Inbucket. */
async function newestEmailBody(to: string): Promise<string | null> {
  const base = localMailUrl();

  // Mailpit: /api/v1/search?query=to:<address> (newest first), then /api/v1/message/<ID>.
  const found = (await getJson(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)) as {
    messages?: { ID: string }[];
  } | null;
  const id = found?.messages?.[0]?.ID;
  if (id) {
    const message = (await getJson(`${base}/api/v1/message/${encodeURIComponent(id)}`)) as {
      Text?: string;
      HTML?: string;
    } | null;
    if (message) return `${message.Text ?? ''}\n${message.HTML ?? ''}`;
  }

  // Inbucket: /api/v1/mailbox/<local part> (oldest first), then /api/v1/mailbox/<local part>/<id>.
  const box = encodeURIComponent(to.split('@')[0] ?? to);
  const list = (await getJson(`${base}/api/v1/mailbox/${box}`)) as { id: string }[] | null;
  const last = Array.isArray(list) ? list[list.length - 1] : undefined;
  if (last) {
    const message = (await getJson(`${base}/api/v1/mailbox/${box}/${encodeURIComponent(last.id)}`)) as {
      body?: { text?: string; html?: string };
    } | null;
    if (message) return `${message.body?.text ?? ''}\n${message.body?.html ?? ''}`;
  }
  return null;
}

/** Waits for the reset email to `to` and returns its link (to the local auth server's /verify). */
export async function waitForRecoveryLink(to: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = await newestEmailBody(to);
    const match = body?.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
    if (match) {
      const link = match[0].replace(/&amp;/g, '&');
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(link)) {
        throw new Error('The reset link does not point at the local stack: refusing to open it.');
      }
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No reset email for ${to} reached the mail catcher at ${localMailUrl()} in ${timeoutMs} ms.`);
}

/** A fresh address per run, so tests never depend on leftovers. */
export function freshEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
