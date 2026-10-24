import { assertLocalSupabaseRequest, assertRemoteSupabaseRequest, LOCAL_SUPABASE_ORIGIN, REMOTE_SUPABASE_ORIGIN, REMOTE_VERCEL_PROJECT } from './policy';

export function browserSupabaseOptions() {
  if (process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION !== 'required') return null;
  const remote = process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE === 'remote';
  const origin = remote ? REMOTE_SUPABASE_ORIGIN : LOCAL_SUPABASE_ORIGIN;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== origin || (remote && process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT !== REMOTE_VERCEL_PROJECT)
      || (typeof window !== 'undefined' && (remote
        ? window.location.origin !== process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN
        : !['127.0.0.1', 'localhost'].includes(window.location.hostname)))) throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
  const guardedFetch: typeof fetch = async (input, init) => {
    if (typeof window === 'undefined') throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
    if (remote) assertRemoteSupabaseRequest(input, init); else assertLocalSupabaseRequest(input);
    const response = await fetch('/api/homologation/preflight', { cache: 'no-store', redirect: 'error' });
    const report = response.ok ? await response.json() : null;
    const age = Date.now() - Date.parse(report?.checkedAt);
    if (report?.writesAllowed !== true || report?.status !== (remote ? 'remote-isolated-only' : 'local-automated-only')
        || report.databaseOrigin !== origin || report.commit !== process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT
        || (remote && (report.humanAcceptanceAllowed !== false || typeof report.checkedAt !== 'string'
          || typeof report.attestationExpiresAt !== 'string' || report.environmentId !== process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ENVIRONMENT_ID
          || report.vercelProjectId !== REMOTE_VERCEL_PROJECT || report.deploymentOrigin !== window.location.origin
          || !Number.isFinite(age) || age < -5000 || age > 15000
          || !(Date.parse(report.attestationExpiresAt) > Date.now())
          || !['processEgress', 'databaseIdentity', 'syntheticRoles', 'databaseGuards', 'schema', 'externalEffects'].every(key => report.checks?.[key] === true)))) {
      throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
    }
    return fetch(input, { ...init, redirect: 'error' });
  };
  return { global: { fetch: guardedFetch } };
}
