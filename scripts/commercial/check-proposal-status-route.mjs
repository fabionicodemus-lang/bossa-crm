import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { sourceRequestSetupSql,id,org,user,dev,unit } from './source-request-fixture.mjs';
import { GET,POST } from '../../src/app/api/commercial/recovery/route.ts';
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const read=n=>fs.readFileSync(new URL(`../../supabase/migrations/${n}`,import.meta.url),'utf8');
try{
 for(const s of sourceRequestSetupSql())await db.exec(s);
 await db.exec(read('20261021182758_commercial_recoverable_requests.sql'));
 await db.exec(read('20261021203000_commercial_proposal_status_once.sql'));
 await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
 const proposal=(await q('select commercial_save_proposal_once($1,$2,$3,$4,$5,$6) r',[org,id(9000),{
  development_id:dev,unit_id:unit,lead_id:id(30),status:'rascunho',list_price:100000,proposed_price:90000,discount_amount:10000,payment_plan:{entry_total:90000},snapshot:{workflow_status:'rascunho'}
 },[{kind:'entrada',quantity:1,amount:90000}],null,null]))[0].r.record;
 const key=id(9001);
 const payload={data:{operation:'status',workflow_status:'enviada',expected_version:proposal.version},items:[],id:proposal.id,expected_updated_at:proposal.updated_at};
 await q('select commercial_prepare_source_request($1,$2,$3,$4)',[org,key,'proposals',payload]);
 globalThis.proposalStatusRouteFixture={context:{organization:{id:org},userId:user,role:'comercial'},db:{
  from(name){assert.equal(name,'commercial_pending_source_requests');const filters=[];return {select(){return this;},eq(field,value){filters.push([field,value]);return this;},async maybeSingle(){const by=Object.fromEntries(filters);const rows=await q('select request_id from commercial_pending_source_requests where organization_id=$1 and actor_id=$2 and entity_type=$3 and status=$4',[by.organization_id,by.actor_id,by.entity_type,by.status]);return {data:rows[0]??null,error:null};}};},
  async rpc(name,args){try{
   let result;
   if(name==='commercial_get_source_recovery')result=(await q('select commercial_get_source_recovery($1,$2) r',[args.p_org,args.p_request]))[0].r;
   else if(name==='commercial_proposal_status_once')result=(await q('select commercial_proposal_status_once($1,$2,$3,$4,$5,$6) r',[args.p_org,args.p_request,args.p_id,args.p_expected_updated_at,args.p_expected_version,args.p_workflow_status]))[0].r;
   else if(name==='commercial_save_proposal_once')result=(await q('select commercial_save_proposal_once($1,$2,$3,$4,$5,$6) r',[args.p_org,args.p_request,args.p_data,args.p_items,args.p_id,args.p_expected_updated_at]))[0].r;
   else if(name==='commercial_finish_source_recovery')result=(await q('select commercial_finish_source_recovery($1,$2,$3) r',[args.p_org,args.p_request,args.p_action]))[0].r;
   else throw Error(`Unexpected route RPC ${name}`);
   return {data:result,error:null};
  }catch(e){return {data:null,error:{message:String(e),code:e.code}};}}
 }};
 const base='http://localhost/api/commercial/recovery';
 const listed=await GET(new Request(base+'?type=proposals'));
 assert.equal((await listed.json()).request.state,'pending');
 const retry=await POST(new Request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:key,action:'retry',confirmed:true})}));
 assert.equal(retry.status,200);assert.equal((await retry.json()).request.state,'committed');
 assert.equal((await q("select count(*)::int n from activities where metadata->>'request_id'=$1",[key]))[0].n,1);
 console.log('PASS recovery route: original pending status command resumes from server payload and commits once');
 const again=await POST(new Request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:key,action:'retry',confirmed:true})}));
 assert.equal((await again.json()).request.state,'committed');
 assert.equal((await q('select version from proposals where id=$1',[proposal.id]))[0].version,2);
 console.log('PASS recovery route: committed request is read-only and does not increment version');
 const ack=await POST(new Request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:key,action:'acknowledge',confirmed:true})}));
 assert.equal((await ack.json()).request.state,'acknowledged');
 assert.equal((await (await GET(new Request(base+'?type=proposals'))).json()).request,null);
 console.log('PASS recovery route: acknowledgment clears pending view without deleting the receipt');
 const snapshot = async () => {
  const result = {};
  for (const table of ['proposals','proposal_payment_items','activities','commercial_events','commercial_source_requests'])
   result[table] = await q(`select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`);
  return result;
 };
 let sequence = 9200;
 for (const patched of [false,true]) {
  if (patched) {
   await db.exec('reset role');
   await db.exec(fs.readFileSync(new URL('../../supabase/compatibility/20261022_rpc_http_conflicts.sql',import.meta.url),'utf8'));
   await db.exec('set role authenticated');
  }
  for (const operation of ['status','save']) {
   const requestId = id(++sequence);
   const data = operation === 'status' ? payload.data
    : Object.fromEntries(['development_id','unit_id','lead_id','status','list_price','proposed_price','discount_amount','payment_plan','snapshot'].map(k=>[k,proposal[k]]));
   const stalePayload = { ...payload, data, items: operation === 'status' ? [] : [{kind:'entrada',quantity:1,amount:90000}] };
   await q('select commercial_prepare_source_request($1,$2,$3,$4)',[org,requestId,'proposals',stalePayload]);
   const before = await snapshot();
   const conflict = await POST(new Request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,action:'retry',confirmed:true})}));
   assert.equal(conflict.status,409);
   assert.deepEqual(await snapshot(),before);
   const recovery = (await q('select commercial_get_source_recovery($1,$2) r',[org,requestId]))[0].r;
   assert.equal(recovery.state,'pending');
   await q("select commercial_finish_source_recovery($1,$2,'abandon')",[org,requestId]);
  }
  console.log(`PASS recovery route: ${patched ? 'PT409' : '40001'} save/status conflicts yield HTTP 409 with unchanged financial rows and recoverable pending attempts`);
 }
}finally{await db.close();}
