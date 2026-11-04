import { createClient } from '@supabase/supabase-js';
import { serverSupabaseOptions } from '../homologation/server';

export function createAdminClient() {
  const homologation = serverSupabaseOptions(true);
  const secret = homologation?.key ?? process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('SUPABASE_SECRET_KEY não configurada.');
  return createClient(homologation?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(homologation ? { global: homologation.global } : {}),
  });
}
