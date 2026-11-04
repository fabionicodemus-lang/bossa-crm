import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { sourceRequestSetupSql, id, org, user, dev, unit } from './source-request-fixture.mjs';
import { sourceRequestFailure } from '../../src/lib/commercial/source-request.ts';

// SQL contract only. Real PostgREST retries and rendered recovery need a preview.
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const read = path => fs.readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
const patch = read('compatibility/20261022_rpc_http_conflicts.sql');
const data = { development_id: dev, unit_id: unit, lead_id: id(30), status: 'rascunho', list_price: 100000,
  proposed_price: 90000, discount_amount: 10000, payment_plan: { entry_total: 90000 },
  snapshot: { workflow_status: 'rascunho', client_name: 'Fixture', development_name: 'Fixture' } };
const items = [{ kind: 'entrada', quantity: 1, amount: 90000 }];
const metadata = () => q(`select proname,proowner,proacl,prosecdef,proconfig,
  pg_get_function_arguments(oid) args,pg_get_function_result(oid) result
  from pg_proc where pronamespace='public'::regnamespace
  and proname in ('commercial_save_proposal_once','commercial_proposal_status_once') order by proname`);
const snapshot = async () => {
  const result = {};
  for (const table of ['proposals', 'proposal_payment_items', 'activities', 'commercial_events', 'commercial_source_requests']) {
    result[table] = await q(`select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`);
  }
  return result;
};
let key = 18000;
let stale;
const staleCommand = async (kind, code) => {
  await q("select set_config('request.method','POST',false),set_config('request.path',$1,false)",
    [`/rpc/${kind === 'status' ? 'commercial_proposal_status_once' : 'commercial_save_proposal_once'}`]);
  const request = id(++key);
  const payload = kind === 'status'
    ? { data: { operation: 'status', workflow_status: 'aprovada', expected_version: stale.version },
      items: [], id: stale.id, expected_updated_at: stale.updated_at }
    : { data: { ...data, notes: 'Must not overwrite the winner' }, items, id: stale.id, expected_updated_at: stale.updated_at };
  const before = await snapshot();
  await q('select commercial_prepare_source_request($1,$2,$3,$4)', [org, request, 'proposals', payload]);
  const call = kind === 'status'
    ? () => q('select commercial_proposal_status_once($1,$2,$3,$4,$5,$6)',
      [org, request, stale.id, stale.updated_at, stale.version, 'aprovada'])
    : () => q('select commercial_save_proposal_once($1,$2,$3,$4,$5,$6)',
      [org, request, payload.data, items, stale.id, stale.updated_at]);
  await assert.rejects(call, error => {
    assert.equal(error.message, 'COMMERCIAL_SOURCE_CHANGED');
    assert.equal(error.code, code);
    assert.equal(sourceRequestFailure(error).status, 409);
    assert.equal(sourceRequestFailure(error).definiteRollback, true);
    return true;
  });
  assert.deepEqual(await snapshot(), before);
  const recovery = (await q('select commercial_get_source_recovery($1,$2) r', [org, request]))[0].r;
  assert.equal(recovery.state, 'pending');
  await q("select commercial_finish_source_recovery($1,$2,'abandon')", [org, request]);
};
try {
  for (const sql of sourceRequestSetupSql()) await db.exec(sql);
  await db.exec(read('migrations/20261021182758_commercial_recoverable_requests.sql'));
  await db.exec(read('migrations/20261021203000_commercial_proposal_status_once.sql'));
  // Optional private catalog/guard review. Private evidence stays outside Git.
  const privatePackage = process.env.BOSSA_H22_PRIVATE_PACKAGE;
  if (privatePackage) {
    const catalog = JSON.parse(fs.readFileSync(`${privatePackage}/final-catalog.json`, 'utf8'));
    const live = await q(`select oid::regprocedure::text signature,md5(prosrc) md5,prosecdef definer,
      proconfig path,has_function_privilege('anon',oid,'EXECUTE') anon,
      has_function_privilege('authenticated',oid,'EXECUTE') authenticated,
      has_function_privilege('service_role',oid,'EXECUTE') service
      from pg_proc where proname in ('commercial_save_proposal_once','commercial_proposal_status_once')`);
    for (const row of live) {
      const reviewed = catalog.functions.find(f => f.signature === row.signature);
      assert.ok(reviewed, 'Missing function in private catalog');
      for (const key of ['md5','definer','path','anon','authenticated','service']) assert.deepEqual(row[key], reviewed[key]);
    }
    const guard = fs.readFileSync(`${privatePackage}/atomic-route-guard.sql`, 'utf8');
    const start = guard.indexOf('CREATE FUNCTION public.h22_atomic_source_route_guard()');
    assert.ok(start > 0);
    // Local disposable fixture only: omit the managed-data installation precondition.
    await db.exec(guard.slice(start));
    console.log('PASS: private H2.2 function hashes and effective privileges match; financial route guard loaded only into disposable PGlite');
  }
  const route = async name => q("select set_config('request.method','POST',false),set_config('request.path',$1,false)", [`/rpc/${name}`]);
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('set role authenticated');
  await route('commercial_save_proposal_once');
  stale = (await q('select commercial_save_proposal_once($1,$2,$3,$4,$5,$6) r',
    [org, id(++key), data, items, null, null]))[0].r.record;
  await route('commercial_proposal_status_once');
  await q('select commercial_proposal_status_once($1,$2,$3,$4,$5,$6)',
    [org, id(++key), stale.id, stale.updated_at, stale.version, 'enviada']);
  assert.notEqual((await q('select updated_at from proposals where id=$1', [stale.id]))[0].updated_at, stale.updated_at);
  for (const kind of ['status', 'save']) await staleCommand(kind, '40001');
  console.log('PASS: both original real RPCs reproduce the incorrect serialization SQLSTATE');

  await db.exec('reset role');
  const beforeMetadata = await metadata();
  await db.exec(patch);
  await db.exec(patch);
  assert.deepEqual(await metadata(), beforeMetadata);
  await db.exec('set role authenticated');
  for (const kind of ['status', 'save']) await staleCommand(kind, 'PT409');
  console.log('PASS: both patched real RPCs reject stale writes with PT409, unchanged rows and pending recovery');

  await db.exec('reset role; begin');
  await db.exec('grant execute on function public.commercial_proposal_status_once(uuid,uuid,uuid,timestamptz,integer,text) to anon');
  await assert.rejects(() => db.exec(patch), /UNREVIEWED_CONFLICT_RPC/);
  await db.exec('rollback');
  assert.deepEqual(await metadata(), beforeMetadata);
  console.log('PASS: repeat preserves metadata/ACL and an unexpected effective permission rejects the patch transaction');
} finally {
  await db.close();
}
