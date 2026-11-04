import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { integritySetupSql,id,org,other,user,viewer,dev,unit } from './integrity-fixture.mjs';
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
let count=0;
const test=async(name,fn)=>{await fn(); console.log(`PASS integrity ${++count}: ${name}`);};
const rejected=async(fn,pattern)=>assert.rejects(fn,new RegExp(pattern));
const human=async(uid=user)=>{await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]); await db.exec('set role authenticated');};
const service=async()=>{await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role service_role');};
const merge=async(keep,dup)=>(await q('select merge_duplicate_lead($1,$2) result',[keep,dup]))[0].result;
const preflight=async(keep,dup)=>(await q('select commercial_merge_preflight($1,$2) result',[keep,dup]))[0].result;
const purchase=async(buyer,broker=null)=>(await q("insert into commercial_opportunities(organization_id,title,primary_contact_id,broker_id,stage) values($1,'Compra documentada',$2,$3,'contact') returning *",[org,buyer,broker]))[0];
const source=async(buyer,opportunity=null)=>(await q("insert into proposals(organization_id,lead_id,opportunity_id,development_id,unit_id,status,proposed_price) values($1,$2,$3,$4,$5,'rascunho',100000) returning *",[org,buyer,opportunity,dev,unit]))[0];
const paired=async(a,b,kind='cliente')=>{
 await db.exec('reset role');
 await q("update leads set phone=$1,kind='cliente' where id=$2",[`554799${String(a).padStart(7,'0')}`,id(a)]);
 await q('update leads set phone=$1,kind=$2,archived_at=now() where id=$3',[`554799${String(a).padStart(7,'0')}`,kind,id(b)]);
 await human();
};
try {
 for(const sql of integritySetupSql()) await db.exec(sql);
 await service();
 await test('ordinary pre-ledger duplicate still uses the real legacy merge transaction',async()=>{
  assert.equal((await preflight(id(20),id(21))).can_merge,true);
  const r=await merge(id(20),id(21)); assert.equal(r.ok,true);
  for(const [table,row] of [['messages',800],['proposals',801],['agenda_events',802],['activities',803]]) {
   assert.equal((await q(`select lead_id from ${table} where id=$1`,[id(row)]))[0].lead_id,id(20));
  }
 });
 await test('repeating a completed legacy merge does not transfer or append again',async()=>{
  const before=(await q('select count(*) n from activities'))[0].n;
  const r=await merge(id(20),id(21)); assert.equal(r.ok,true); assert.equal(r.idempotent,true);
  assert.equal((await q('select count(*) n from activities'))[0].n,before);
 });
 await test('empty phone keys never authorize automatic merging',async()=>{
  assert.equal((await preflight(id(22),id(23))).reason,'identity_mismatch');
  assert.equal((await merge(id(22),id(23))).ok,false);
 });
 await paired(24,25,'corretor'); await service();
 await test('client versus broker classification conflict is left unchanged',async()=>{
  const r=await merge(id(24),id(25)); assert.equal(r.review_required,true); assert.equal(r.reason,'classification_conflict');
  assert.equal((await q('select metadata from leads where id=$1',[id(25)]))[0].metadata.merged_into,undefined);
 });
 await test('different organizations, missing IDs and identical IDs are refused',async()=>{
  for(const [a,b] of [[id(24),id(91)],[id(24),id(9999)],[id(24),id(24)]]) assert.equal((await merge(a,b)).ok,false);
 });
 await paired(26,27); const op=await purchase(id(26));
 const [msg]=await q("insert into messages(id,organization_id,lead_id,body,status) values($1,$2,$3,'Evidência literal comercial','sent') returning *",[id(820),org,id(26)]);
 await service();
 await test('protected keep contact prevents legacy merge before any source is moved',async()=>{
  const r=await merge(id(26),id(27)); assert.equal(r.reason,'commercial_history'); assert.equal(r.ok,false);
  assert.equal((await q('select metadata from leads where id=$1',[id(27)]))[0].metadata.merged_into,undefined);
 });
 await paired(28,29); await purchase(id(29)); await service();
 await test('protected duplicate contact also blocks automatic merge',async()=>assert.equal((await merge(id(28),id(29))).reason,'commercial_history'));
 await human();
 await test('hard delete and reclassification of a buyer are blocked at the database',async()=>{
  await rejected(()=>q('delete from leads where id=$1',[id(26)]),'COMMERCIAL_HISTORY_PROTECTED');
  await rejected(()=>q("update leads set kind='geral' where id=$1",[id(26)]),'COMMERCIAL_HISTORY_PROTECTED');
 });
 await test('archive, restore, name and phone corrections preserve evidence',async()=>{
  await q("update leads set archived_at=now(),name='Nome corrigido',phone='5547988887777' where id=$1",[id(26)]);
  await q('update leads set archived_at=null where id=$1',[id(26)]);
  assert.equal((await q('select primary_contact_id from commercial_opportunities where id=$1',[op.id]))[0].primary_contact_id,id(26));
  assert.equal((await q('select body from messages where id=$1',[msg.id]))[0].body,msg.body);
 });
 await test('forged merged_into metadata cannot silently retire a protected identity',async()=>{
  await rejected(()=>q("update leads set metadata=jsonb_build_object('merged_into',$1::text) where id=$2",[id(28),id(26)]),'COMMERCIAL_HISTORY_PROTECTED');
 });
 await test('buyer or broker identity stays protected after a current assignment changes',async()=>{
  await q("update leads set kind='corretor' where id in ($1,$2)",[id(30),id(31)]);
  const o=await purchase(id(32),id(30));
  await q("update commercial_opportunities set broker_id=$1,attribution_reason='Troca explicitamente documentada' where id=$2",[id(31),o.id]);
  assert.equal((await q('select commercial_contact_has_history($1,$2) protected',[org,id(30)]))[0].protected,true);
  await rejected(()=>q("update leads set kind='cliente' where id=$1",[id(30)]),'COMMERCIAL_HISTORY_PROTECTED');
 });
 await test('documented spouse cannot be deleted or converted to a broker',async()=>{
  await q("insert into commercial_participants values($1,$2,$3,'spouse')",[org,op.id,id(33)]);
  await rejected(()=>q("update leads set kind='corretor' where id=$1",[id(33)]),'COMMERCIAL_HISTORY_PROTECTED');
  await rejected(()=>q('delete from leads where id=$1',[id(33)]),'COMMERCIAL_HISTORY_PROTECTED');
 });
 const pending=await source(id(34));
 await test('a pending source already protects contact identity, deletion and reassignment',async()=>{
  await rejected(()=>q('delete from proposals where id=$1',[pending.id]),'COMMERCIAL_SOURCE_PROTECTED');
  await rejected(()=>q('update proposals set lead_id=$1 where id=$2',[id(35),pending.id]),'COMMERCIAL_SOURCE_PROTECTED');
  await rejected(()=>q("update leads set kind='geral' where id=$1",[id(34)]),'COMMERCIAL_HISTORY_PROTECTED');
 });
 await test('first explicit opportunity link remains allowed',async()=>{
  const o=await purchase(id(34));
  await q("select commercial_resolve_link($1,'proposals',$2,$3)",[org,pending.id,o.id]);
  assert.equal((await q('select opportunity_id from proposals where id=$1',[pending.id]))[0].opportunity_id,o.id);
 });
 await test('cancelling a proposal keeps its original identity and audit',async()=>{
  await q("update proposals set status='cancelada',proposed_price=95000 where id=$1",[pending.id]);
  assert.equal((await q('select lead_id from proposals where id=$1',[pending.id]))[0].lead_id,id(34));
 });
 let visit;
 await test('commercial visit cannot be deleted or changed into an unrelated task',async()=>{
  [visit]=await q("insert into agenda_events(organization_id,lead_id,title,starts_at,event_type) values($1,$2,'Visita',now()+interval '1 day','visita') returning *",[org,id(36)]);
  await rejected(()=>q("update agenda_events set event_type='tarefa' where id=$1",[visit.id]),'COMMERCIAL_SOURCE_PROTECTED');
  await rejected(()=>q('delete from agenda_events where id=$1',[visit.id]),'COMMERCIAL_SOURCE_PROTECTED');
  await q("update agenda_events set status='cancelled' where id=$1",[visit.id]);
 });
 await test('reviewed literal message cannot be edited, but delivery status can',async()=>{
  await q("insert into commercial_conversation_reviews(organization_id,lead_id,message_id,category,evidence,origin,status) values($1,$2,$3,'relevant_interaction','Evidência literal','human','confirmed')",[org,id(26),msg.id]);
  await rejected(()=>q("update messages set body='Texto reescrito' where id=$1",[msg.id]),'COMMERCIAL_EVIDENCE_PROTECTED');
  await q("update messages set status='read' where id=$1",[msg.id]);
  assert.equal((await q('select status from messages where id=$1',[msg.id]))[0].status,'read');
 });
 await test('messages belonging to commercial history cannot be erased or moved',async()=>{
  await rejected(()=>q('delete from messages where id=$1',[msg.id]),'COMMERCIAL_EVIDENCE_PROTECTED');
  await rejected(()=>q('update messages set lead_id=$1 where id=$2',[id(37),msg.id]),'COMMERCIAL_EVIDENCE_PROTECTED');
 });
 await test('unreviewed media text enrichment remains possible',async()=>{
  await q("insert into messages(id,organization_id,lead_id,body) values($1,$2,$3,'Mídia pendente')",[id(821),org,id(26)]);
  await q("update messages set body='Transcrição recebida' where id=$1",[id(821)]);
 });
 await test('conversation and transport cannot bypass protection through a direct reassignment',async()=>{
  await q('insert into whatsapp_conversations(id,organization_id,lead_id) values($1,$2,$3)',[id(822),org,id(26)]);
  await q('insert into whatsapp_messages(id,organization_id,lead_id,conversation_id) values($1,$2,$3,$4)',[id(823),org,id(26),id(822)]);
  await rejected(()=>q('update whatsapp_conversations set lead_id=$1 where id=$2',[id(37),id(822)]),'COMMERCIAL_EVIDENCE_PROTECTED');
  await rejected(()=>q('delete from whatsapp_messages where id=$1',[id(823)]),'COMMERCIAL_EVIDENCE_PROTECTED');
  await q("update whatsapp_messages set status='delivered' where id=$1",[id(823)]);
 });
 await test('legacy internal implementation cannot move protected history if called directly by trusted SQL',async()=>{
  await paired(38,39); const o=await purchase(id(39));
  await q("insert into messages(id,organization_id,lead_id,body) values($1,$2,$3,'Histórico que deve permanecer')",[id(824),org,id(39)]);
  await service();
  await rejected(()=>q('select private.commercial_legacy_merge_duplicate_lead($1,$2)',[id(38),id(39)]),'COMMERCIAL_EVIDENCE_PROTECTED');
  assert.equal((await q('select lead_id from messages where id=$1',[id(824)]))[0].lead_id,id(39));
  assert.equal((await q('select primary_contact_id from commercial_opportunities where id=$1',[o.id]))[0].primary_contact_id,id(39));
  await human();
 });
 await test('a failed mixed SQL reclassification rolls back every row of that statement',async()=>{
  await rejected(()=>q("update leads set kind='geral' where id in ($1,$2)",[id(26),id(40)]),'COMMERCIAL_HISTORY_PROTECTED');
  assert.equal((await q('select kind from leads where id=$1',[id(40)]))[0].kind,'cliente');
 });
 await test('foreign contact references are rejected before insertion',async()=>{
  await rejected(()=>purchase(id(91)),'COMMERCIAL_CONTACT_UNAVAILABLE');
  await rejected(()=>source(id(91)),'COMMERCIAL_CONTACT_UNAVAILABLE');
 });
 await test('unprotected profile still permits the legacy administrative cleanup',async()=>{
  await q("update leads set kind='geral' where id=$1",[id(41)]);
  await q('delete from leads where id=$1',[id(41)]);
  assert.deepEqual(await q('select id from leads where id=$1',[id(41)]),[]);
 });
 await test('normal users cannot call merge RPC or its private legacy implementation',async()=>{
  await rejected(()=>merge(id(20),id(21)),'permission denied');
  await rejected(()=>preflight(id(20),id(21)),'permission denied');
  await rejected(()=>q('select private.commercial_legacy_merge_duplicate_lead($1,$2)',[id(20),id(21)]),'permission denied');
 });
 await test('viewer cannot reclassify, delete or observe another organization history',async()=>{
  await human(viewer);
  assert.equal((await q("update leads set kind='geral' where id=$1 returning id",[id(26)])).length,0);
  assert.equal((await q('delete from leads where id=$1 returning id',[id(26)])).length,0);
  assert.equal((await q('select commercial_contact_has_history($1,$2) protected',[other,id(26)]))[0].protected,false);
  await human();
 });
 await test('new public wrapper and guards retain invoker privileges; definer legacy is private only',async()=>{
  const rows=await q("select n.nspname,p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('merge_duplicate_lead','commercial_contact_has_history','commercial_protect_contact_identity','commercial_legacy_merge_duplicate_lead')");
  assert.equal(rows.find(x=>x.proname==='merge_duplicate_lead').prosecdef,false);
  assert.equal(rows.find(x=>x.proname==='commercial_protect_contact_identity').prosecdef,false);
  assert.equal(rows.find(x=>x.proname==='commercial_legacy_merge_duplicate_lead').nspname,'private');
 });
 console.log(`PASS: ${count} commercial identity and actual legacy-merge regression scenarios with all seven migrations.`);
} finally {await db.close();}
