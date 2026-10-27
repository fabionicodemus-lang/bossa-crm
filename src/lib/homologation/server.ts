import { hasRemotePlatformAttestation, type PlatformReceipt } from './attestation';
import { preflightAdminHeaders } from './admin-headers';
import { assertLocalSupabaseRequest, assertRemoteSupabaseRequest, REMOTE_SUPABASE_REF, inspectConfiguration, isHomologation, type Environment } from './policy';

type DatabaseProof = {
  platformAttestation?: PlatformReceipt;
  supabaseProjectRef?: string;
  permissionsSafe?: boolean;
  serviceRoleGuardsIntact?: boolean;
  authEmailBlocked?: boolean;
  contractVersion: number;
  environmentId: string;
  checkedAt: string;
  syntheticUsersOnly: boolean;
  requiredRolesReady: boolean;
  guardsIntact: boolean;
  schemaReady: boolean;
  zeroExternalEffects: boolean;
};
export type PreflightReport = {
  status: 'blocked' | 'local-automated-only' | 'remote-isolated-only';
  writesAllowed: boolean;
  humanAcceptanceAllowed: false;
  checkedAt: string;
  commit: string | null;
  environmentId: string | null;
  databaseOrigin: string | null;
  deploymentOrigin: string | null;
  vercelProjectId: string | null;
  attestationExpiresAt?: string;
  blockers: string[];
  checks: {
    processEgress: boolean;
    databaseIdentity: boolean;
    syntheticRoles: boolean;
    databaseGuards: boolean;
    schema: boolean;
    externalEffects: boolean;
  };
};

type GuardedGlobal = typeof globalThis & { __bossaHomologationNetworkGuard?: string };

export async function getHomologationPreflight(env: Environment = process.env, transport: typeof fetch = fetch): Promise<PreflightReport> {
  const config = inspectConfiguration(env);
  const report: PreflightReport = { status: 'blocked', writesAllowed: false, humanAcceptanceAllowed: false,
    checkedAt: new Date().toISOString(), commit: config.commit, environmentId: config.environmentId,
    databaseOrigin: config.databaseOrigin, deploymentOrigin: config.deploymentOrigin,
    vercelProjectId: config.remote ? env.VERCEL_PROJECT_ID ?? null : null, blockers: [...config.blockers],
    checks: { processEgress: false, databaseIdentity: false, syntheticRoles: false,
      databaseGuards: false, schema: false, externalEffects: false } };
  if (!config.enabled) { report.blockers.push('not-a-homologation-environment'); return report; }
  const marker = config.remote ? 'remote-supabase-https-v1' : 'loopback-54521-3001-v1';
  if ((globalThis as GuardedGlobal).__bossaHomologationNetworkGuard !== marker) {
    report.blockers.push('process-egress-guard-not-installed');
  } else report.checks.processEgress = true;
  // Never probe an unknown/production origin to discover whether it is safe.
  if (report.blockers.length) return report;
  try {
    const response = await transport(`${config.databaseOrigin}/rest/v1/rpc/bossa_homologation_preflight`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      headers: preflightAdminHeaders(env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY!, config.remote),
      body: '{}',
    });
    if (!response.ok) throw new Error('database-attestation-unavailable');
    const proof = await response.json() as DatabaseProof;
    const age = Date.now() - Date.parse(proof.checkedAt);
    const contractVersion = config.remote ? 2 : 1;
    const remoteProof = !config.remote || (hasRemotePlatformAttestation(env, proof.platformAttestation) && proof.supabaseProjectRef === REMOTE_SUPABASE_REF
      && proof.permissionsSafe === true && proof.serviceRoleGuardsIntact === true && proof.authEmailBlocked === true);
    report.checks.databaseIdentity = proof.contractVersion === contractVersion && proof.environmentId === config.environmentId
      && (!config.remote || proof.supabaseProjectRef === REMOTE_SUPABASE_REF);
    report.checks.syntheticRoles = proof.syntheticUsersOnly === true && proof.requiredRolesReady === true && (!config.remote || remoteProof);
    report.checks.databaseGuards = proof.guardsIntact === true && remoteProof;
    report.checks.schema = proof.schemaReady === true;
    report.checks.externalEffects = proof.zeroExternalEffects === true && remoteProof;
    if (typeof proof.checkedAt !== 'string' || !remoteProof || proof.contractVersion !== contractVersion || proof.environmentId !== config.environmentId || !Number.isFinite(age) || age < -5000 || age > 15000
        || proof.syntheticUsersOnly !== true || proof.requiredRolesReady !== true || proof.guardsIntact !== true
        || proof.schemaReady !== true || proof.zeroExternalEffects !== true) throw new Error('database-attestation-rejected');
    report.writesAllowed = true;
    report.status = config.remote ? 'remote-isolated-only' : 'local-automated-only';
    if (config.remote) {
      const receipt = JSON.parse(Buffer.from(proof.platformAttestation!.payload, 'base64url').toString('utf8'));
      report.attestationExpiresAt = new Date(Math.min(Date.parse(receipt.expiresAt), Date.parse(receipt.authAudit.expiresAt), Date.parse(receipt.databaseAudit.expiresAt))).toISOString();
    }
  } catch {
    report.writesAllowed = false;
    report.status = 'blocked';
    // Never include database/transport error bodies: they can contain keys or private data.
    report.blockers.push('database-attestation-unavailable-or-rejected');
  }
  return report;
}

export function serverSupabaseOptions(admin = false) {
  if (!isHomologation()) return null;
  const config = inspectConfiguration();
  if (config.blockers.length) throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
  const guardedFetch: typeof fetch = async (input, init) => {
    if (config.remote) assertRemoteSupabaseRequest(input, init);
    else assertLocalSupabaseRequest(input);
    const report = await getHomologationPreflight();
    if (!report.writesAllowed) throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
    // supabase-js supplies Bearer <apikey> by default, including opaque keys.
    // Remove only that redundant opaque Bearer; never replace a human session JWT.
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (config.remote && admin && process.env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY?.startsWith('sb_secret_')
      && headers.get('authorization') === `Bearer ${process.env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY}`) headers.delete('authorization');
    return fetch(input, { ...init, headers, redirect: 'error' });
  };
  return { url: config.databaseOrigin!, key: admin ? process.env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY!
    : process.env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY!, global: { fetch: guardedFetch } };
}
