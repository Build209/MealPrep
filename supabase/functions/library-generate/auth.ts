import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ADMIN_SECRET_HEADER = 'x-library-admin-secret';

export async function authorizeLibraryGenerate(req: Request): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const expectedSecret = (Deno.env.get('LIBRARY_ADMIN_SECRET') ?? '').trim();
  const providedSecret = (req.headers.get(ADMIN_SECRET_HEADER) ?? '').trim();
  if (expectedSecret && providedSecret && providedSecret === expectedSecret) {
    return { ok: true };
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, message: 'Server not configured' };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, status: 401, message: 'Invalid session' };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== 'admin') {
    return { ok: false, status: 403, message: 'Admin only' };
  }

  return { ok: true };
}
