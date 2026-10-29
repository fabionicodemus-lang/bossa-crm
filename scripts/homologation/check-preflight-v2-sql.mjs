// Disposable catalog/evidence fixture. No managed database, real receipt or signing.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { authAudit, databaseAudit } from './contract-fixture.mjs';
const db = new PGlite();
const q = async (sql,args=[]) => (await db.query(sql,args)).rows;
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid,email text);revoke all on schema auth from public;
    create table public.business_fixture(id integer primary key, value text);insert into business_fixture values(1,'preserve');
    alter table business_fixture enable row level security;`);
  const beforePolicies = await q('select * from pg_policies');
  const beforeAuthAcl = await q("select nspacl from pg_namespace where nspname='auth'");
  const beforePublicAcl = await q("select nspacl from pg_namespace where nspname='public'");
  const candidate = fs.readFileSync('scripts/homologation/preflight-v2-candidate.sql','utf8');
  await db.exec(candidate);
  assert.deepEqual(await q('select * from pg_policies'), beforePolicies);
  assert.deepEqual(await q("select nspacl from pg_namespace where nspname='auth'"), beforeAuthAcl);
  assert.deepEqual(await q("select nspacl from pg_namespace where nspname='public'"), beforePublicAcl);
  const fingerprint = (await q('select bossa_preflight.catalog_fingerprint() f'))[0].f;
  const hashes = await q("select proname,md5(prosrc) h from pg_proc where proname in ('bossa_homologation_preflight','catalog_fingerprint')");
  const auth = authAudit(), audit = databaseAudit();audit.catalogFingerprint=fingerprint;
  const normalizedUsers = auth.users.map(({id,email,organizationId,appRole})=>({id,email,organizationId,appRole})).sort((a,b)=>a.id.localeCompare(b.id));
  const environmentId = '11111111-1111-4111-8111-111111111111';
  await q('insert into bossa_preflight.reference values(true,$1,$2,$3,$4,$5,$6,$7,$8)', [environmentId,'okhtfibuexfsgkobjxtu',fingerprint, audit.migrations,normalizedUsers,audit.emptyRelations.map(x=>x.name).sort(),hashes.find(x=>x.proname==='bossa_homologation_preflight').h,hashes.find(x=>x.proname==='catalog_fingerprint').h]);
  const call = async role => {
    await db.exec(`set role ${role}`);
    try {return (await q('select public.bossa_homologation_preflight() proof'))[0].proof;}
    finally {await db.exec('reset role');}
  };
  for(const role of ['anon','authenticated']) await assert.rejects(()=>call(role),e=>e.code==='42501');
  assert.equal((await call('service_role')).syntheticUsersOnly,false);
  assert.equal((await call('service_role')).platformAttestation,null);
  const receipt = {contractVersion:2,issuer:'fixture-only',environmentId,supabaseProjectRef:'okhtfibuexfsgkobjxtu',issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),authAudit:auth,databaseAudit:audit,checks:Object.fromEntries(['networkEgressRestricted','externalIntegrationsDisabled','cronDisabled','webhooksDisabled','authEmailDisabled','functionsDisabled','storageEffectsDisabled'].map(k=>[k,true]))};
  const installFixture = async value => {
    await q('insert into bossa_preflight.receipt values(true,$1,$2,null) on conflict(singleton) do update set payload=excluded.payload,signature=excluded.signature,revoked_at=null',[JSON.stringify(value),'A'.repeat(86)]);
  };
  await installFixture(receipt);
  const beforeRows = await q('select * from public.business_fixture');
  const positive = await call('service_role');
  for (const key of ['syntheticUsersOnly','requiredRolesReady','schemaReady','permissionsSafe','guardsIntact','serviceRoleGuardsIntact','authEmailBlocked','zeroExternalEffects']) assert.equal(positive[key],true,key);
  // This fake SQL boundary envelope MUST NOT be accepted as cryptographic evidence.
  assert.equal(positive.platformAttestation.signature,'A'.repeat(86));
  assert.equal(Buffer.from(positive.platformAttestation.payload,'base64url').toString('utf8'),JSON.stringify(receipt));
  await db.exec('begin read only; set local role service_role');
  assert.equal((await q('select public.bossa_homologation_preflight() proof'))[0].proof.schemaReady,true);
  await db.exec('rollback');
  assert.deepEqual(await q('select * from public.business_fixture'),beforeRows);
  assert.equal((await q("select rolbypassrls from pg_roles where rolname='bossa_preflight_owner'"))[0].rolbypassrls,false);
  await db.exec('set role bossa_preflight_owner');
  await assert.rejects(()=>q('select * from auth.users'),e=>e.code==='42501');
  await assert.rejects(()=>q('select * from business_fixture'),e=>e.code==='42501');
  await assert.rejects(()=>q("update bossa_preflight.receipt set revoked_at=now()"),e=>e.code==='42501');
  await db.exec('reset role');
  await db.exec('grant usage on schema auth to bossa_preflight_owner');
  assert.equal((await call('service_role')).permissionsSafe,false);
  await db.exec('revoke usage on schema auth from bossa_preflight_owner');
  await db.exec('grant update(revoked_at) on bossa_preflight.receipt to service_role');
  assert.equal((await call('service_role')).permissionsSafe,false);
  await db.exec('revoke update(revoked_at) on bossa_preflight.receipt from service_role');
  await db.exec('grant bossa_preflight_owner to authenticated');
  assert.equal((await call('service_role')).permissionsSafe,false);
  await db.exec('revoke bossa_preflight_owner from authenticated');
  for (const mutate of [
    x=>{x.authAudit.users[0].isAnonymous=true;},x=>{x.authAudit.users[0].email='real@example.com';},
    x=>{x.authAudit.expiresAt=new Date(Date.now()-1).toISOString();},
    x=>{x.authAudit.users[0].appRole='viewer';},x=>{x.databaseAudit.migrations.pop();},
    x=>{x.databaseAudit.emptyRelations[0].count=1;},x=>{x.environmentId='22222222-2222-4222-8222-222222222222';},
  ]) {
    const changed=structuredClone(receipt);mutate(changed);await installFixture(changed);
    const p=await call('service_role');
    assert.ok(!p.syntheticUsersOnly||!p.requiredRolesReady||!p.schemaReady||!p.zeroExternalEffects);
  }
  await installFixture(receipt);await q('update bossa_preflight.receipt set revoked_at=now()');
  assert.equal((await call('service_role')).platformAttestation,null);
  await installFixture(receipt);await db.exec("alter table business_fixture add column unexpected text");
  assert.equal((await call('service_role')).guardsIntact,false);
  console.log('PASS candidate SQL: limited owner, no Auth/business access or RLS changes, service-only RPC, fresh observed fixtures, no side effects, absent/revoked/expired/changed evidence and catalog drift fail closed. Fixture envelopes are not signed and never authorize managed access.');
} finally {await db.close();}
