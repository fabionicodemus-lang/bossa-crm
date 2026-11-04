// Public project identity, never a credential. No request may be sent here in homologation.
export const PRODUCTION_SUPABASE_REF = 'oridhneerxutcjsvwuju';
export const LOCAL_SUPABASE_ORIGIN = 'http://127.0.0.1:54521';
export const REMOTE_SUPABASE_REF = 'okhtfibuexfsgkobjxtu';
export const REMOTE_SUPABASE_ORIGIN = `https://${REMOTE_SUPABASE_REF}.supabase.co`;
export const REMOTE_VERCEL_PROJECT = 'prj_L89zRE7TKcC4ij14B5QyOa72XfPz';
export const HOMOLOGATION_BRANCH = 'feat/commercial-metrics-foundation';
export type Environment = Record<string, string | undefined>;
export type Configuration = {
  enabled: boolean;
  remote: boolean;
  deploymentOrigin: string | null;
  blockers: string[];
  environmentId: string | null;
  commit: string | null;
  databaseOrigin: string | null;
};

export function isHomologation(env: Environment = process.env) {
  // Direct access is inlined by Next: removing runtime env must not turn a protected build into production.
  return process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION === 'required'
    || env.VERCEL_ENV === 'preview' || env.NEXT_PUBLIC_BOSSA_HOMOLOGATION === 'required'
    || env.VERCEL_PROJECT_ID === REMOTE_VERCEL_PROJECT
    || Boolean(env.BOSSA_HOMOLOGATION_MODE);
}

export function inspectConfiguration(env: Environment = process.env): Configuration {
  const enabled = isHomologation(env);
  const blockers: string[] = [];
  const remote = env.BOSSA_HOMOLOGATION_MODE === 'remote';
  const deploymentOrigin = remote && /^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL ?? '') ? `https://${env.VERCEL_URL}` : null;
  const environmentId = env.BOSSA_HOMOLOGATION_ENVIRONMENT_ID ?? null;
  const commit = env.VERCEL_GIT_COMMIT_SHA ?? env.BOSSA_HOMOLOGATION_COMMIT ?? null;
  if (!enabled) return { enabled, remote, deploymentOrigin, blockers, environmentId: null, commit: null, databaseOrigin: null };
  if (remote) {
    if (env.VERCEL_ENV !== 'preview' || env.VERCEL_PROJECT_ID !== REMOTE_VERCEL_PROJECT) blockers.push('unauthorized-managed-project');
    if (!deploymentOrigin || !/^dpl_[a-zA-Z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? '')) blockers.push('deployment-identity-required');
    if (env.VERCEL_GIT_COMMIT_REF !== HOMOLOGATION_BRANCH) blockers.push('unexpected-branch');
    if (!env.VERCEL_GIT_COMMIT_SHA || env.BOSSA_HOMOLOGATION_COMMIT !== commit || process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT !== commit) blockers.push('build-runtime-commit-mismatch');
    if (process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE !== 'remote'
        || process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT !== REMOTE_VERCEL_PROJECT
        || process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN !== deploymentOrigin
        || process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ENVIRONMENT_ID !== environmentId) blockers.push('build-runtime-identity-mismatch');
    if (!env.BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY
        || env.BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY !== process.env.BOSSA_HOMOLOGATION_BUILD_ATTESTATION_KEY) blockers.push('build-attestation-key-required');
  } else {
    if (env.VERCEL_ENV) blockers.push('managed-platform-isolation-not-attested');
    if (env.BOSSA_HOMOLOGATION_MODE !== 'local') blockers.push('local-isolation-mode-required');
  }
  if (!environmentId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(environmentId)) {
    blockers.push('environment-identity-required');
  }
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) blockers.push('exact-commit-required');
  if (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== HOMOLOGATION_BRANCH) {
    blockers.push('unexpected-branch');
  }
  const url = env.BOSSA_HOMOLOGATION_SUPABASE_URL;
  const expectedOrigin = remote ? REMOTE_SUPABASE_ORIGIN : LOCAL_SUPABASE_ORIGIN;
  if (url !== expectedOrigin) blockers.push('independent-database-required');
  if ([url, env.NEXT_PUBLIC_SUPABASE_URL].some(value => value?.toLowerCase().includes(PRODUCTION_SUPABASE_REF))) {
    blockers.push('production-database-forbidden');
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== url) blockers.push('public-database-mismatch');
  if (!env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY
      || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY) {
    blockers.push('dedicated-public-key-required');
  }
  if (remote && (process.env.NEXT_PUBLIC_SUPABASE_URL !== expectedOrigin
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY)) blockers.push('build-public-database-mismatch');
  if (!env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY) blockers.push('dedicated-service-key-required');
  if (env.SUPABASE_SECRET_KEY) blockers.push('inherited-service-key-forbidden');
  const forbidden = Object.keys(env).filter(name => /^(OPENAI_API_KEY|CRON_SECRET|META_.*|MICROSOFT_.*|OUTLOOK_.*|WHATSAPP_.*|NARA_.*|SMTP_.*|RESEND_.*|SENDGRID_.*|MAILGUN_.*|WEBHOOK_.*|NEXT_PUBLIC_META_.*)$/.test(name) && env[name]);
  if (forbidden.length) blockers.push('external-integration-configuration-present');
  if (env.FEATURE_DIRECT_WHATSAPP_CONNECTION !== 'false' || env.FEATURE_EMBEDDED_SIGNUP !== 'false'
      || env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP !== 'false') blockers.push('external-features-must-be-disabled');
  return { enabled, remote, deploymentOrigin, blockers, environmentId, commit, databaseOrigin: blockers.length ? null : expectedOrigin };
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

// Remote service-role traffic is subject to the same explicit scope as user traffic.
const humanRpcs = new Set([
  'commercial_prepare_source_request', 'commercial_replay_source_request', 'commercial_save_proposal_once',
  'commercial_proposal_status_once', 'commercial_finish_source_recovery', 'commercial_get_source_recovery',
  'commercial_create_agenda_once', 'commercial_dashboard', 'commercial_detail', 'commercial_operations',
  'commercial_stage_durations', 'commercial_link_candidates', 'commercial_create_verified_intent',
  'commercial_resolve_link', 'commercial_propose_contact_reconciliation', 'commercial_review_contact_reconciliation',
]);
const humanTables = new Set([
  'organizations', 'memberships', 'profiles', 'leads', 'proposals', 'proposal_payment_items', 'activities',
  'agenda_events', 'lead_tasks', 'user_notifications', 'developments', 'development_units',
  'development_typologies', 'development_files', 'messages', 'lead_handoffs', 'lead_funnel_milestones',
  'commercial_pending_source_requests', 'commercial_ai_proposal_detections',
  'commercial_opportunities', 'commercial_participants', 'commercial_interests', 'commercial_contracts',
  'commercial_receipts', 'commercial_events', 'commercial_settings', 'commercial_ranking_settings',
  'commercial_goals', 'commercial_expenses', 'commercial_conversation_reviews', 'commercial_link_reviews',
  'commercial_stage_decisions', 'commercial_contact_reconciliations', 'commercial_intent_confirmations',
]);
export function assertRemoteSupabaseRequest(input: RequestInfo | URL, init?: RequestInit, diagnostic = false) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (url.origin !== REMOTE_SUPABASE_ORIGIN || url.username || url.password || url.hash) throw new Error('HOMOLOGATION_EGRESS_BLOCKED');
  const path = decodeURIComponent(url.pathname);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (['host', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-http-method-override', 'x-method-override'].some(h => headers.has(h))) throw new Error('HOMOLOGATION_EXTERNAL_EFFECT_BLOCKED');
  if (['accept-profile', 'content-profile'].some(h => headers.has(h) && headers.get(h) !== 'public')) throw new Error('HOMOLOGATION_EXTERNAL_EFFECT_BLOCKED');
  const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path)?.[1];
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(path)?.[1];
  const auth = (path === '/auth/v1/token' && method === 'POST' && url.searchParams.getAll('grant_type').length === 1 && ['password', 'refresh_token'].includes(url.searchParams.get('grant_type') ?? ''))
    || (path === '/auth/v1/user' && method === 'GET') || (path === '/auth/v1/logout' && method === 'POST');
  const readOnlyTables = new Set(['organizations', 'memberships', 'profiles', 'developments', 'development_units', 'commercial_events',
    'development_typologies', 'development_files', 'messages', 'lead_handoffs', 'lead_funnel_milestones',
    'commercial_pending_source_requests', 'commercial_ai_proposal_detections']);
  const allowed = auth || (rpc && method === 'POST' && (humanRpcs.has(rpc) || (diagnostic && rpc === 'bossa_homologation_preflight')))
    || (table && humanTables.has(table) && (['GET', 'HEAD'].includes(method) || (!readOnlyTables.has(table) && ['POST', 'PATCH', 'DELETE'].includes(method))));
  // Storage, Edge Functions, Auth administration/email and unknown RPCs are denied, including service_role.
  if (!allowed || path.includes('%') || path.includes('\\')) throw new Error('HOMOLOGATION_EXTERNAL_EFFECT_BLOCKED');
  return url;
}
