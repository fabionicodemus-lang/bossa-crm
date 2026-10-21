import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parseIntentInput } from '../../src/lib/commercial/intake.ts';
import { schemaSQL, seedSQL, migrations, id, org, other, user, viewer, broker, dev, unit, otherUnit } from './intake-fixture.mjs';
const db = new PGlite();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS intent ${checks}: ${name}`); }
async function reject(fn, message) { await assert.rejects(fn, new RegExp(message)); }
const revisionOf = (s) => s.updated_at instanceof Date ? s.updated_at.toISOString() : s.updated_at;
const title = 'Compra familiar conferida', next = 'Confirmar próxima visita', evidence = 'Intenção conferida na conversa e no documento desta origem.';
const args = (s, buyer, entity = 'proposals') => [org, entity, s.id, buyer, title, next, evidence, revisionOf(s), true];
const create = async (a) => (await q('select commercial_create_verified_intent($1,$2,$3,$4,$5,$6,$7,$8,$9) result', a))[0].result;
const proposal = async (buyer, options = {}) => (await q("insert into proposals(organization_id,lead_id,development_id,unit_id,status,proposed_price,snapshot) values($1,$2,$3,$4,$5,100000,$6) returning *", [options.org ?? org,buyer,dev,options.unit ?? unit,options.status ?? 'rascunho',JSON.stringify(options.snapshot ?? {})]))[0];
const opportunityCount = async () => Number((await q('select count(*) n from commercial_opportunities where organization_id=$1', [org]))[0].n);
try {
 await db.exec(schemaSQL);
 for (const file of migrations) await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
 await db.exec(seedSQL);
 await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
 await db.exec('set role authenticated');
 const source = await proposal(id(20), { status: 'enviada', snapshot: { auto_detected: true, source: 'whatsapp_commercial_intelligence' } });
 let created;
 await test('creation, link, interest, reviewer and confirmed-intent event are recorded together', async () => {
  created = await create(args(source,id(20)));
  assert.equal(created.created,true);
  const [o] = await q('select * from commercial_opportunities where id=$1',[created.opportunity_id]);
  assert.equal(o.stage,'contact'); assert.equal(o.owner_id,user); assert.equal(o.primary_contact_id,id(20));
  assert.equal(o.history_complete,false); assert.equal(o.source,null);
  assert.equal((await q('select opportunity_id from proposals where id=$1',[source.id]))[0].opportunity_id,o.id);
  assert.equal((await q('select unit_id from commercial_interests where opportunity_id=$1',[o.id]))[0].unit_id,unit);
  const [audit] = await q('select * from commercial_intent_confirmations where entity_id=$1',[source.id]);
  assert.equal(audit.confirmed_by,user); assert.equal(audit.source_snapshot.status,'enviada');
  assert.equal((await q("select count(*) n from commercial_events where opportunity_id=$1 and event_type='intent_confirmed'",[o.id]))[0].n,1);
 });
 await test('AI detection is not promoted to a sent proposal, qualified lead, contract or receipt', async () => {
  const facts = await q("select metric from commercial_facts($1) where opportunity_id=$2",[org,created.opportunity_id]);
  assert.deepEqual(facts.map(f=>f.metric),['new']);
 });
 await test('same source replay is idempotent even after the source timestamp changes', async () => {
  const before = await opportunityCount();
  const replay = await create(args(source,id(20)));
  assert.equal(replay.created,false); assert.equal(replay.opportunity_id,created.opportunity_id);
  assert.equal(await opportunityCount(),before);
 });
 await test('same origin with different evidence is rejected', async () => { const a=args(source,id(20)); a[6]+=' Outra afirmação.'; await reject(()=>create(a),'INTAKE_REPLAY_CONFLICT'); });
 await test('a second source for the same buyer cannot create another open intention', async () => { const s=await proposal(id(20)); await reject(()=>create(args(s,id(20))),'INTAKE_EXISTING'); });
 await test('nurture blocks accidental duplication', async () => {
  await q("update commercial_opportunities set stage='nurture' where id=$1",[created.opportunity_id]);
  const s=await proposal(id(20)); await reject(()=>create(args(s,id(20))),'INTAKE_EXISTING');
 });
 await test('documented spouse counts as an existing intention', async () => {
  await q("insert into commercial_participants values($1,$2,$3,'spouse')",[org,created.opportunity_id,id(21)]);
  const s=await proposal(id(21)); await reject(()=>create(args(s,id(21))),'INTAKE_EXISTING');
 });
 await test('broker requires a real active buyer and is linked explicitly', async () => {
  const s=await proposal(broker); const result=await create(args(s,id(22)));
  const [o]=await q('select primary_contact_id,broker_id from commercial_opportunities where id=$1',[result.opportunity_id]);
  assert.equal(o.primary_contact_id,id(22)); assert.equal(o.broker_id,broker);
 });
 await test('broker cannot masquerade as buyer', async () => { const s=await proposal(broker); await reject(()=>create(args(s,broker)),'INTAKE_BUYER'); });
 await test('client source cannot select an unrelated client', async () => { const s=await proposal(id(23)); await reject(()=>create(args(s,id(24))),'INTAKE_BUYER'); });
 await test('archived buyer is rejected', async () => { const s=await proposal(id(25)); await q('update leads set archived_at=now() where id=$1',[id(25)]); await reject(()=>create(args(s,id(25))),'INTAKE_BUYER'); });
 await test('cross-organization buyer is rejected without writing', async () => { const s=await proposal(broker); await reject(()=>create(args(s,id(91))),'INTAKE_BUYER'); });
 await test('stale source is rejected', async () => { const s=await proposal(id(26)); await q('update proposals set proposed_price=99000 where id=$1',[s.id]); await reject(()=>create(args(s,id(26))),'INTAKE_STALE'); });
 await test('cancelled proposal is rejected', async () => { const s=await proposal(id(27),{status:'cancelada'}); await reject(()=>create(args(s,id(27))),'INTAKE_CLOSED'); });
 await test('future visit can create a reviewed intention without recording completion', async () => {
  const [s]=await q("insert into agenda_events(organization_id,lead_id,title,starts_at,ends_at,event_type,created_by_kind) values($1,$2,'Visita',now()+interval '1 day',now()+interval '25 hours','visita','ai') returning *",[org,id(28)]);
  const result=await create(args(s,id(28),'agenda_events'));
  const [visit]=await q('select status,visit_outcome from agenda_events where id=$1',[s.id]);
  assert.equal(visit.status,'scheduled'); assert.equal(visit.visit_outcome,null);
  assert.equal((await q("select count(*) n from commercial_facts($1) where opportunity_id=$2 and metric='visits'",[org,result.opportunity_id]))[0].n,0);
 });
 await test('past visit cannot be reintroduced as a new intention by this shortcut', async () => {
  const [s]=await q("insert into agenda_events(organization_id,lead_id,status,starts_at,event_type) values($1,$2,'completed',now()-interval '1 day','visita') returning *",[org,id(29)]);
  await reject(()=>create(args(s,id(29),'agenda_events')),'INTAKE_CLOSED');
 });
 await test('unsupported source type is rejected before dynamic SQL', async () => { const a=args(source,id(20)); a[1]='proposals;drop table leads'; await reject(()=>create(a),'INTAKE_INVALID'); });
 await test('explicit human confirmation and minimum evidence are mandatory', async () => {
  const s=await proposal(id(30)); const a=args(s,id(30)); a[8]=false; await reject(()=>create(a),'INTAKE_INVALID');
  a[8]=true; a[6]='breve'; await reject(()=>create(a),'INTAKE_INVALID');
 });
 await test('invalid unit/development causes complete rollback, not an orphan opportunity', async () => {
  const s=await proposal(id(31),{unit:otherUnit}); const before=await opportunityCount();
  await reject(()=>create(args(s,id(31))),'Unit does not belong'); assert.equal(await opportunityCount(),before);
  assert.equal((await q('select opportunity_id from proposals where id=$1',[s.id]))[0].opportunity_id,null);
  assert.equal((await q('select count(*) n from commercial_intent_confirmations where entity_id=$1',[s.id]))[0].n,0);
 });
 await test('source cannot be deleted or reassigned after confirmation, including direct SQL', async () => {
  await reject(()=>q('delete from proposals where id=$1',[source.id]),'INTAKE_PRESERVE_SOURCE');
  await reject(()=>q('update proposals set lead_id=$1 where id=$2',[id(24),source.id]),'INTAKE_PRESERVE_SOURCE');
  await reject(()=>q('update proposals set opportunity_id=null where id=$1',[source.id]),'INTAKE_PRESERVE_SOURCE');
 });
 await test('confirmation evidence is append-only', async () => {
  await reject(()=>q("update commercial_intent_confirmations set evidence='forged' where entity_id=$1",[source.id]),'permission denied|Append-only');
  await reject(()=>q('delete from commercial_intent_confirmations where entity_id=$1',[source.id]),'permission denied|Append-only');
 });
 await test('existing source status remains unchanged and no global auto-link is enabled', async () => {
  assert.equal((await q('select status from proposals where id=$1',[source.id]))[0].status,'enviada');
  assert.equal((await q('select auto_link_enabled from commercial_settings where organization_id=$1',[org]))[0].auto_link_enabled,false);
 });
 await test('reviewer role is authoritative, not a request field', async () => {
  const s=await proposal(id(32)); const a=args(s,id(32));
  await q("select set_config('request.jwt.claim.sub',$1,false)",[viewer]);
  await reject(()=>create(a),'INTAKE_FORBIDDEN');
  await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 });
 await test('other organization has no visible audit rows and cannot invoke intake', async () => {
  assert.deepEqual(await q('select * from commercial_intent_confirmations where organization_id=$1',[other]),[]);
  const a=args(source,id(20)); a[0]=other; await reject(()=>create(a),'INTAKE_FORBIDDEN');
 });
 await test('service role without a human cannot invoke human confirmation', async () => {
  await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role service_role');
  await reject(()=>create(args(source,id(20))),'permission denied');
  await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub',$1,false)",[user]); await db.exec('set role authenticated');
 });
 await test('new API uses invoker permissions and audit table has RLS', async () => {
  const [f]=await q("select prosecdef,proconfig from pg_proc where proname='commercial_create_verified_intent'");
  assert.equal(f.prosecdef,false); assert.ok(f.proconfig.includes('search_path=public'));
  assert.equal((await q("select relrowsecurity from pg_class where relname='commercial_intent_confirmations'"))[0].relrowsecurity,true);
 });
 await test('form validation keeps timestamp precision and rejects missing confirmation', async () => {
  const raw={entity_type:'proposals',entity_id:id(400),buyer_id:id(20),title,next_action:next,evidence,revision:'2026-10-21T12:00:00.123456+00:00',confirmed:'yes'};
  assert.equal(parseIntentInput(raw)?.revision,raw.revision);
  for (const change of [{confirmed:'on'},{buyer_id:'bad'},{entity_type:'leads'},{revision:'tomorrow'},{title:'x'},{evidence:'short'},{next_action:''},{title:'x'.repeat(201)}]) assert.equal(parseIntentInput({...raw,...change}),null);
 });
 console.log(`PASS: ${checks} verified-intent scenarios with real PostgreSQL semantics in PGlite; independent multi-connection concurrency is tested separately.`);
} finally { await db.close(); }
