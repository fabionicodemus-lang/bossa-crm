import { HOMOLOGATION_BRANCH, REMOTE_SUPABASE_ORIGIN, REMOTE_VERCEL_PROJECT, type Environment } from './policy';

export const manualPilot = (env: Environment = process.env) => process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE === 'manual-pilot'
  || env.BOSSA_HOMOLOGATION_MODE === 'manual-pilot';
export function inspectManualPilot(env: Environment = process.env, pins = true) {
  const blockers: string[] = [];
  const origin = /^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL ?? '') ? `https://${env.VERCEL_URL}` : null;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  if (env.BOSSA_HOMOLOGATION_MODE !== 'manual-pilot' || env.VERCEL_ENV !== 'preview'
    || env.VERCEL_PROJECT_ID !== REMOTE_VERCEL_PROJECT || env.VERCEL_GIT_COMMIT_REF !== HOMOLOGATION_BRANCH) blockers.push('manual-pilot-target-mismatch');
  if (!origin || !/^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? '')
    || !/^[a-f0-9]{40}$/.test(commit ?? '') || env.BOSSA_HOMOLOGATION_COMMIT !== commit) blockers.push('manual-pilot-deployment-identity-required');
  if (env.BOSSA_HOMOLOGATION_SUPABASE_URL !== REMOTE_SUPABASE_ORIGIN || env.NEXT_PUBLIC_SUPABASE_URL !== REMOTE_SUPABASE_ORIGIN
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY ?? '')
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY) blockers.push('manual-pilot-public-key-required');
  if (pins && (process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE !== 'manual-pilot'
    || process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT !== REMOTE_VERCEL_PROJECT
    || process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT !== commit
    || process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN !== origin
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== REMOTE_SUPABASE_ORIGIN
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY)) blockers.push('manual-pilot-build-runtime-mismatch');
  if (Object.keys(env).some(k => env[k] && /^(SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY)|BOSSA_.*(SECRET_KEY|DATABASE_URL)|DATABASE_URL|PGPASSWORD|VERCEL_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|META_.*|MICROSOFT_.*|OUTLOOK_.*|WHATSAPP_.*|NARA_.*|SMTP_.*|RESEND_.*|SENDGRID_.*|MAILGUN_.*|CRON_SECRET|WEBHOOK_.*)$/.test(k))) blockers.push('manual-pilot-privileged-or-external-configuration');
  if (env.FEATURE_DIRECT_WHATSAPP_CONNECTION !== 'false' || env.FEATURE_EMBEDDED_SIGNUP !== 'false' || env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP !== 'false') blockers.push('manual-pilot-external-features-enabled');
  return { blockers, origin, commit, ready: blockers.length === 0 };
}

export function manualPilotPath(pathname: string, method = 'GET') {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { return false; }
  if (path.includes('%') || path.includes('\\') || path.includes('..') || path.includes('//')) return false;
  if (method === 'GET' && (/^\/_next\/static\/[^?]+$/.test(path) || ['/crm-theme.js','/bossa-logo.png','/favicon.ico'].includes(path))) return true;
  if (path === '/api/homologation/preflight') return method === 'GET';
  if (path === '/login') return method === 'GET';
  if (['GET','POST'].includes(method) && /^\/(gestao(?:\/(nova|oportunidades(?:\/[0-9a-f-]{36})?))?)$/.test(path)) return true;
  if (method === 'GET' && (/^\/(clientes|corretores|agenda|propostas|empreendimentos)$/.test(path) || /^\/leads\/[0-9a-f-]{36}$/.test(path))) return true;
  if (path === '/' && method === 'GET') return true;
  if (path === '/api/activities') return method === 'POST';
  if (path === '/api/agenda') return ['GET','POST','PATCH'].includes(method);
  if (path === '/api/commercial/recovery') return ['GET','POST'].includes(method);
  if (/^\/api\/propostas\/[0-9a-f-]{36}\/pdf$/.test(path)) return method === 'GET';
  if (/^\/api\/leads\/[0-9a-f-]{36}\/detail$/.test(path) || path === '/api/leads/search') return method === 'GET';
  if (/^\/api\/leads\/[0-9a-f-]{36}\/stage$/.test(path)) return method === 'POST';
  if (path === '/api/leads/bulk-stage') return method === 'POST';
  return false;
}

const reads = new Set(['organizations','memberships','profiles','leads','activities','messages','lead_tasks',
  'commercial_opportunities','commercial_participants','commercial_interests','commercial_events','commercial_link_reviews',
  'commercial_stage_decisions','commercial_settings','commercial_goals','commercial_receipts','commercial_contracts',
  'commercial_ranking_settings','commercial_expenses','commercial_proposal_versions','commercial_pending_source_requests',
  'proposals','proposal_payment_items','agenda_events','developments','development_units','development_typologies']);
const writes = new Set(['activities','leads','commercial_opportunities','commercial_participants','commercial_interests','proposals','agenda_events']);
const rpcs = new Set(['commercial_prepare_source_request','commercial_replay_source_request','commercial_save_proposal_once',
  'commercial_proposal_status_once','commercial_finish_source_recovery','commercial_get_source_recovery',
  'commercial_create_agenda_once','commercial_dashboard','commercial_detail','commercial_operations','commercial_stage_durations']);

// This is only an additional rejection filter. Auth/PostgREST validate the JWT signature and RLS.
export function pilotUser(claims: Record<string, unknown> | null | undefined) {
  return claims?.role === 'authenticated' && claims.is_anonymous === false
    && typeof claims.sub === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(claims.sub)
    && typeof claims.email === 'string' && /^[^\s@]+@bossa-homolog\.invalid$/.test(claims.email)
    && claims.iss === `${REMOTE_SUPABASE_ORIGIN}/auth/v1`;
}
export function assertPilotRequest(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url.origin !== REMOTE_SUPABASE_ORIGIN || url.username || url.password || url.hash
    || headers.get('apikey') !== key || !key?.startsWith('sb_publishable_')) throw Error('MANUAL_PILOT_EGRESS_BLOCKED');
  const path = decodeURIComponent(url.pathname);
  if (path.includes('%') || path.includes('\\') || path.includes('..') || path.includes('//')
    || ['host','forwarded','x-forwarded-host','x-forwarded-proto','x-http-method-override','x-method-override'].some(k=>headers.has(k))
    || ['accept-profile','content-profile'].some(k=>headers.has(k)&&headers.get(k)!=='public')) throw Error('MANUAL_PILOT_REQUEST_BLOCKED');
  const password = path === '/auth/v1/token' && method === 'POST' && url.searchParams.getAll('grant_type').length === 1
    && [...url.searchParams.keys()].length === 1 && ['password','refresh_token'].includes(url.searchParams.get('grant_type') ?? '');
  if (password && url.searchParams.get('grant_type') === 'password') {
    try {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      if (!body || typeof body.email !== 'string' || !/^[^\s@]+@bossa-homolog\.invalid$/.test(body.email)) throw Error();
    } catch {throw Error('MANUAL_PILOT_FICTIONAL_LOGIN_REQUIRED');}
  }
  const jwks = path === '/auth/v1/.well-known/jwks.json' && method === 'GET' && !url.search;
  if (headers.get('authorization') === `Bearer ${key}`) headers.delete('authorization');
  if (!password && !jwks) {
    const token = headers.get('authorization')?.replace(/^Bearer /,'');
    try { if (!token || !pilotUser(JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))))) throw Error(); }
    catch { throw Error('MANUAL_PILOT_HUMAN_SESSION_REQUIRED'); }
  }
  if (password || jwks || (path === '/auth/v1/user' && method === 'GET') || (path === '/auth/v1/logout' && method === 'POST')) return headers;
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(path)?.[1];
  const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path)?.[1];
  if ((rpc && method === 'POST' && rpcs.has(rpc)) || (table && reads.has(table)
    && (['GET','HEAD'].includes(method) || (writes.has(table)&&['POST','PATCH'].includes(method))))) return headers;
  throw Error('MANUAL_PILOT_REQUEST_BLOCKED');
}
