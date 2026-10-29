import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {sourceRequestSetupSql,id,org,other,user,viewer,dev,unit} from './source-request-fixture.mjs';
const db=new PGlite(); const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const migration=fs.readFileSync(new URL('../../supabase/migrations/20261021182758_commercial_recoverable_requests.sql',import.meta.url),'utf8');
const data={development_id:dev,unit_id:unit,lead_id:id(30),status:'rascunho',list_price:100000,proposed_price:90000,discount_amount:10000,payment_plan:{},snapshot:{}};
const items=[{kind:'entrada',quantity:1,amount:90000}];
const payload={data,items,id:null,expected_updated_at:null};
const agenda={assigned_to:user,title:'Visita recuperável',event_type:'visita',meeting_mode:'presencial',starts_at:'2030-01-01T12:00:00.000Z',ends_at:'2030-01-01T13:00:00.000Z'};
const prepare=async(key,p=payload,type='proposals',company=org)=>(await q('select commercial_prepare_source_request($1,$2,$3,$4) r',[company,key,type,p]))[0].r;
const get=async(key,company=org)=>(await q('select commercial_get_source_recovery($1,$2) r',[company,key]))[0].r;
const finish=async(key,action='acknowledge')=>(await q('select commercial_finish_source_recovery($1,$2,$3) r',[org,key,action]))[0].r;
const save=async(key,p=payload)=>(await q('select commercial_save_proposal_once($1,$2,$3,$4,$5,$6) r',[org,key,p.data,p.items,p.id,p.expected_updated_at]))[0].r;
const create=async(key)=>(await q('select commercial_create_agenda_once($1,$2,$3) r',[org,key,agenda]))[0].r;
const reject=async(fn,pattern)=>assert.rejects(fn,new RegExp(pattern));
let count=0;
const test=async(name,fn)=>{await fn();console.log(`PASS recovery ${++count}: ${name}`);};
try{
 for(const sql of sourceRequestSetupSql()) await db.exec(sql);
 await db.exec(migration); await q("select set_config('request.jwt.claim.sub',$1,false)",[user]); await db.exec('set role authenticated');
 const baseline=Number((await q('select count(*)::int n from proposals'))[0].n);
 let saved;
 await test('preparing is durable but does not create a source or receipt',async()=>{
  await prepare(id(9000));const r=await get(id(9000));assert.equal(r.state,'pending');assert.equal(r.record,null);assert.deepEqual(r.payload,payload);
  assert.equal((await q('select count(*)::int n from proposals'))[0].n,baseline);assert.equal((await q('select count(*)::int n from commercial_source_requests'))[0].n,0);
 });
 await test('a new connection/screen can discover the same unresolved request without browser state',async()=>{
  const rows=await q("select request_id from commercial_pending_source_requests where organization_id=$1 and actor_id=auth.uid() and entity_type='proposals' and status='pending'",[org]);
  assert.deepEqual(rows,[{request_id:id(9000)}]);assert.equal((await get(id(9000))).state,'pending');
 });
 await test('same prepared command is idempotent; a different payload/key cannot replace it',async()=>{
  await prepare(id(9000));await reject(()=>prepare(id(9000),{...payload,data:{...data,notes:'Changed'}}),'COMMERCIAL_REQUEST_REUSED');
  await reject(()=>prepare(id(9001)),'COMMERCIAL_RECOVERY_PENDING');
 });
 await test('an unresolved preparation cannot be falsely acknowledged',async()=>{await reject(()=>finish(id(9000)),'COMMERCIAL_RECOVERY_NOT_COMMITTED');});
 await test('save commits once and recovery proves the current receipt',async()=>{
  saved=await save(id(9000));assert.equal((await get(id(9000))).state,'committed');assert.equal((await get(id(9000))).record.id,saved.record.id);
  assert.equal((await save(id(9000))).replayed,true);assert.equal((await q('select count(*)::int n from proposals'))[0].n,baseline+1);
 });
 await test('abandoning a committed command returns confirmed state without deleting anything',async()=>{
  assert.equal((await finish(id(9000),'abandon')).state,'committed');assert.equal((await q('select count(*)::int n from proposals'))[0].n,baseline+1);
 });
 await test('acknowledgment is idempotent and permits a new explicit request',async()=>{
  assert.equal((await finish(id(9000))).state,'acknowledged');assert.equal((await finish(id(9000))).state,'acknowledged');await prepare(id(9001));
 });
 await test('abandonment makes a late call to the existing save RPC roll back completely',async()=>{
  assert.equal((await finish(id(9001),'abandon')).state,'abandoned');await reject(()=>save(id(9001)),'COMMERCIAL_RECOVERY_ABANDONED');
  assert.equal((await q('select count(*)::int n from proposals'))[0].n,baseline+1);assert.equal((await q('select count(*)::int n from commercial_source_requests'))[0].n,1);
  await reject(()=>prepare(id(9001)),'COMMERCIAL_RECOVERY_ABANDONED');
 });
 await test('prepared payload is enforced even for a direct call to the old save RPC',async()=>{
  await prepare(id(9002));await reject(()=>save(id(9002),{...payload,data:{...data,notes:'Forged'}}),'COMMERCIAL_REQUEST_REUSED');assert.equal((await get(id(9002))).state,'pending');await finish(id(9002),'abandon');
 });
 await test('failed business validation leaves a recoverable command, not a false save',async()=>{
  const p={...payload,items:[{kind:'entrada',quantity:1,amount:1}]};await prepare(id(9003),p);
  await reject(()=>save(id(9003),p),'COMMERCIAL_ITEMS_TOTAL_MISMATCH');assert.equal((await get(id(9003))).state,'pending');await finish(id(9003),'abandon');
 });
 await test('edits retain microsecond revisions and recover without repeating the version increment',async()=>{
  const stamp=(await q('select updated_at::text t from proposals where id=$1',[saved.record.id]))[0].t;
  const p={...payload,data:{...data,notes:'Verified edit'},id:saved.record.id,expected_updated_at:stamp};
  await prepare(id(9004),p);const durable=(await get(id(9004))).payload;
  const edit=await save(id(9004),durable);assert.equal(edit.record.version,2);assert.equal((await save(id(9004),durable)).record.version,2);await finish(id(9004));
 });
 await test('an old create recovery cannot overwrite a newer edit',async()=>{assert.equal((await get(id(9000))).record.notes,'Verified edit');});
 await test('actor, payload, identity and original time cannot be rewritten directly',async()=>{
  await prepare(id(9005));
  for(const mutation of ["payload='{}'","actor_id='"+viewer+"'","created_at=now()-interval '1 day'","entity_type='agenda_events'"])
   await reject(()=>q(`update commercial_pending_source_requests set ${mutation} where request_id=$1`,[id(9005)]),'IMMUTABLE|FORBIDDEN');
  await reject(()=>q('delete from commercial_pending_source_requests where request_id=$1',[id(9005)]),'permission');
  await finish(id(9005),'abandon');
 });
 await test('closed commands cannot be reopened or retroactively marked confirmed',async()=>{
  await reject(()=>q("update commercial_pending_source_requests set status='pending',closed_at=null where request_id=$1",[id(9005)]),'IMMUTABLE');
 });
 await test('direct table preparation cannot forge a closed request or claim another actor',async()=>{
  await reject(()=>q("insert into commercial_pending_source_requests(organization_id,actor_id,request_id,entity_type,payload,status,closed_at) values($1,$2,$3,'proposals',$4,'acknowledged',now())",[org,user,id(9010),payload]),'INVALID');
  await reject(()=>q("insert into commercial_pending_source_requests(organization_id,actor_id,request_id,entity_type,payload) values($1,$2,$3,'proposals',$4)",[org,viewer,id(9010),payload]),'FORBIDDEN|policy');
 });
 await test('two distinct request kinds may be pending but do not share a request key',async()=>{
  await prepare(id(9011));await prepare(id(9012),agenda,'agenda_events');
  await reject(()=>prepare(id(9011),agenda,'agenda_events'),'COMMERCIAL_REQUEST_REUSED');await finish(id(9011),'abandon');
 });
 await test('agenda recovery preserves cancellation and never reopens a saved visit',async()=>{
  const a=await create(id(9012));await q("update agenda_events set status='cancelled' where id=$1",[a.record.id]);
  assert.equal((await get(id(9012))).record.status,'cancelled');assert.equal((await create(id(9012))).record.status,'cancelled');await finish(id(9012));
 });
 await test('a removed noncommercial source is reported as committed-unavailable, not as absent',async()=>{
  const a={...agenda,title:'Internal task',event_type:'tarefa'};await prepare(id(9013),a,'agenda_events');
  const r=(await q('select commercial_create_agenda_once($1,$2,$3) r',[org,id(9013),a]))[0].r;
  await q('delete from agenda_events where id=$1',[r.record.id]);assert.equal((await get(id(9013))).state,'committed_unavailable');
  assert.equal((await finish(id(9013),'abandon')).state,'committed_unavailable');assert.equal((await finish(id(9013))).state,'acknowledged');
 });
 await test('other organizations and users cannot list, retrieve or finish these commands',async()=>{
  await reject(()=>get(id(9000),other),'FORBIDDEN');assert.deepEqual(await q('select * from commercial_pending_source_requests where organization_id=$1',[other]),[]);
  await db.exec('reset role');await q("insert into memberships values($1,$2,'comercial')",[org,id(12)]);await q("select set_config('request.jwt.claim.sub',$1,false)",[id(12)]);await db.exec('set role authenticated');
  assert.deepEqual(await q('select * from commercial_pending_source_requests'),[]);await reject(()=>get(id(9000)),'NOT_FOUND');await reject(()=>finish(id(9000),'abandon'),'NOT_FOUND');
  await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 });
 await test('revoking edit rights blocks recovery and viewing command payloads',async()=>{
  await db.exec('reset role');await q("update memberships set role='viewer' where user_id=$1",[user]);await db.exec('set role authenticated');
  await reject(()=>get(id(9000)),'FORBIDDEN');assert.deepEqual(await q('select * from commercial_pending_source_requests'),[]);
  await db.exec('reset role');await q("update memberships set role='comercial' where user_id=$1",[user]);await db.exec('set role authenticated');
 });
 await test('service role and anonymous callers are not recovery operators',async()=>{
  for(const role of ['service_role','anon']){await db.exec(`reset role; set role ${role}`);await reject(()=>get(id(9000)),'permission');}
  await db.exec('reset role; set role authenticated');
 });
 await test('unknown, malformed and excessive payloads are rejected without a pending row',async()=>{
  await reject(()=>prepare(id(9020),{},'leads'),'INVALID');await reject(()=>prepare(id(9020),[]),'INVALID');
  await reject(()=>prepare(id(9020),{...payload,unknown:true}),'INVALID');await reject(()=>prepare(id(9020),{...payload,data:{notes:'x'.repeat(270001)}}),'INVALID');
  await reject(()=>get(id(9999)),'NOT_FOUND');
 });
 await test('legacy receipts may be prepared for confirmation, but not with different data',async()=>{
  await save(id(9021));await reject(()=>prepare(id(9021),{...payload,data:{...data,notes:'Different'}}),'COMMERCIAL_REQUEST_REUSED');
  await prepare(id(9021));assert.equal((await get(id(9021))).state,'committed');await finish(id(9021));
 });
 await test('all new functions retain invoker rights and the pending table has RLS',async()=>{
  const fs=await q("select proname,prosecdef from pg_proc where proname in ('commercial_prepare_source_request','commercial_get_source_recovery','commercial_finish_source_recovery','commercial_receipt_recovery_guard','commercial_pending_source_guard')");
  assert.equal(fs.length,5);assert.ok(fs.every(f=>!f.prosecdef));assert.equal((await q("select relrowsecurity from pg_class where relname='commercial_pending_source_requests'"))[0].relrowsecurity,true);
 });
 console.log(`PASS: ${count} durable recovery scenarios with all nine migrations. No real external services.`);
}finally{await db.close();}
