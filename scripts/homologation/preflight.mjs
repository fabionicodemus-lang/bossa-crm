// Read-only gate. No database/provider credentials, migrations or write requests.
const preview = 'https://bossa-crm-git-feat-commercial-metrics-foundation-elos-os.vercel.app';
const local = process.argv.includes('--local-automated');
const origin = local ? 'http://127.0.0.1:3001' : preview;
const expected = process.env.BOSSA_EXPECTED_COMMIT;
const result = { origin, expectedCommit: expected ?? null, checkedAt: new Date().toISOString(),
  writesAllowed: false, humanAcceptanceAllowed: false, blockers: [] };
if (!expected || !/^[a-f0-9]{40}$/.test(expected)) result.blockers.push('exact-expected-commit-required');
else {
  try {
    const response = await fetch(origin + '/api/homologation/preflight', { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const proof = await response.json();
    const age = Date.now() - Date.parse(proof.checkedAt);
    if (response.ok && proof.status === 'local-automated-only' && local && proof.commit === expected
        && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(proof.environmentId)
        && proof.databaseOrigin === 'http://127.0.0.1:54521' && proof.writesAllowed === true
        && age >= -5000 && age < 15000 && proof.checks && Object.keys(proof.checks).length === 6
        && Object.values(proof.checks).every(value => value === true)) {
      result.writesAllowed = true;
      result.environmentId = proof.environmentId;
      result.status = 'local-automated-only';
    } else result.blockers.push('preview-isolation-not-positively-proven');
  } catch { result.blockers.push('preflight-unavailable'); }
}
console.log(JSON.stringify(result, null, 2));
if (!result.writesAllowed) process.exitCode = 1;
