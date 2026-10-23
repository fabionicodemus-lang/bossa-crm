// Public project identity, never a credential. No request may be sent here in homologation.
export const PRODUCTION_SUPABASE_REF = 'oridhneerxutcjsvwuju';
export const LOCAL_SUPABASE_ORIGIN = 'http://127.0.0.1:54521';
export const HOMOLOGATION_BRANCH = 'feat/commercial-metrics-foundation';
export type Environment = Record<string, string | undefined>;
export type Configuration = {
  enabled: boolean;
  blockers: string[];
  environmentId: string | null;
  commit: string | null;
  databaseOrigin: string | null;
};

export function isHomologation(env: Environment = process.env) {
  // Direct access is inlined by Next: removing runtime env must not turn a protected build into production.
  return process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION === 'required'
    || env.VERCEL_ENV === 'preview' || env.NEXT_PUBLIC_BOSSA_HOMOLOGATION === 'required'
    || Boolean(env.BOSSA_HOMOLOGATION_MODE);
}

export function inspectConfiguration(env: Environment = process.env): Configuration {
  const enabled = isHomologation(env);
  const blockers: string[] = [];
  const environmentId = env.BOSSA_HOMOLOGATION_ENVIRONMENT_ID ?? null;
  const commit = env.VERCEL_GIT_COMMIT_SHA ?? env.BOSSA_HOMOLOGATION_COMMIT ?? null;
  if (!enabled) return { enabled, blockers, environmentId: null, commit: null, databaseOrigin: null };
  if (env.VERCEL_ENV) blockers.push('managed-platform-isolation-not-attested');
  if (env.BOSSA_HOMOLOGATION_MODE !== 'local') blockers.push('local-isolation-mode-required');
  if (!environmentId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(environmentId)) {
    blockers.push('environment-identity-required');
  }
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) blockers.push('exact-commit-required');
  if (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== HOMOLOGATION_BRANCH) {
    blockers.push('unexpected-branch');
  }
  const url = env.BOSSA_HOMOLOGATION_SUPABASE_URL;
  // No remote host, alternate port, credentials, redirects or environment override can unblock this release.
  if (url !== LOCAL_SUPABASE_ORIGIN) blockers.push('independent-local-database-required');
  if ([url, env.NEXT_PUBLIC_SUPABASE_URL].some(value => value?.toLowerCase().includes(PRODUCTION_SUPABASE_REF))) {
    blockers.push('production-database-forbidden');
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== url) blockers.push('public-database-mismatch');
  if (!env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY
      || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY) {
    blockers.push('dedicated-public-key-required');
  }
  if (!env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY) blockers.push('dedicated-service-key-required');
  if (env.SUPABASE_SECRET_KEY) blockers.push('inherited-service-key-forbidden');
  const forbidden = Object.keys(env).filter(name => /^(OPENAI_API_KEY|CRON_SECRET|META_(APP_ID|APP_SECRET|LEAD_ADS_.*)|MICROSOFT_.*|WHATSAPP_.*|NEXT_PUBLIC_META_(APP_ID|CONFIG_ID))$/.test(name) && env[name]);
  if (forbidden.length) blockers.push('external-integration-configuration-present');
  if (env.FEATURE_DIRECT_WHATSAPP_CONNECTION !== 'false' || env.FEATURE_EMBEDDED_SIGNUP !== 'false'
      || env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP !== 'false') blockers.push('external-features-must-be-disabled');
  return { enabled, blockers, environmentId, commit, databaseOrigin: blockers.length ? null : LOCAL_SUPABASE_ORIGIN };
}

// Default deny for APIs and authentication side effects. No method/header/extension exemption.
export function isAllowedHomologationPath(pathname: string) {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { return false; }
  if (path.includes('%') || path.includes('\\') || path.includes('//') || path.includes('..')) return false;
  if (path === '/api/homologation/preflight') return true;
  if (path.startsWith('/api/')) {
    return /^\/api\/(activities|agenda|hoje(?:\/tasks)?|notifications|commercial\/(export|recovery)|leads\/(search|bulk-kind|bulk-stage)|leads\/[^/.]+\/(detail|kind|lifecycle|proposal-outcome|stage|tasks)|propostas\/[^/.]+\/pdf)$/.test(path);
  }
  return !/^\/(auth|cadastro|recuperar-senha|atualizar-senha|configuracoes|transmissoes)(\/|$)/.test(path);
}

export function assertLocalSupabaseRequest(input: RequestInfo | URL) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== LOCAL_SUPABASE_ORIGIN || url.username || url.password) throw new Error('HOMOLOGATION_EGRESS_BLOCKED');
  const path = decodeURIComponent(url.pathname);
  if (path.includes('%') || path.includes('\\')
      || (path.startsWith('/auth/v1/') && !/^\/auth\/v1\/(token|user|logout|settings|health|\.well-known)(\/|$)/.test(path))
      || !/^\/(auth|rest|storage)\/v1(\/|$)/.test(path)) throw new Error('HOMOLOGATION_EXTERNAL_EFFECT_BLOCKED');
  return url;
}
