import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { schemaSQL, seedSQL, migrations, id, org, other, user, viewer, broker, dev, unit } from './intake-fixture.mjs';
const db = new PGlite();
const q = async (sql, params=[]) => (await db.query(sql,params)).rows;
const migration='20261021162332_commercial_fact_stage_sync.sql';
let checks=0;
const test=async(name,fn)=>{await fn(); console.log(`PASS stages ${++checks}: ${name}`);};
const refused=async(fn,match)=>assert.rejects(fn,new RegExp(match));
const asUser=async(uid=user)=>{await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]); await db.exec('set role authenticated');};
const opportunity=async(stage='contact')=>(await q(`insert into commercial_opportunities(organization_id,title,primary_contact_id,broker_id,owner_id,stage,next_action,source,loss_reason,qualification)
 values($1,'Compra em teste',$2,$3,$4,$5,'Retornar ao comprador','canal documentado',case when $5='lost' then 'postponed' else null end,'{"need":"morar","product":"apto","horizon":"ano","commercial_fit":"ok"}') returning *`,[org,id(20),broker,user,stage]))[0];
const stageOf=async(o)=>(await q('select stage from commercial_opportunities where id=$1',[o.id]))[0].stage;
const visit=async(o,kind='buyer',origin='human',past=false)=>(await q(`insert into agenda_events(organization_id,lead_id,opportunity_id,status,starts_at,ends_at,event_type,created_by_kind,visit_kind)
 values($1,$2,$3,'scheduled',now()+case when $6 then interval '-1 day' else interval '1 day' end,now()+interval '25 hours','visita',$4,$5) returning *`,[org,id(20),o.id,origin,kind,past]))[0];
const proposal=async(o,snapshot={})=>(await q(`insert into proposals(organization_id,lead_id,opportunity_id,development_id,unit_id,status,proposed_price,snapshot)
 values($1,$2,$3,$4,$5,'rascunho',100000,$6) returning *`,[org,id(20),o.id,dev,unit,JSON.stringify(snapshot)]))[0];
const send=async(p,date='now()')=>q(`update proposals set status='enviada',sent_at=${date} where id=$1`,[p.id]);
const decision=async(source,event)=> (await q(`select d.* from commercial_stage_decisions d join commercial_events e on e.id=d.event_id
 where e.entity_id=$1 and ($2::text is null or e.event_type=$2) order by d.decided_at desc,d.id desc limit 1`,[source.id,event??null]))[0];
const contract=async(o,date='now()')=>(await q(`insert into commercial_contracts(organization_id,opportunity_id,unit_id,signed_at,amount,document_reference,created_by)
 values($1,$2,$3,${date},100000,'Documento verificado',$4) returning *`,[org,o.id,unit,user]))[0];
try {
 await db.exec(schemaSQL);
 for (const file of [...migrations,migration]) await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
 await db.exec(seedSQL);
 await q("update memberships set role='admin' where user_id=$1",[user]); await asUser();
 let disabled;
 await test('disabled by default, future facts are audited without moving the purchase',async()=>{
  disabled=await opportunity(); const v=await visit(disabled);
  assert.equal(await stageOf(disabled),'contact'); assert.equal((await decision(v)).reason,'disabled');
  assert.equal((await q('select auto_stage_enabled from commercial_settings where organization_id=$1',[org]))[0].auto_stage_enabled,false);
 });
 await test('enabling does not replay existing events',async()=>{
  const count=Number((await q('select count(*) n from commercial_stage_decisions'))[0].n);
  await q('update commercial_settings set auto_stage_enabled=true where organization_id=$1',[org]);
  assert.equal(await stageOf(disabled),'contact'); assert.equal(Number((await q('select count(*) n from commercial_stage_decisions'))[0].n),count);
 });
 let a, scheduled;
 await test('new human buyer visit advances to scheduled with a causal decision',async()=>{
  a=await opportunity(); scheduled=await visit(a);
  assert.equal(await stageOf(a),'visit_scheduled');
  const d=await decision(scheduled); assert.equal(d.previous_stage,'contact'); assert.equal(d.target_stage,'visit_scheduled'); assert.equal(d.actor_id,user); assert.equal(d.reason,'documented_fact');
 });
 await test('confirming the same visit does not advance the opportunity twice',async()=>{
  await q("update agenda_events set visit_outcome='confirmed' where id=$1",[scheduled.id]);
  assert.equal(await stageOf(a),'visit_scheduled'); assert.equal((await decision(scheduled,'visit_confirmed')).reason,'already_at_or_ahead');
  assert.equal(Number((await q("select count(*) n from commercial_events where opportunity_id=$1 and event_type='stage_changed'",[a.id]))[0].n),1);
 });
 await test('explicit completed outcome on a past buyer visit advances to completed',async()=>{
  const o=await opportunity(), v=await visit(o,'buyer','human',true);
  await q("update agenda_events set visit_outcome='completed' where id=$1",[v.id]);
  assert.equal(await stageOf(o),'visit_completed'); assert.equal((await decision(v,'visit_completed')).decision,'advanced');
 });
 await test('a remote presentation is eligible',async()=>{
  const o=await opportunity(); await visit(o,'remote'); assert.equal(await stageOf(o),'visit_scheduled');
 });
 await test('broker-only visit never advances a buyer purchase',async()=>{
  const o=await opportunity(),v=await visit(o,'broker_only'); assert.equal(await stageOf(o),'contact'); assert.equal((await decision(v)).reason,'visit_evidence_incomplete');
 });
 await test('AI-origin visit is kept for review even with a known opportunity',async()=>{
  const o=await opportunity(),v=await visit(o,'buyer','ai'); assert.equal(await stageOf(o),'contact'); assert.equal((await decision(v)).reason,'automated_source_review');
 });
 await test('sent proposal needs unit and an explicit date of sending',async()=>{
  const o=await opportunity(),p=await proposal(o); await q("update proposals set status='enviada' where id=$1",[p.id]);
  assert.equal(await stageOf(o),'contact'); assert.equal((await decision(p,'proposal_sent')).reason,'proposal_evidence_incomplete');
 });
 await test('confirmed dated manual sending advances to proposal without inventing qualification',async()=>{
  const o=await opportunity(),p=await proposal(o); await send(p);
  assert.equal(await stageOf(o),'proposal');
  assert.equal(Number((await q("select count(*) n from commercial_facts($1) where opportunity_id=$2 and metric='qualified'",[org,o.id]))[0].n),0);
 });
 await test('a sent proposal with no unit remains for review',async()=>{
  const o=await opportunity(),p=await proposal(o); await q("update proposals set unit_id=null,status='enviada',sent_at=now() where id=$1",[p.id]);
  assert.equal(await stageOf(o),'contact'); assert.equal((await decision(p,'proposal_sent')).reason,'proposal_evidence_incomplete');
 });
 await test('AI pending sending cannot advance the stage',async()=>{
  const o=await opportunity(),p=await proposal(o,{auto_detected:true,source:'whatsapp_commercial_intelligence'}); await send(p);
  assert.equal(await stageOf(o),'contact'); assert.equal((await decision(p,'proposal_sent')).reason,'unconfirmed');
 });
 await test('future sending cannot advance the stage',async()=>{
  const o=await opportunity(),p=await proposal(o); await send(p,"now()+interval '1 day'");
  assert.equal(await stageOf(o),'contact'); assert.equal((await decision(p,'proposal_sent')).reason,'future_fact');
 });
 await test('backdated fact older than a recorded stage requires review',async()=>{
  const o=await opportunity(),p=await proposal(o); await send(p,"now()-interval '1 day'");
  assert.equal(await stageOf(o),'contact'); assert.equal((await decision(p,'proposal_sent')).reason,'older_than_stage');
 });
 await test('a later visit never moves a proposal backwards',async()=>{
  const o=await opportunity(),p=await proposal(o); await send(p); const v=await visit(o);
  assert.equal(await stageOf(o),'proposal'); assert.equal((await decision(v)).reason,'already_at_or_ahead');
 });
 await test('negotiation is not rolled back by another sent proposal',async()=>{
  const o=await opportunity('negotiation'),p=await proposal(o); await send(p);
  assert.equal(await stageOf(o),'negotiation'); assert.equal((await decision(p,'proposal_sent')).reason,'already_at_or_ahead');
 });
 for (const value of ['lost','nurture']) await test(`${value} is not reactivated by a new fact`,async()=>{
  const o=await opportunity(value),p=await proposal(o); await send(p);
  assert.equal(await stageOf(o),value); assert.equal((await decision(p,'proposal_sent')).reason,'protected_stage');
 });
 let signed, c;
 await test('administrator documented contract advances to signed',async()=>{
  signed=await opportunity(); c=await contract(signed); assert.equal(await stageOf(signed),'signed');
  assert.equal((await decision(c,'contract_signed')).decision,'advanced');
 });
 await test('signed stage is protected from new visits',async()=>{
  const v=await visit(signed); assert.equal(await stageOf(signed),'signed'); assert.equal((await decision(v)).reason,'protected_stage');
 });
 await test('distrato preserves signed stage and records need for review',async()=>{
  await q("update commercial_contracts set cancelled_at=now(),cancellation_reason='Solicitado pelo comprador' where id=$1",[c.id]);
  assert.equal(await stageOf(signed),'signed'); assert.equal((await decision(c,'contract_cancelled')).reason,'cancellation_review');
 });
 await test('cancelled visit preserves stage and exposes review instead of loss',async()=>{
  const o=await opportunity(),v=await visit(o); await q("update agenda_events set visit_outcome='cancelled' where id=$1",[v.id]);
  assert.equal(await stageOf(o),'visit_scheduled'); assert.equal((await decision(v,'visit_cancelled')).reason,'cancellation_review');
 });
 await test('normal edits do not replay stage transitions',async()=>{
  const o=await opportunity(),p=await proposal(o); await send(p);
  const before=Number((await q('select count(*) n from commercial_stage_decisions where opportunity_id=$1',[o.id]))[0].n);
  await q('update proposals set proposed_price=99000 where id=$1',[p.id]);
  await q("update proposals set status='enviada' where id=$1",[p.id]);
  assert.equal(Number((await q('select count(*) n from commercial_stage_decisions where opportunity_id=$1',[o.id]))[0].n),before);
 });
 await test('owner, broker, source, creation and next action stay untouched',async()=>{
  const o=await opportunity(),p=await proposal(o); await send(p);
  const [after]=await q('select * from commercial_opportunities where id=$1',[o.id]);
  for (const k of ['owner_id','broker_id','source','created_at','primary_contact_id','next_action','qualification']) assert.deepEqual(after[k],o[k]);
 });
 await test('legacy sent proposal linked later does not invent a sending event or advance',async()=>{
  const o=await opportunity(); const [p]=await q("insert into proposals(organization_id,lead_id,status,sent_at,unit_id,development_id) values($1,$2,'enviada',now(),$3,$4) returning id",[org,id(20),unit,dev]);
  await q('update proposals set opportunity_id=$1 where id=$2',[o.id,p.id]);
  assert.equal(await stageOf(o),'contact'); assert.equal(await decision(p),undefined);
 });
 await test('disabling stops future advances without changing existing decisions',async()=>{
  await q('update commercial_settings set auto_stage_enabled=false where organization_id=$1',[org]);
  const o=await opportunity(),p=await proposal(o); await send(p); assert.equal(await stageOf(o),'contact'); assert.equal((await decision(p)).reason,'disabled');
  await q('update commercial_settings set auto_stage_enabled=true where organization_id=$1',[org]);
 });
 await test('commercial role can advance a documented visit but cannot toggle settings',async()=>{
  await db.exec('reset role'); await q("update memberships set role='comercial' where user_id=$1",[user]); await asUser();
  assert.equal((await q('update commercial_settings set auto_stage_enabled=false where organization_id=$1 returning organization_id',[org])).length,0);
  const o=await opportunity(); await visit(o); assert.equal(await stageOf(o),'visit_scheduled');
 });
 await test('viewer cannot write a source or forge decisions',async()=>{
  await asUser(viewer);
  await refused(()=>q("insert into proposals(organization_id,lead_id,status) values($1,$2,'rascunho')",[org,id(20)]),'policy|permission');
  const d=(await q('select * from commercial_stage_decisions limit 1'))[0];
  await refused(()=>q('update commercial_stage_decisions set reason=$1 where id=$2',['forged',d.id]),'permission|Append-only');
  await asUser();
 });
 await test('decision history cannot be forged even by a commercial actor',async()=>{
  const d=(await q('select * from commercial_stage_decisions limit 1'))[0];
  await refused(()=>q(`insert into commercial_stage_decisions(organization_id,event_id,opportunity_id,event_type,previous_stage,resulting_stage,decision,reason,actor_id,occurred_at)
   values($1,$2,$3,$4,'contact','contact','skipped','forged',$5,now())`,[org,d.event_id,d.opportunity_id,d.event_type,user]),'STAGE_DECISION_REQUIRES_ENTITY_TRANSACTION');
 });
 await test('organization isolation hides all foreign decisions',async()=>{
  assert.deepEqual(await q('select * from commercial_stage_decisions where organization_id=$1',[other]),[]);
 });
 await test('service role without human session cannot advance a purchase',async()=>{
  const o=await opportunity(),p=await proposal(o); await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role service_role');
  await send(p); assert.equal(await stageOf(o),'contact'); assert.equal((await decision(p)).reason,'human_review_required'); await asUser();
 });
 await test('source, stage and new ledger records roll back together on audit failure',async()=>{
  const o=await opportunity(),p=await proposal(o);
  const before=Number((await q('select count(*) n from commercial_events where opportunity_id=$1',[o.id]))[0].n);
  await db.exec(`reset role; create function test_reject_decision() returns trigger language plpgsql as $$ begin raise exception 'TEST_AUDIT_FAILURE'; end $$;
   create trigger z_test_reject before insert on commercial_stage_decisions for each row execute function test_reject_decision(); set role authenticated;`);
  await refused(()=>send(p),'TEST_AUDIT_FAILURE');
  assert.equal(await stageOf(o),'contact'); assert.equal((await q('select status from proposals where id=$1',[p.id]))[0].status,'rascunho');
  assert.equal(Number((await q('select count(*) n from commercial_events where opportunity_id=$1',[o.id]))[0].n),before);
  await db.exec('reset role; drop trigger z_test_reject on commercial_stage_decisions; drop function test_reject_decision(); set role authenticated;');
 });
 await test('new trigger uses invoker rights and audit table is RLS protected',async()=>{
  const [f]=await q("select prosecdef,proconfig from pg_proc where proname='commercial_sync_stage_from_fact'");
  assert.equal(f.prosecdef,false); assert.ok(f.proconfig.includes('search_path=public'));
  assert.equal((await q("select relrowsecurity from pg_class where relname='commercial_stage_decisions'"))[0].relrowsecurity,true);
 });
 console.log(`PASS: ${checks} stage synchronization scenarios against all six migrations.`);
} finally {await db.close();}
