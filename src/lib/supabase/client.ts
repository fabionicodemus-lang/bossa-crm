'use client';

import { createBrowserClient } from '@supabase/ssr';
import { browserSupabaseOptions } from '../homologation/browser';

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const homologation = browserSupabaseOptions();
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    homologation ?? undefined,
  );
  return client;
}
