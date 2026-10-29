import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Run the actual handler with session-scoped data and transports that fail on egress.
const fixture = { role: 'comercial', org: 'org-a', leadOrg: 'org-a', isolated: true,
  authenticated: true, failTable: null, adminCalls: 0, fetchCalls: 0 };
globalThis.__manualDetail = fixture;
const result = await build({
  entryPoints: ['src/app/api/leads/[id]/detail/route.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'session-bound-fixture', setup(builder) {
    builder.onResolve({ filter: /^(next\/server|@\/lib\/(auth|supabase\/(server|admin)))$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\/lib\/homologation\/policy$/ }, () => ({ path: `${process.cwd()}/src/lib/homologation/policy.ts` }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'next/server'
      ? 'export const NextResponse = Response;'
      : path === '@/lib/auth'
        ? `export async function getCurrentContext() { const f=globalThis.__manualDetail; return f.authenticated ? { role:f.role, organization:{id:f.org} } : null; }`
        : path === '@/lib/supabase/admin'
          ? `export function createAdminClient() { const f=globalThis.__manualDetail; f.adminCalls++; if(f.isolated) throw Error('Administrative access forbidden'); return {from:()=>({select(){return this},eq(){return this},then(resolve){resolve({count:1,error:null})}})}; }`
          : `export async function createClient() { return {from(table) {
            const filters={}; const q={ select(){return q},eq(k,v){filters[k]=v;return q},order(){return q},limit(){return q},maybeSingle(){return q},then(resolve){
              const f=globalThis.__manualDetail;
              if(filters.organization_id!==f.org) throw Error('Missing organization scope');
              const data=table==='leads' ? (f.org===f.leadOrg ? {id:'lead',kind:'cliente',archived_at:null} : null) : [];
              resolve({data,error:f.failTable===table ? {message:'Unavailable'} : null});
            }};return q;
          }}; }`, loader: 'js' }));
  } }],
});
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const oldFetch = globalThis.fetch;
const savedEnv = { ...process.env };
globalThis.fetch = async () => { fixture.fetchCalls++; throw Error('External transport forbidden'); };
const request = () => GET(new Request('http://localhost/api/leads/lead/detail'), { params: Promise.resolve({ id: 'lead' }) });
try {
  delete process.env.VERCEL_PROJECT_ID;
  delete process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION;
  process.env.BOSSA_HOMOLOGATION_MODE = 'remote';
  for (const role of ['admin', 'comercial', 'viewer']) {
    fixture.role = role;
    const response = await request();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.canEdit, role !== 'viewer');
    assert.equal(data.whatsappConnected, false);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  fixture.org = 'org-b';
  assert.equal((await request()).status, 404);
  fixture.org = 'org-a'; fixture.authenticated = false;
  assert.equal((await request()).status, 401);
  fixture.authenticated = true; fixture.failTable = 'activities';
  assert.equal((await request()).status, 500);
  fixture.failTable = null;
  assert.equal(fixture.adminCalls, 0);
  assert.equal(fixture.fetchCalls, 0);
  delete process.env.BOSSA_HOMOLOGATION_MODE;
  delete process.env.VERCEL_ENV;
  fixture.isolated = false;
  const production = await request();
  assert.equal(production.status, 200);
  assert.equal((await production.json()).whatsappConnected, true);
  assert.equal(fixture.adminCalls, 1);
  console.log('PASS: manual detail for admin/comercial/viewer, foreign organization, expired session, partial failure, zero egress/admin calls in isolation, production connection lookup preserved. Session adapters; not remote H2.2 acceptance.');
} finally {
  globalThis.fetch = oldFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  delete globalThis.__manualDetail;
}
