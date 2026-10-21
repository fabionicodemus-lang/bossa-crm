import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GET,POST} from '../../src/app/api/commercial/recovery/route.ts';
import {publicRecovery,parseRecoveryAction} from '../../src/lib/commercial/recovery.ts';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=id(1),actor=id(10),requestId=id(30),recordId=id(40);
let passed=0;
function fixture(){
 const s={context:{role:'comercial',userId:actor,organization:{id:org}},recordId,
  selectError:false,rpcError:null,noPending:false,throwRpc:false,agendaFails:false,
  filters:[],calls:[],agenda:[],
  current:{request_id:requestId,entity_type:'proposals',status:'pending',state:'pending',created_at:'2026-10-21T12:00:00Z',
   record:null,payload:{id:null,expected_updated_at:null,data:{proposed_price:123456,snapshot:{development_name:'Projeto',unit_code:'101'}},items:[{amount:123456}]}}};
 s.db={from(table){s.calls.push({table});return{select(){return this;},eq(k,v){s.filters.push([k,v]);return this;},async maybeSingle(){return{data:s.noPending?null:{request_id:requestId},error:s.selectError?{message:'private detail'}:null};}};},
  async rpc(name,args){s.calls.push({name,args});if(s.throwRpc)throw Error('Network');if(s.rpcError)return{data:null,error:s.rpcError};
   if(name==='commercial_get_source_recovery')return{data:structuredClone(s.current),error:null};
   if(name==='commercial_save_proposal_once'){s.current.state='committed';s.current.record={id:recordId,proposal_number:123};return{data:{record:s.current.record},error:null};}
   if(name==='commercial_finish_source_recovery'){
    if(args.p_action==='acknowledge')s.current.state='acknowledged';
    else if(s.current.state==='pending')s.current.state='abandoned';
    return{data:structuredClone(s.current),error:null};
   }throw Error(`Unexpected RPC ${name}`);
  }};globalThis.__recoveryTest=s;return s;
}
const req=(body,type='proposals')=>new Request(`https://crm.test/api/commercial/recovery?type=${type}`,body===undefined?{}:{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
const input=(action='retry')=>({requestId,action,confirmed:true});
const test=async(name,fn)=>{await fn(fixture());console.log(`PASS recovery API ${++passed}: ${name}`);};
await test('anonymous requests stop before accessing the database or agenda',async s=>{s.context=null;assert.equal((await GET(req())).status,401);assert.equal((await POST(req(input()))).status,401);assert.equal(s.calls.length,0);});
await test('viewer cannot read, retry or abandon a command',async s=>{s.context.role='viewer';assert.equal((await GET(req())).status,403);assert.equal((await POST(req(input('abandon')))).status,403);assert.equal(s.calls.length,0);});
await test('listing is scoped by current organization, actor, kind and unresolved status',async s=>{const r=await GET(req());assert.equal(r.status,200);assert.deepEqual(s.filters,[['organization_id',org],['actor_id',actor],['entity_type','proposals'],['status','pending']]);assert.equal(s.agenda.length,0);assert.ok(!s.calls.some(c=>c.name==='commercial_save_proposal_once'));});
await test('public result has a summary, not the original payload or tokens',async()=>{const r=await GET(req());const body=await r.json();assert.equal(body.request.requestId,requestId);assert.equal(body.request.payload,undefined);assert.equal(body.request.items,undefined);assert.equal(r.headers.get('Cache-Control'),'no-store, private');});
await test('legitimate empty list differs from a read/migration failure',async s=>{s.noPending=true;assert.deepEqual(await (await GET(req())).json(),{request:null});s.selectError=true;const r=await GET(req());assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private detail'));});
await test('invalid types and invalid actions fail before a database call',async s=>{assert.equal((await GET(req(undefined,'leads'))).status,400);for(const raw of [[],null,{...input(),requestId:'bad'},{...input(),confirmed:false},{...input(),action:'delete'}])assert.equal((await POST(req(raw))).status,400);assert.equal(s.calls.length,0);});
await test('a committed proposal is read only: no save or secondary stage effect',async s=>{s.current.state='committed';s.current.record={id:recordId,proposal_number:1};await POST(req(input()));assert.deepEqual(s.calls.map(c=>c.name),['commercial_get_source_recovery']);assert.equal(s.agenda.length,0);});
await test('a committed agenda never sends another external request',async s=>{s.current.entity_type='agenda_events';s.current.state='committed';s.current.record={id:recordId,title:'Visita'};await POST(req(input()));assert.equal(s.agenda.length,0);});
await test('retry uses the stored proposal payload and original key, not browser replacements',async s=>{await POST(req({...input(),p_org:id(99),payload:{data:{notes:'Forged'}}}));const call=s.calls.find(c=>c.name==='commercial_save_proposal_once');assert.equal(call.args.p_org,org);assert.equal(call.args.p_request,requestId);assert.deepEqual(call.args.p_data,s.current.payload.data);assert.deepEqual(call.args.p_items,s.current.payload.items);assert.ok(!JSON.stringify(call).includes('Forged'));});
await test('pending agenda reuses the existing human handler with the exact saved key/data',async s=>{s.current.entity_type='agenda_events';s.current.payload={title:'Visita pendente',starts_at:'2030-01-01T12:00:00Z'};const r=await POST(req(input()));assert.equal(r.status,200);assert.deepEqual(s.agenda,[{body:s.current.payload,key:requestId}]);assert.match((await r.json()).warning,/Outlook/);});
await test('agenda availability failure is not presented as confirmation',async s=>{s.current.entity_type='agenda_events';s.agendaFails=true;assert.equal((await POST(req(input()))).status,503);assert.equal(s.current.state,'pending');});
await test('safe abandonment returns committed if the save won; it never calls source deletion',async s=>{s.current.state='committed';s.current.record={id:recordId};const r=await POST(req(input('abandon')));assert.equal((await r.json()).request.state,'committed');assert.deepEqual(s.calls.map(c=>c.name),['commercial_finish_source_recovery']);});
await test('acknowledged and abandoned commands are never retried',async s=>{for(const state of ['acknowledged','abandoned','committed_unavailable']){s.current.state=state;s.calls=[];await POST(req(input()));assert.equal(s.calls.length,1);assert.equal(s.agenda.length,0);}});
await test('another tab finishing between listing and reading is not shown as unresolved',async s=>{s.current.state='acknowledged';assert.deepEqual(await(await GET(req())).json(),{request:null});});
await test('transport failures preserve uncertainty and do not leak raw errors',async s=>{s.throwRpc=true;const r=await POST(req(input()));assert.equal(r.status,503);assert.ok(!(await r.text()).includes('Network'));});
await test('malformed committed response cannot trigger a retry or claim success',async s=>{s.current.state='committed';s.current.record={};assert.equal((await POST(req(input()))).status,503);assert.equal(s.calls.length,1);});
await test('view conversion and actions validate identifiers and explicit confirmation',async()=>{assert.equal(parseRecoveryAction(input())?.action,'retry');assert.equal(parseRecoveryAction({...input(),confirmed:'yes'}),null);assert.throws(()=>publicRecovery({}),/Invalid/);});
await test('recovery UI contains explicit consent and no automatic retry or browser command storage',async()=>{const text=fs.readFileSync(new URL('../../src/components/CommercialSaveRecovery.tsx',import.meta.url),'utf8');assert.match(text,/type="checkbox"/);assert.match(text,/onClick=.*act\('retry'\)/);assert.ok(!/localStorage|sessionStorage|indexedDB/.test(text));assert.ok(!text.slice(text.indexOf('useEffect(()'),text.indexOf('async function act')).includes("method: 'POST'"));});
console.log(`PASS: ${passed} isolated recovery endpoint/helper/structure cases. Not a real browser or provider test.`);
