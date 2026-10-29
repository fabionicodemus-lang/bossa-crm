// Read-only gate: no credentials, migrations, external integrations or business writes.
const local = process.argv.includes('--local-automated');
const remote = process.argv.includes('--remote');
const expected = process.env.BOSSA_EXPECTED_COMMIT;
const requested = process.env.BOSSA_HOMOLOGATION_PREVIEW_ORIGIN;
const origin = local && !remote ? 'http://127.0.0.1:3001' : remote && !local ? requested : null;
const result = { origin: origin ?? null, expectedCommit: expected ?? null, checkedAt: new Date().toISOString(),
  writesAllowed: false, humanAcceptanceAllowed: false, blockers: [] };
if (!origin || (remote && (!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)
    || origin === 'https://bossa-crm-git-feat-commercial-metrics-foundation-elos-os.vercel.app'))) result.blockers.push('explicit-independent-preview-origin-required');
if (!expected || !/^[a-f0-9]{40}$/.test(expected)) result.blockers.push('exact-expected-commit-required');
if (!result.blockers.length) {
  try {
    const response = await fetch(origin + '/api/homologation/preflight', { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const proof = await response.json();
    const age = Date.now() - Date.parse(proof.checkedAt);
    const remoteIdentity = !remote || (proof.vercelProjectId === 'prj_L89zRE7TKcC4ij14B5QyOa72XfPz'
      && proof.deploymentOrigin === origin && Date.parse(proof.attestationExpiresAt) > Date.now());
    if (response.ok && proof.status === (local ? 'local-automated-only' : 'remote-isolated-only') && remoteIdentity
        && proof.commit === expected && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(proof.environmentId)
        && proof.databaseOrigin === (local ? 'http://127.0.0.1:54521' : 'https://okhtfibuexfsgkobjxtu.supabase.co')
        && proof.writesAllowed === true && proof.humanAcceptanceAllowed === false
        && age >= -5000 && age < 15000 && proof.checks
        && ['processEgress', 'databaseIdentity', 'syntheticRoles', 'databaseGuards', 'schema', 'externalEffects'].every(key => proof.checks[key] === true)) {
      result.writesAllowed = true; result.environmentId = proof.environmentId; result.status = proof.status;
    } else result.blockers.push('preview-isolation-not-positively-proven');
  } catch { result.blockers.push('preflight-unavailable'); }
}
console.log(JSON.stringify(result, null, 2));
if (!result.writesAllowed) process.exitCode = 1;
