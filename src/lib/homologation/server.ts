import { assertLocalSupabaseRequest, inspectConfiguration, isHomologation, type Environment } from './policy';

type DatabaseProof = {
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
  status: 'blocked' | 'local-automated-only';
  writesAllowed: boolean;
  humanAcceptanceAllowed: false;
  checkedAt: string;
  commit: string | null;
  environmentId: string | null;
  databaseOrigin: string | null;
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
    databaseOrigin: config.databaseOrigin, blockers: [...config.blockers],
    checks: { processEgress: false, databaseIdentity: false, syntheticRoles: false,
      databaseGuards: false, schema: false, externalEffects: false } };
  if (!config.enabled) { report.blockers.push('not-a-homologation-environment'); return report; }
  if ((globalThis as GuardedGlobal).__bossaHomologationNetworkGuard !== 'loopback-54521-3001-v1') {
    report.blockers.push('process-egress-guard-not-installed');
  } else report.checks.processEgress = true;
  // Never probe an unknown/production origin to discover whether it is safe.
  if (report.blockers.length) return report;
  try {
    const response = await transport(`${config.databaseOrigin}/rest/v1/rpc/bossa_homologation_preflight`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY!,
        authorization: `Bearer ${env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY!}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('database-attestation-unavailable');
    const proof = await response.json() as DatabaseProof;
    const age = Date.now() - Date.parse(proof.checkedAt);
    report.checks.databaseIdentity = proof.contractVersion === 1 && proof.environmentId === config.environmentId;
    report.checks.syntheticRoles = proof.syntheticUsersOnly === true && proof.requiredRolesReady === true;
    report.checks.databaseGuards = proof.guardsIntact === true;
    report.checks.schema = proof.schemaReady === true;
    report.checks.externalEffects = proof.zeroExternalEffects === true;
    if (proof.contractVersion !== 1 || proof.environmentId !== config.environmentId || !Number.isFinite(age) || age < -5000 || age > 15000
        || proof.syntheticUsersOnly !== true || proof.requiredRolesReady !== true || proof.guardsIntact !== true
        || proof.schemaReady !== true || proof.zeroExternalEffects !== true) throw new Error('database-attestation-rejected');
    report.writesAllowed = true;
    report.status = 'local-automated-only';
  } catch {
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
    assertLocalSupabaseRequest(input);
    const report = await getHomologationPreflight();
    if (!report.writesAllowed) throw new Error('HOMOLOGATION_PREFLIGHT_BLOCKED');
    return fetch(input, { ...init, redirect: 'error' });
  };
  return { url: config.databaseOrigin!, key: admin ? process.env.BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY!
    : process.env.BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY!, global: { fetch: guardedFetch } };
}
