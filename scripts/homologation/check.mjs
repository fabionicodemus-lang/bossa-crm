import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const repo = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bossa-isolation-'));
const require = createRequire(import.meta.url);
let checks = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => { checks++; console.log('PASS ' + name); });
async function load(file, stubs = {}, define = {}) {
  const output = path.join(temp, String(fs.readdirSync(temp).length) + '.cjs');
  await build({ entryPoints: [path.join(repo, file)], outfile: output, bundle: true, platform: 'node', format: 'cjs', define,
    tsconfig: path.join(repo, 'tsconfig.json'), logLevel: 'silent', plugins: [{ name: 'isolated-framework', setup(b) {
      b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : null);
      b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
    } }] });
  return require(output);
}
const saved = { ...process.env }, oldFetch = globalThis.fetch;
function setEnv(values = {}) {
  for (const key of Object.keys(process.env)) if (/^(BOSSA_|NEXT_PUBLIC_|VERCEL_|SUPABASE_|OPENAI_API_KEY|META_|MICROSOFT_|WHATSAPP_|FEATURE_|CRON_SECRET|NEXT_RUNTIME)/.test(key)) delete process.env[key];
  Object.assign(process.env, values);
}
const valid = { BOSSA_HOMOLOGATION_MODE: 'local', BOSSA_HOMOLOGATION_ENVIRONMENT_ID: '11111111-1111-4111-8111-111111111111',
  BOSSA_HOMOLOGATION_COMMIT: '1'.repeat(40), BOSSA_HOMOLOGATION_SUPABASE_URL: 'http://127.0.0.1:54521',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54521', BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY: 'synthetic-anon',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-anon', BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY: 'synthetic-service',
  FEATURE_DIRECT_WHATSAPP_CONNECTION: 'false', FEATURE_EMBEDDED_SIGNUP: 'false', NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP: 'false' };
const proof = () => ({ contractVersion: 1, environmentId: valid.BOSSA_HOMOLOGATION_ENVIRONMENT_ID, checkedAt: new Date().toISOString(),
  syntheticUsersOnly: true, requiredRolesReady: true, guardsIntact: true, schemaReady: true, zeroExternalEffects: true });
try {
  const policy = await load('src/lib/homologation/policy.ts'), server = await load('src/lib/homologation/server.ts');
  let calls = [];
  const transport = async (input, options) => { calls.push([String(input), options]); return Response.json(proof()); };
  await check('production target and inherited/unknown config refused before ANY network request', async () => {
    for (const override of [ { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production' },
      { BOSSA_HOMOLOGATION_SUPABASE_URL: 'https://' + policy.PRODUCTION_SUPABASE_REF + '.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'https://' + policy.PRODUCTION_SUPABASE_REF + '.supabase.co' },
      { BOSSA_HOMOLOGATION_SUPABASE_URL: 'https://unknown.supabase.co' }, { SUPABASE_SECRET_KEY: 'inherited' },
      { OPENAI_API_KEY: 'inherited' }, { WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64: 'inherited' }, { MICROSOFT_CLIENT_ID: 'inherited' },
      { FEATURE_EMBEDDED_SIGNUP: 'true' }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'wrong' }, { BOSSA_HOMOLOGATION_ENVIRONMENT_ID: '' } ]) {
      const before = calls.length;
      assert.equal((await server.getHomologationPreflight({ ...valid, ...override }, transport)).writesAllowed, false);
      assert.equal(calls.length, before);
    }
  });
  await check('local opt-in and configuration alone never authorize writes', async () => {
    assert.equal((await server.getHomologationPreflight(valid, transport)).writesAllowed, false); assert.equal(calls.length, 0);
  });
  globalThis.__bossaHomologationNetworkGuard = 'loopback-54521-3001-v1';
  await check('fresh database identity, synthetic roles and guards required; response errors never green', async () => {
    assert.equal((await server.getHomologationPreflight(valid, transport)).writesAllowed, true);
    assert.equal(calls.at(-1)[1].redirect, 'error');
    for (const override of [{ environmentId: 'wrong' }, { syntheticUsersOnly: false }, { requiredRolesReady: false },
      { guardsIntact: false }, { zeroExternalEffects: false }, { schemaReady: false }, { checkedAt: 'invalid' },
      { checkedAt: new Date(Date.now() - 60000).toISOString() }]) {
      assert.equal((await server.getHomologationPreflight(valid, async () => Response.json({ ...proof(), ...override }))).writesAllowed, false);
    }
    assert.equal((await server.getHomologationPreflight(valid, async () => new Response('private-error-secret', { status: 500 }))).writesAllowed, false);
    const failed = await server.getHomologationPreflight(valid, async () => { throw Error('private-token'); });
    assert.equal(failed.writesAllowed, false); assert.ok(!JSON.stringify(failed).includes('private-token'));
  });
  await check('real admin/server client constructors reject preview before SDK auth/network', async () => {
    setEnv({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: 'https://' + policy.PRODUCTION_SUPABASE_REF + '.supabase.co' });
    globalThis.fetch = async () => { throw Error('NETWORK_MUST_NOT_BE_USED'); };
    const admin = await load('src/lib/supabase/admin.ts');
    const user = await load('src/lib/supabase/server.ts', { 'next/headers': 'export async function cookies(){return {getAll:()=>[],set:()=>{}}}' });
    assert.throws(() => admin.createAdminClient(), /HOMOLOGATION_PREFLIGHT_BLOCKED/);
    await assert.rejects(() => user.createClient(), /HOMOLOGATION_PREFLIGHT_BLOCKED/);
  });
  await check('real SDK write requires fresh proof every time and cannot follow a redirect', async () => {
    setEnv(valid); calls = []; let good = true;
    globalThis.fetch = async (input, options) => {
      calls.push([String(input), options]);
      if (String(input).endsWith('/rpc/bossa_homologation_preflight')) return Response.json({ ...proof(), guardsIntact: good });
      return Response.json([]);
    };
    const admin = await load('src/lib/supabase/admin.ts');
    const db = admin.createAdminClient();
    assert.equal((await db.from('leads').update({ name: 'Fictitious' }).eq('id', '1')).error, null);
    assert.equal(calls.length, 2); assert.equal(calls[1][1].redirect, 'error');
    assert.equal(calls[1][1].headers.get('apikey'), 'synthetic-service');
    good = false;
    assert.ok((await db.from('leads').update({ name: 'Blocked' }).eq('id', '1')).error);
    assert.equal(calls.length, 3, 'second write never reached database');
    assert.throws(() => policy.assertLocalSupabaseRequest('http://127.0.0.1:54521/auth/v1/admin/users'), /BLOCKED/);
    assert.throws(() => policy.assertLocalSupabaseRequest('http://127.0.0.1:54521/auth/v1/recover'), /BLOCKED/);
  });
  await check('actual proxy denies GET/POST, action headers and extension/encoding bypass before session', async () => {
    const proxy = await load('src/proxy.ts', { '@/lib/supabase/proxy': 'export function updateSession(){throw Error("SESSION_MUST_NOT_BE_USED")}' });
    setEnv({ VERCEL_ENV: 'preview' });
    for (const pathname of ['/login', '/crm-theme.js', '/api/automation/followup', '/api/automation/followup.png', '/api/meta/whatsapp/webhook', '/api/microsoft/connect', '/auth/callback', '/_next/static/x.js']) {
      for (const method of ['GET', 'POST']) {
        const result = await proxy.proxy({ nextUrl: { pathname }, method, headers: new Headers({ 'next-action': 'fake' }) });
        assert.equal(result.status, 503); assert.equal(result.headers.get('cache-control'), 'no-store');
      }
    }
    for (const p of ['/api/automation/%66ollowup', '/api/whatsapp/send', '/api/users/invite', '/api/leads/x/handoff', '/api/leads/x/ai', '/api/transmissoes/x/send', '/api/agenda.png', '/api/agenda%252fautomation']) assert.equal(policy.isAllowedHomologationPath(p), false, p);
    setEnv(valid);
    globalThis.fetch = transport;
    const theme = await proxy.proxy({ nextUrl: { pathname: '/crm-theme.js' } });
    assert.equal(theme.status, 200); assert.equal(theme.headers.get('location'), null);
    assert.match(theme.headers.get('content-security-policy'), /default-src 'self'/);
  });
  await check('actual browser fetch adapter refuses non-lab, absent/stale preflight and production build identity', async () => {
    setEnv({ ...valid, NEXT_PUBLIC_BOSSA_HOMOLOGATION: 'required', NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT: valid.BOSSA_HOMOLOGATION_COMMIT });
    globalThis.window = { location: { hostname: '127.0.0.1' } };
    const browser = await load('src/lib/homologation/browser.ts');
    let green = true; calls = [];
    globalThis.fetch = async (input, options) => { calls.push([String(input), options]); return Response.json(String(input).startsWith('/api/') ? {
      writesAllowed: green, status: 'local-automated-only', databaseOrigin: valid.NEXT_PUBLIC_SUPABASE_URL, commit: valid.BOSSA_HOMOLOGATION_COMMIT,
    } : []); };
    const options = browser.browserSupabaseOptions();
    await options.global.fetch(valid.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/leads', { method: 'PATCH' }); assert.equal(calls.length, 2);
    green = false;
    await assert.rejects(() => options.global.fetch(valid.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/leads', { method: 'PATCH' }), /PREFLIGHT_BLOCKED/); assert.equal(calls.length, 3);
    await assert.rejects(() => options.global.fetch('https://' + policy.PRODUCTION_SUPABASE_REF + '.supabase.co/rest/v1/leads', { method: 'PATCH' }), /EGRESS_BLOCKED/); assert.equal(calls.length, 3);
    window.location.hostname = 'preview.vercel.app'; assert.throws(() => browser.browserSupabaseOptions(), /PREFLIGHT_BLOCKED/);
    delete globalThis.window;
    const ssr = browser.browserSupabaseOptions();
    await assert.rejects(() => ssr.global.fetch(valid.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/leads'), /PREFLIGHT_BLOCKED/);
    assert.equal(calls.length, 3, 'SSR construction cannot cause network I/O');
  });
  await check('normal production SDK and proxy retain existing behavior', async () => {
    setEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'dummy-build-only' });
    assert.equal(server.serverSupabaseOptions(), null); assert.equal(policy.isHomologation(), false);
    const proxy = await load('src/proxy.ts', { '@/lib/supabase/proxy': 'export function updateSession(){return new Response("session",{status:200})}' });
    const result = await proxy.proxy({ nextUrl: { pathname: '/hoje' } }); assert.equal(await result.text(), 'session');
  });
  await check('Preview build strips inherited public production configuration; production build preserves it', async () => {
    setEnv({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: 'https://' + policy.PRODUCTION_SUPABASE_REF + '.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'inherited-public-key' });
    const preview = (await load('next.config.ts')).default.env;
    assert.equal(preview.NEXT_PUBLIC_SUPABASE_URL, ''); assert.equal(preview.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, '');
    assert.equal(preview.NEXT_PUBLIC_BOSSA_HOMOLOGATION, 'required');
    setEnv({ VERCEL_ENV: 'production' });
    const production = (await load('next.config.ts')).default.env;
    assert.equal(production.NEXT_PUBLIC_BOSSA_HOMOLOGATION, 'off');
    assert.equal('NEXT_PUBLIC_SUPABASE_URL' in production, false);
  });
  await check('protected build cannot be unlocked by deleting or changing runtime context', async () => {
    setEnv({ VERCEL_ENV: 'production' });
    const protectedBuild = await load('src/lib/homologation/server.ts', {}, {
      'process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION': JSON.stringify('required'),
    });
    let network = 0;
    const p = await protectedBuild.getHomologationPreflight(process.env, async () => { network++; return Response.json(proof()); });
    assert.equal(p.writesAllowed, false); assert.ok(p.blockers.includes('managed-platform-isolation-not-attested'));
    assert.equal(network, 0); assert.throws(() => protectedBuild.serverSupabaseOptions(true), /PREFLIGHT_BLOCKED/);
    const absent = await protectedBuild.getHomologationPreflight({}, async () => { network++; return Response.json(proof()); });
    assert.equal(absent.writesAllowed, false); assert.ok(absent.blockers.includes('local-isolation-mode-required')); assert.equal(network, 0);
  });
  await check('instrumentation blocks provider fetch in Preview before transport, preserving production branch', async () => {
    setEnv({ VERCEL_ENV: 'preview', NEXT_RUNTIME: 'nodejs' }); let network = 0;
    globalThis.fetch = async () => { network++; return Response.json({}); };
    const instrument = await load('src/instrumentation.ts'); await instrument.register();
    for (const url of ['https://graph.facebook.com', 'https://api.openai.com/v1/responses', 'https://graph.microsoft.com', 'https://example.com']) await assert.rejects(() => fetch(url), /EGRESS_BLOCKED/);
    assert.equal(network, 0);
  });
  await check('mandatory local preloader blocks fetch, http, raw socket, TLS and Unix socket egress', () => {
    const program = `const assert=require('node:assert/strict');(async()=>{for(const u of ['https://graph.facebook.com/','https://graph.microsoft.com/','https://api.openai.com/'])await assert.rejects(()=>fetch(u),/EGRESS_BLOCKED/);for(const f of [()=>require('node:http').request('http://example.com/'),()=>require('node:net').connect(443,'example.com'),()=>require('node:tls').connect({host:'example.com',port:443}),()=>require('node:net').connect('/var/run/docker.sock')])assert.throws(f,/EGRESS_BLOCKED/);assert.equal(globalThis.__bossaHomologationNetworkGuard,'loopback-54521-3001-v1');})().catch(e=>{console.error(e);process.exit(1)});`;
    const r = spawnSync(process.execPath, ['--require', path.join(repo, 'scripts/homologation/egress.cjs'), '-e', program], { env: { ...saved, BOSSA_HOMOLOGATION_MODE: 'local', VERCEL_ENV: '' }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
  console.log(`PASS ${checks} isolation checks; no request to production, no human acceptance executed`);
} finally {
  globalThis.fetch = oldFetch; delete globalThis.__bossaHomologationNetworkGuard;
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved);
  fs.rmSync(temp, { recursive: true, force: true });
}
