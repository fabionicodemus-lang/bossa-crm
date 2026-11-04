import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverSupabaseOptions } from '../homologation/server';

export async function createClient() {
  // Establish the dynamic request boundary before Next's prerender pass reaches the guard.
  // Reading cookies performs no Supabase/network access; the guard still precedes the SDK.
  const cookieStore = await cookies();
  const homologation = serverSupabaseOptions();

  return createServerClient(
    homologation?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    homologation?.key ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      ...(homologation ? { global: homologation.global } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot always write cookies. Proxy refreshes them.
          }
        },
      },
    },
  );
}
