import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {aiProposalSetupSql,id,org} from './ai-proposal-fixture.mjs';
import {processCommercialConversationMessage} from '../../src/lib/commercial-conversation-intelligence.ts';
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const ident=x=>{if(!/^[a-z_]+$/.test(x))throw Error('Invalid fixture identifier');return x;};
let loseRpc=false,failMarker=false,rpcCount=0,detect=true,analysisAvailable=true;
const ai={meaningful_commercial_conversation:true,summary:'Proposta identificada para conferência',bossa_proposal_detected:true,proposal_confidence:0.92,proposal_direction:'sent_by_bossa',client_name:'Cliente teste',broker_company:'',development_name:'Prédio teste',unit_code:'101',total_price:90000,entry_amount:90000,monthly_count:0,monthly_amount:0,reinforcement_count:0,reinforcement_amount:0,keys_amount:0,post_keys_adjustment:'',notes:'',meeting_detected:false,meeting_confidence:0};
process.env.OPENAI_API_KEY='isolated-fixture-only';
globalThis.fetch=async url=>{assert.equal(url,'https://api.openai.com/v1/responses');return {ok:true,json:async()=>analysisAvailable?{output:[{content:[{type:'output_text',text:JSON.stringify({...ai,bossa_proposal_detected:detect})}]}]}:{output:[]}};};
function from(table){
 ident(table);let operation='select',fields='*',value,filters=[],orders=[],max;
 const builder={
  select(x='*'){fields=x;return this;},eq(k,v){filters.push([k,'=',v]);return this;},gte(k,v){filters.push([k,'>=',v]);return this;},lte(k,v){filters.push([k,'<=',v]);return this;},
  order(k,{ascending=true}={}){orders.push(`${ident(k)} ${ascending?'asc':'desc'}`);return this;},limit(x){max=x;return this;},
  update(x){operation='update';value=x;return this;},insert(x){operation='insert';value=x;return this;},
  async maybeSingle(){const r=await this.run();return {...r,data:r.data?.[0]??null};},
  async single(){const r=await this.run();return {...r,data:r.data?.[0]??null};},
  then(resolve,reject){return this.run().then(resolve,reject);},
  async run(){try{
   if(table==='messages'&&operation==='update'&&failMarker){failMarker=false;return {data:null,error:{message:'injected marker failure'}};}
   const args=[];let sql='';
   if(operation==='select')sql=`select ${fields==='*'?'*':fields.split(',').map(x=>ident(x.trim())).join(',')} from ${table}`;
   else if(operation==='update'){const parts=Object.entries(value).map(([k,v])=>{args.push(v);return `${ident(k)}=$${args.length}`;});sql=`update ${table} set ${parts.join(',')}`;}
   else{const entries=Object.entries(value);sql=`insert into ${table}(${entries.map(([k])=>ident(k)).join(',')}) values(${entries.map(([,v])=>{args.push(v);return '$'+args.length;}).join(',')})`;}
   if(filters.length){sql+=' where '+filters.map(([k,op,v])=>{args.push(v);return `${ident(k)} ${op} $${args.length}`;}).join(' and ');}
   if(orders.length)sql+=' order by '+orders.join(',');if(max)sql+=' limit '+Number(max);
   if(operation!=='select')sql+=' returning '+(fields==='*'?'*':fields.split(',').map(x=>ident(x.trim())).join(','));
   const rows=await q(sql,args);return {data:rows,error:null};
  }catch(error){return {data:null,error:{message:String(error),code:error.code}};}}
 };return builder;
}
const admin={from,async rpc(name,a){assert.equal(name,'commercial_record_detected_proposal');rpcCount++;
 try{const result=(await q('select commercial_record_detected_proposal($1,$2,$3,$4,$5) r',[a.p_org,a.p_source,a.p_signature,a.p_data,a.p_items]))[0].r;
  if(loseRpc){loseRpc=false;return {data:null,error:{message:'lost response after commit'}};}
  return {data:result,error:null};
 }catch(error){return {data:null,error:{message:String(error),code:error.code}};}}
};
const rejectsMessage=(fn,message)=>assert.rejects(fn,error=>String(error?.message??error).includes(message));
const addMessage=n=>q('insert into messages(id,organization_id,lead_id,created_at,body,direction,sender_kind) values($1,$2,$3,$4,$5,$6,$7)',[id(n),org,id(30),'2026-10-21T15:00:00Z','Proposta R$ 90.000, entrada 90.000','in','contact']);
try{
 for(const sql of aiProposalSetupSql())await db.exec(sql);
 await addMessage(9200);await db.exec('set role service_role');
 const first=await processCommercialConversationMessage(admin,id(9200));
 assert.equal(first.proposalId!=null,true);assert.equal(first.processed,true);
 assert.equal((await q('select status from proposals where id=$1',[first.proposalId]))[0].status,'rascunho');
 assert.equal((await q('select count(*)::int n from activities where type=$1',['proposta_detectada_whatsapp']))[0].n,1);
 const again=await processCommercialConversationMessage(admin,id(9200));assert.equal(again.processed,false);
 console.log('PASS producer: real analysis-to-RPC path creates one draft and marks its source; processed replay stops');
 await addMessage(9201);loseRpc=true;
 await rejectsMessage(()=>processCommercialConversationMessage(admin,id(9201)),'lost response after commit');
 assert.equal((await q('select count(*)::int n from commercial_ai_proposal_detections'))[0].n,2);
 detect=false;const priorCalls=rpcCount;
 const resumed=await processCommercialConversationMessage(admin,id(9201));
 assert.equal(resumed.proposalId,first.proposalId);assert.equal(resumed.processed,true);assert.equal(rpcCount,priorCalls);
 assert.equal((await q('select count(*)::int n from activities where type=$1',['proposta_detectada_whatsapp']))[0].n,2);
 console.log('PASS producer: response lost after commit recovers server receipt even when a later AI analysis differs');
 await addMessage(9202);detect=true;failMarker=true;
 await rejectsMessage(()=>processCommercialConversationMessage(admin,id(9202)),'injected marker failure');
 assert.equal((await q('select count(*)::int n from commercial_ai_proposal_detections'))[0].n,3);
 detect=false;await processCommercialConversationMessage(admin,id(9202));
 assert.equal((await q('select count(*)::int n from activities where type=$1',['proposta_detectada_whatsapp']))[0].n,3);
 console.log('PASS producer: failed message marker retries from receipt without duplicate proposal activity');
 await addMessage(9203);detect=true;loseRpc=true;
 await rejectsMessage(()=>processCommercialConversationMessage(admin,id(9203)),'lost response after commit');
 analysisAvailable=false;const pending=await processCommercialConversationMessage(admin,id(9203));
 assert.equal(pending.processed,false);assert.equal(pending.proposalId,first.proposalId);
 assert.equal((await q("select raw_payload ? 'bossa_commercial_intelligence_processed_at' marked from messages where id=$1",[id(9203)]))[0].marked,false);
 console.log('PASS producer: unavailable reanalysis leaves committed proposal evidence and source eligible for later retry');
}finally{await db.close();}
