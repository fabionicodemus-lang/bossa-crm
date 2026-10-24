// Synthetic adapters only: no Vercel/Supabase/provider network requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const repo = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bossa-remote-isolation-'));
const require = createRequire(import.meta.url), saved = { ...process.env }, fetchBefore = globalThis.fetch;
let count = 0;
async function check(name, run) { await run(); count++; console.log('PASS ' + name); }
async function load(file, stubs = {}, define = {}) {
  const output = path.join(temp, fs.readdirSync(temp).length + '.cjs');
  await build({ entryPoints: [path.join(repo, file)], outfile: output, bundle: true, platform: 'node', format: 'cjs', define,
    tsconfig: path.join(repo, 'tsconfig.json'), logLevel: 'silent', plugins: [{ name: 'isolated-framework', setup(b) {
      b.onResolve({ filter: /.*/ }, a => a.path in stubs ? { path: a.path, namespace: 'stub' } : null);
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
    } }] });
  return { module: require(output), output };
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const key = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const origin = 'https://okhtfibuexfsgkobjxtu.supabase.co', project = 'prj_L89zRE7TKcC4ij14B5QyOa72XfPz';
const base = { BOSSA_HOMOLOGATION_MODE: 'remote', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: project,
  VERCEL_DEPLOYMENT_ID: 'dpl_Synthetic', VERCEL_URL: 'bossa-synthetic.vercel.app',
  VERCEL_GIT_COMMIT_REF: 'feat/commercial-metrics-foundation', VERCEL_GIT_COMMIT_SHA: '1'.repeat(40),
  BOSSA_HOMOLOGATION_COMMIT: '1'.repeat(40), NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT: '1'.repeat(40),
  BOSSA_HOMOLOGATION_ENVIRONMENT_ID: '11111111-1111-4111-8111-111111111111',
  NEXT_PUBLIC_BOSSA_HOMOLOGATION_ENVIRONMENT_ID: '11111111-1111-4111-8111-111111111111',
  NEXT_PUBLIC_BOSSA_HOMOLOGATION: 'required', NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE: 'remote',
  NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT: project, NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN: 'https://bossa-synthetic.vercel.app',
  BOSSA_HOMOLOGATION_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: origin,
  BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY: 'synthetic-anon', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-anon',
  BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY: 'synthetic-service', BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY: key,
  BOSSA_HOMOLOGATION_BUILD_ATTESTATION_KEY: key,
  FEATURE_DIRECT_WHATSAPP_CONNECTION: 'false', FEATURE_EMBEDDED_SIGNUP: 'false', NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP: 'false' };
function setEnv(overrides = {}) {
  for (const k of Object.keys(process.env)) if (/^(BOSSA_|NEXT_PUBLIC_|VERCEL_|SUPABASE_|OPENAI_|META_|MICROSOFT_|OUTLOOK_|WHATSAPP_|FEATURE_|CRON_|SMTP_|RESEND_|SENDGRID_|MAILGUN_|NARA_|WEBHOOK_|NEXT_RUNTIME)/.test(k)) delete process.env[k];
  Object.assign(process.env, base, overrides);
}
const platform = () => ({ contractVersion: 1, environmentId: base.BOSSA_HOMOLOGATION_ENVIRONMENT_ID,
  vercelProjectId: project, deploymentId: base.VERCEL_DEPLOYMENT_ID, deploymentOrigin: base.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN,
  supabaseProjectRef: 'okhtfibuexfsgkobjxtu', commit: base.VERCEL_GIT_COMMIT_SHA,
  issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), evidenceSha256: 'a'.repeat(64),
  checks: { networkEgressRestricted: true, externalIntegrationsDisabled: true, cronDisabled: true, webhooksDisabled: true,
    authEmailDisabled: true, functionsDisabled: true, storageEffectsDisabled: true } });
function receipt(value = platform()) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url') };
}
const database = () => ({ contractVersion: 2, environmentId: base.BOSSA_HOMOLOGATION_ENVIRONMENT_ID,
  supabaseProjectRef: 'okhtfibuexfsgkobjxtu', checkedAt: new Date().toISOString(),
  syntheticUsersOnly: true, requiredRolesReady: true, guardsIntact: true, schemaReady: true, zeroExternalEffects: true,
  permissionsSafe: true, serviceRoleGuardsIntact: true, authEmailBlocked: true, platformAttestation: receipt() });
try {
  setEnv();
  const { module: server } = await load('src/lib/homologation/server.ts');
  const { module: policy } = await load('src/lib/homologation/policy.ts');
  let calls = [];
  globalThis.__bossaHomologationNetworkGuard = 'remote-supabase-https-v1';
  const transport = async (input, init) => { calls.push([String(input), init]); return Response.json(database()); };
  await check('exact independent project plus signed platform and complete DB proof authorize isolated status only', async () => {
    const proof = await server.getHomologationPreflight(process.env, transport);
    assert.equal(proof.writesAllowed, true); assert.equal(proof.status, 'remote-isolated-only');
    assert.equal(proof.humanAcceptanceAllowed, false); assert.ok(Object.values(proof.checks).every(Boolean));
    assert.equal(calls[0][0], origin + '/rest/v1/rpc/bossa_homologation_preflight'); assert.equal(calls[0][1].redirect, 'error');
    assert.ok(!JSON.stringify(proof).includes('synthetic-service'));
  });
  await check('original/unknown Vercel, production Supabase, wrong SHA/branch/build pins and absent credentials refused before transport', async () => {
    for (const overrides of [
      { VERCEL_PROJECT_ID: 'bossa-crm' }, { VERCEL_PROJECT_ID: 'prj_unknown' }, { VERCEL_ENV: 'production' },
      { VERCEL_DEPLOYMENT_ID: '' }, { VERCEL_GIT_COMMIT_SHA: '' }, { VERCEL_URL: 'bossa-crm.example.com' }, { VERCEL_GIT_COMMIT_REF: 'main' },
      { BOSSA_HOMOLOGATION_COMMIT: '2'.repeat(40) }, { NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT: '2'.repeat(40) },
      { NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT: 'unknown' }, { NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN: 'https://unknown.vercel.app' },
      { NEXT_PUBLIC_BOSSA_HOMOLOGATION_ENVIRONMENT_ID: 'unknown' }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'wrong' },
      { BOSSA_HOMOLOGATION_SUPABASE_URL: 'https://oridhneerxutcjsvwuju.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'https://oridhneerxutcjsvwuju.supabase.co' },
      { BOSSA_HOMOLOGATION_SUPABASE_URL: 'https://unknown.supabase.co' }, { BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY: '' },
      { BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY: '' }, { BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY: '' },
      { BOSSA_HOMOLOGATION_BUILD_ATTESTATION_KEY: 'wrong' }, { SUPABASE_SECRET_KEY: 'inherited' },
      ...['OPENAI_API_KEY', 'WHATSAPP_TOKEN', 'MICROSOFT_CLIENT_ID', 'OUTLOOK_TOKEN', 'META_APP_ID', 'CRON_SECRET', 'SMTP_HOST', 'RESEND_API_KEY', 'WEBHOOK_SECRET', 'NARA_TOKEN'].map(k => ({ [k]: 'inherited' })),
    ]) {
      setEnv(overrides); const before = calls.length;
      assert.equal((await server.getHomologationPreflight(process.env, transport)).writesAllowed, false, JSON.stringify(Object.keys(overrides)));
      assert.equal(calls.length, before);
    }
    setEnv();
    delete globalThis.__bossaHomologationNetworkGuard;
    const before = calls.length;
    assert.equal((await server.getHomologationPreflight(process.env, transport)).writesAllowed, false); assert.equal(calls.length, before);
    globalThis.__bossaHomologationNetworkGuard = 'remote-supabase-https-v1';
  });
  await check('missing/incomplete/old/wrong DB proofs and platform receipts fail closed', async () => {
    const cases = [{}, null, { contractVersion: 1 }, { environmentId: 'wrong' }, { supabaseProjectRef: 'oridhneerxutcjsvwuju' },
      { checkedAt: 'invalid' }, { checkedAt: [new Date().toISOString()] }, { checkedAt: new Date(Date.now() - 60000).toISOString() }, { checkedAt: new Date(Date.now() + 60000).toISOString() },
      ...['syntheticUsersOnly', 'requiredRolesReady', 'guardsIntact', 'schemaReady', 'zeroExternalEffects', 'permissionsSafe', 'serviceRoleGuardsIntact', 'authEmailBlocked'].flatMap(k => [{ [k]: false }, { [k]: undefined }]),
      { platformAttestation: undefined }, { platformAttestation: { payload: 'invalid', signature: 'invalid' } }];
    for (const override of cases) {
      const proof = override === null ? null : { ...database(), ...override };
      if (override && Object.keys(override).length === 0) for (const k of Object.keys(proof)) delete proof[k];
      assert.equal((await server.getHomologationPreflight(process.env, async () => Response.json(proof))).writesAllowed, false);
    }
    for (const failed of [async () => new Response('secret', { status: 500 }), async () => { throw Error('private-key'); }]) {
      const proof = await server.getHomologationPreflight(process.env, failed);
      assert.equal(proof.writesAllowed, false); assert.ok(!JSON.stringify(proof).includes('private-key'));
    }
  });
  await check('valid signatures cannot authorize different deployments, projects, commits or expired/incomplete evidence', async () => {
    const basePlatform = platform();
    for (const override of [ { vercelProjectId: 'bossa-crm' }, { deploymentId: 'dpl_Other' }, { deploymentOrigin: 'https://other.vercel.app' },
      { supabaseProjectRef: 'oridhneerxutcjsvwuju' }, { environmentId: 'wrong' }, { commit: '2'.repeat(40) }, { evidenceSha256: '' },
      { expiresAt: [new Date(Date.now() + 60000).toISOString()] }, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { issuedAt: new Date(Date.now() + 60000).toISOString() },
      { expiresAt: new Date(Date.now() + 86400001).toISOString() }, { checks: {} },
      ...Object.keys(basePlatform.checks).map(k => ({ checks: { ...basePlatform.checks, [k]: false } })) ]) {
      const r = await server.getHomologationPreflight(process.env, async () => Response.json({ ...database(), platformAttestation: receipt({ ...basePlatform, ...override }) }));
      assert.equal(r.writesAllowed, false);
    }
    const bad = receipt(); bad.signature = 'A'.repeat(bad.signature.length);
    assert.equal((await server.getHomologationPreflight(process.env, async () => Response.json({ ...database(), platformAttestation: bad }))).writesAllowed, false);
  });
  await check('real admin and user SDKs require fresh proof for each write and deny privileged/email/automation paths', async () => {
    setEnv(); let good = true; calls = [];
    globalThis.fetch = async (input, init) => { calls.push([String(input), init]); return Response.json(String(input).endsWith('/rpc/bossa_homologation_preflight') ? { ...database(), serviceRoleGuardsIntact: good } : []); };
    const { module: admin } = await load('src/lib/supabase/admin.ts');
    const { module: user } = await load('src/lib/supabase/server.ts', { 'next/headers': 'export async function cookies(){return {getAll:()=>[],set:()=>{}}}' });
    for (const db of [admin.createAdminClient(), await user.createClient()]) {
      assert.equal((await db.from('leads').update({ name: 'Fictitious' }).eq('id', '1')).error, null);
      assert.equal(calls.at(-1)[1].redirect, 'error');
      const before = calls.length;
      for (const rpc of ['next_client_handoff_owner', 'merge_duplicate_leads_batch', 'commercial_record_detected_proposal', 'enqueue_broker_performance', 'unknown']) assert.ok((await db.rpc(rpc, {})).error);
      assert.ok((await db.from('whatsapp_messages').insert({ body: 'blocked' })).error);
      assert.ok((await db.auth.admin.inviteUserByEmail('fictitious@example.invalid')).error);
      assert.equal(calls.length, before, 'unsafe service role requests never reached network');
      good = false;
      assert.ok((await db.from('leads').update({ name: 'Blocked' }).eq('id', '1')).error); assert.equal(calls.length, before + 1);
      good = true;
    }
    setEnv({ VERCEL_PROJECT_ID: 'bossa-crm' });
    assert.throws(() => admin.createAdminClient(), /PREFLIGHT_BLOCKED/); await assert.rejects(() => user.createClient(), /PREFLIGHT_BLOCKED/);
    setEnv();
  });
  await check('request policy denies Auth emails/admin, Storage, Edge Functions, schema swaps, unknown RPCs and redirects to production', () => {
    for (const path of ['/auth/v1/admin/users', '/auth/v1/recover', '/auth/v1/signup', '/auth/v1/invite', '/auth/v1/otp', '/auth/v1/authorize', '/functions/v1/nara', '/storage/v1/object/a', '/rest/v1/rpc/merge_duplicate_leads_batch']) {
      assert.throws(() => policy.assertRemoteSupabaseRequest(origin + path, { method: 'POST' }), /BLOCKED/);
    }
    assert.throws(() => policy.assertRemoteSupabaseRequest(origin + '/auth/v1/user', { method: 'PUT' }), /BLOCKED/);
    assert.throws(() => policy.assertRemoteSupabaseRequest(origin + '/rest/v1/leads', { headers: { 'Accept-Profile': 'auth' } }), /BLOCKED/);
    for (const header of ['Host', 'X-Forwarded-Host', 'X-HTTP-Method-Override']) assert.throws(() => policy.assertRemoteSupabaseRequest(origin + '/rest/v1/leads', { headers: { [header]: 'forbidden' } }), /BLOCKED/);
    assert.throws(() => policy.assertRemoteSupabaseRequest(origin + '/auth/v1/token?grant_type=password&grant_type=otp', { method: 'POST' }), /BLOCKED/);
    assert.throws(() => policy.assertRemoteSupabaseRequest('https://oridhneerxutcjsvwuju.supabase.co/rest/v1/leads'), /BLOCKED/);
    assert.throws(() => policy.assertRemoteSupabaseRequest(origin + '/rest/v1/rpc/bossa_homologation_preflight', { method: 'POST' }), /BLOCKED/);
    policy.assertRemoteSupabaseRequest(origin + '/auth/v1/token?grant_type=password', { method: 'POST' });
    policy.assertRemoteSupabaseRequest(origin + '/rest/v1/rpc/commercial_save_proposal_once', { method: 'POST' });
  });
  await check('real remote proxy permits reviewed journey with CSP and blocks integrations/admin for GET and action POSTs', async () => {
    setEnv(); globalThis.fetch = transport;
    const { module: proxy } = await load('src/proxy.ts', { '@/lib/supabase/proxy': 'export function updateSession(){return new Response("session",{status:200})}' });
    const requestHeaders = () => new Headers({ host: 'bossa-synthetic.vercel.app', 'next-action': 'x' });
    const allowed = await proxy.proxy({ nextUrl: { pathname: '/gestao' }, headers: requestHeaders() });
    assert.equal(allowed.status, 200); assert.match(allowed.headers.get('content-security-policy'), /connect-src 'self' https:\/\/okhtfibuexfsgkobjxtu.supabase.co\/rest\/v1\//);
    assert.ok(!allowed.headers.get('content-security-policy').includes('ws:'));
    for (const pathname of ['/api/automation/followup', '/api/automation/followup.png', '/api/users/invite', '/api/meta/whatsapp/webhook', '/api/microsoft/connect', '/api/leads/x/handoff', '/api/leads/x/ai', '/auth/callback', '/configuracoes', '/api/whatsapp/send']) {
      for (const method of ['GET', 'POST']) assert.equal((await proxy.proxy({ nextUrl: { pathname }, method, headers: requestHeaders() })).status, 403);
    }
    const beforeAlias = calls.length;
    assert.equal((await proxy.proxy({ nextUrl: { pathname: '/api/homologation/preflight' }, headers: new Headers({ host: 'other.vercel.app' }) })).status, 503);
    assert.equal(calls.length, beforeAlias, 'unknown alias cannot probe DB');
    globalThis.fetch = async () => Response.json({ ...database(), permissionsSafe: false });
    assert.equal((await proxy.proxy({ nextUrl: { pathname: '/gestao' }, method: 'POST', headers: requestHeaders() })).status, 503);
  });
  await check('real browser adapter enforces same build identity, current complete preflight and blocks email/provider requests', async () => {
    setEnv(); globalThis.window = { location: { hostname: 'bossa-synthetic.vercel.app', origin: base.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN } };
    const { module: browser } = await load('src/lib/homologation/browser.ts');
    const report = await server.getHomologationPreflight(process.env, transport); let overrides = {}; calls = [];
    globalThis.fetch = async (input, init) => { calls.push([String(input), init]); return Response.json(String(input).startsWith('/api/') ? { ...report, ...overrides } : []); };
    const options = browser.browserSupabaseOptions();
    await options.global.fetch(origin + '/rest/v1/leads', { method: 'PATCH' }); assert.equal(calls.length, 2);
    for (const override of [{ writesAllowed: false }, { commit: '2'.repeat(40) }, { environmentId: 'wrong' }, { vercelProjectId: 'bossa-crm' }, { checks: {} }, { humanAcceptanceAllowed: true }, { checkedAt: 'invalid' }, { attestationExpiresAt: 'invalid' }, { databaseOrigin: 'https://oridhneerxutcjsvwuju.supabase.co' }]) {
      overrides = override; const before = calls.length;
      await assert.rejects(() => options.global.fetch(origin + '/rest/v1/leads'), /PREFLIGHT_BLOCKED/); assert.equal(calls.length, before + 1);
    }
    overrides = {};
    const before = calls.length;
    await assert.rejects(() => options.global.fetch(origin + '/auth/v1/recover', { method: 'POST' }), /BLOCKED/); assert.equal(calls.length, before);
    window.location.origin = 'https://other.vercel.app'; assert.throws(() => browser.browserSupabaseOptions(), /BLOCKED/);
    delete globalThis.window;
    await assert.rejects(() => options.global.fetch(origin + '/rest/v1/leads'), /BLOCKED/);
  });
  await check('compiled build identities cannot be changed through runtime env', async () => {
    setEnv();
    const definitions = Object.fromEntries(['NEXT_PUBLIC_BOSSA_HOMOLOGATION', 'NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE', 'NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT', 'NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT', 'NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN', 'NEXT_PUBLIC_BOSSA_HOMOLOGATION_ENVIRONMENT_ID', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'BOSSA_HOMOLOGATION_BUILD_ATTESTATION_KEY'].map(k => ['process.env.' + k, JSON.stringify(base[k])]));
    const { module: pinned } = await load('src/lib/homologation/server.ts', {}, definitions);
    setEnv({ BOSSA_HOMOLOGATION_COMMIT: '2'.repeat(40), VERCEL_GIT_COMMIT_SHA: '2'.repeat(40), NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT: '2'.repeat(40) });
    let network = 0;
    assert.equal((await pinned.getHomologationPreflight(process.env, async () => { network++; return Response.json(database()); })).writesAllowed, false); assert.equal(network, 0);
    setEnv();
  });
  await check('Next build publishes only allowed test public identity and strips original project/inconsistent config', async () => {
    setEnv(); const { module: config } = await load('next.config.ts');
    assert.equal(config.default.env.NEXT_PUBLIC_SUPABASE_URL, origin); assert.equal(config.default.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT, project);
    assert.ok(!JSON.stringify(config.default.env).includes('synthetic-service'));
    for (const override of [{ VERCEL_PROJECT_ID: 'bossa-crm' }, { BOSSA_HOMOLOGATION_COMMIT: 'wrong' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://oridhneerxutcjsvwuju.supabase.co' }]) {
      setEnv(override); const { module: blocked } = await load('next.config.ts'); assert.equal(blocked.default.env.NEXT_PUBLIC_SUPABASE_URL, '');
    }
    setEnv();
  });
  await check('CLI has no default production/old preview target and validates explicit remote/local reports without network', async () => {
    setEnv();
    const report = await server.getHomologationPreflight(process.env, transport);
    const file = path.join(temp, 'cli-adapter.cjs');
    fs.writeFileSync(file, `globalThis.fetch=async(url,init)=>{if(init.redirect!=='error')throw Error('redirect');return Response.json(${JSON.stringify(report)})};`);
    const run = (args, overrides = {}) => spawnSync(process.execPath, ['--require', file, 'scripts/homologation/preflight.mjs', ...args], {
      env: { ...process.env, BOSSA_EXPECTED_COMMIT: base.VERCEL_GIT_COMMIT_SHA, BOSSA_HOMOLOGATION_PREVIEW_ORIGIN: base.NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN, ...overrides }, encoding: 'utf8' });
    assert.equal(run(['--remote']).status, 0);
    for (const [args, env] of [[[], {}], [['--remote', '--local-automated'], {}], [['--remote'], { BOSSA_EXPECTED_COMMIT: '' }],
      [['--remote'], { BOSSA_HOMOLOGATION_PREVIEW_ORIGIN: 'https://bossa-crm-git-feat-commercial-metrics-foundation-elos-os.vercel.app' }],
      [['--remote'], { BOSSA_HOMOLOGATION_PREVIEW_ORIGIN: 'https://other.vercel.app' }]]) assert.notEqual(run(args, env).status, 0);
    fs.writeFileSync(file, `globalThis.fetch=async()=>Response.json(${JSON.stringify({ ...report, status: 'local-automated-only', databaseOrigin: 'http://127.0.0.1:54521' })});`);
    assert.equal(run(['--local-automated']).status, 0);
  });
  await check('actual instrumentation installs process guard; raw HTTP/TLS/socket/Unix and service-role fetches cannot bypass proof', async () => {
    setEnv(); const { output } = await load('src/instrumentation.ts');
    const program = `const assert=require('node:assert/strict');let calls=[];let good=true;let socketCalls=0;const net=require('node:net'),tls=require('node:tls');net.Socket.prototype.connect=function(){socketCalls++;return this};tls.connect=function(){socketCalls++;return new net.Socket()};let proof=${JSON.stringify(database())};globalThis.fetch=async(input,init)=>{calls.push([String(input),init]);return Response.json(String(input).endsWith('/rpc/bossa_homologation_preflight')?{...proof,permissionsSafe:good}:[])};(async()=>{await require(${JSON.stringify(output)}).register();assert.equal(globalThis.__bossaHomologationNetworkGuard,'remote-supabase-https-v1');for(const f of [()=>require('node:http').request('http://example.com'),()=>require('node:https').request('${origin}/auth/v1/invite'),()=>require('node:net').connect(443,'example.com'),()=>require('node:tls').connect({host:'example.com',port:443}),()=>require('node:tls').connect({host:'okhtfibuexfsgkobjxtu.supabase.co',port:443,rejectUnauthorized:false}),()=>require('node:net').connect('/var/run/docker.sock')])assert.throws(f,/EGRESS_BLOCKED/);for(const u of ['https://graph.facebook.com/','https://graph.microsoft.com/','https://api.openai.com/','${origin}/auth/v1/invite','${origin}/functions/v1/nara','${origin}/rest/v1/rpc/next_client_handoff_owner'])await assert.rejects(()=>fetch(u,{method:'POST'}),/BLOCKED/);assert.equal(calls.length,0);require('node:tls').connect({host:'okhtfibuexfsgkobjxtu.supabase.co',servername:'okhtfibuexfsgkobjxtu.supabase.co',port:443,rejectUnauthorized:true}).destroy();assert.equal(socketCalls,1);await fetch('${origin}/rest/v1/leads',{method:'PATCH',headers:{apikey:'synthetic-service'}});assert.equal(calls.length,2);assert.equal(calls[1][1].redirect,'error');good=false;await assert.rejects(()=>fetch('${origin}/rest/v1/leads',{method:'PATCH'}),/BLOCKED/);assert.equal(calls.length,3);process.env.VERCEL_PROJECT_ID='bossa-crm';await assert.rejects(()=>fetch('${origin}/rest/v1/leads'),/BLOCKED/);assert.equal(calls.length,3)})().catch(e=>{console.error(e);process.exit(1)});`;
    const env = { ...process.env, NEXT_RUNTIME: 'nodejs' };
    const result = spawnSync(process.execPath, ['-e', program], { env, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  });
  console.log(`PASS ${count} remote isolation groups; synthetic adapters only; zero real network/deployments`);
} finally {
  globalThis.fetch = fetchBefore; delete globalThis.window; delete globalThis.__bossaHomologationNetworkGuard;
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved);
  fs.rmSync(temp, { recursive: true, force: true });
}
