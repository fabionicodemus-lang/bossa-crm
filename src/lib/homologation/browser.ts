import { assertLocalSupabaseRequest, LOCAL_SUPABASE_ORIGIN } from './policy';

export function browserSupabaseOptions() {
  // This value is forced by next.config at build time, never chosen by the browser.
  if (process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION !== 'required') return null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_SUPABASE_ORIGIN
      || (typeof window !== 'undefined' && !['127.0.0.1', 'localhost'].includes(window.location.hostname))) {
    throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
  }
  const guardedFetch: typeof fetch = async (input, init) => {
    // Client components can construct an SDK during SSR. They may not perform I/O there.
    if (typeof window === 'undefined') throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
    assertLocalSupabaseRequest(input);
    const response = await fetch('/api/homologation/preflight', { cache: 'no-store', redirect: 'error' });
    const report = response.ok ? await response.json() : null;
    if (report?.writesAllowed !== true || report?.status !== 'local-automated-only'
        || report.databaseOrigin !== LOCAL_SUPABASE_ORIGIN
        || report.commit !== process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT) throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
    return fetch(input, { ...init, redirect: 'error' });
  };
  return { global: { fetch: guardedFetch } };
}
