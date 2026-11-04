import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkCanonicalMerge,mergeAfterConfirmedSend } from '../../src/lib/commercial/canonical-merge.ts';
import { commercialIdentityError } from '../../src/lib/commercial/identity-errors.ts';
const keep='00000000-0000-0000-0000-000000000001',dup='00000000-0000-0000-0000-000000000002';
let checks=0;
const test=async(name,fn)=>{await fn();console.log(`PASS merge response ${++checks}: ${name}`);};
const client=(data,error=null)=>({rpc:async()=>({data,error})});
await test('no requested merge performs no RPC',async()=>{
 const c={rpc:()=>{throw Error('Unexpected RPC');}};
 assert.equal((await mergeAfterConfirmedSend(c,keep,null)).status,'not_requested');
 assert.equal((await mergeAfterConfirmedSend(c,keep,keep)).status,'not_requested');
});
await test('confirmed matching merge exposes duplicate ID',async()=>{
 const result=await mergeAfterConfirmedSend(client({ok:true,kept:keep,archived:dup}),keep,dup);
 assert.equal(result.status,'merged');assert.equal(result.mergedFromLeadId,dup);assert.equal(result.warning,null);
});
await test('RPC-level error does not masquerade as a merge or a failed send',async()=>{
 const result=await mergeAfterConfirmedSend(client(null,{message:'SQL rejected'}),keep,dup);
 assert.equal(result.status,'failed');assert.equal(result.mergedFromLeadId,null);assert.match(result.warning,/Mensagem enviada/);
});
await test('thrown network error is a merge warning, not an invitation to resend',async()=>{
 const result=await mergeAfterConfirmedSend({rpc:async()=>{throw Error('Network');}},keep,dup);
 assert.equal(result.status,'failed');assert.match(result.warning,/não reenvie/);
});
await test('commercial refusal is explicitly review-required',async()=>{
 const result=await mergeAfterConfirmedSend(client({ok:false,review_required:true}),keep,dup);
 assert.equal(result.status,'review_required');assert.equal(result.mergedFromLeadId,null);
});
for(const data of [null,{},[],{ok:true},{ok:'true',kept:keep,archived:dup},{ok:true,kept:dup,archived:keep}]) {
 await test('malformed or mismatched success is never accepted',async()=>assert.equal((await mergeAfterConfirmedSend(client(data),keep,dup)).status,'failed'));
}
await test('preflight permits only a strict positive result',async()=>{
 assert.equal((await checkCanonicalMerge(client({can_merge:true}),keep,dup)).status,'ready');
 assert.equal((await checkCanonicalMerge(client({can_merge:false}),keep,dup)).status,'review_required');
 for(const data of [null,{},[],{can_merge:'true'}]) assert.equal((await checkCanonicalMerge(client(data),keep,dup)).status,'unavailable');
});
await test('unavailable migration/transport fails closed before send',async()=>{
 assert.equal((await checkCanonicalMerge(client(null,{code:'PGRST202'}),keep,dup)).status,'unavailable');
 assert.equal((await checkCanonicalMerge({rpc:async()=>{throw Error('offline');}},keep,dup)).status,'unavailable');
});
await test('protected database codes have understandable messages',async()=>{
 for(const message of ['COMMERCIAL_HISTORY_PROTECTED','COMMERCIAL_SOURCE_PROTECTED','INTAKE_PRESERVE_SOURCE','COMMERCIAL_EVIDENCE_PROTECTED','COMMERCIAL_CONTACT_UNAVAILABLE']) assert.equal(typeof commercialIdentityError({message}),'string');
 assert.equal(commercialIdentityError({message:'other error'}),null);
});
await test('send route checks before provider and publishes only confirmed merge ID',async()=>{
 const route=fs.readFileSync(new URL('../../src/app/api/whatsapp/send/route.ts',import.meta.url),'utf8');
 assert.ok(route.indexOf('await checkCanonicalMerge')<route.indexOf('await provider.sendText'));
 assert.ok(route.indexOf('await mergeAfterConfirmedSend')>route.indexOf('await provider.sendText'));
 assert.match(route,/mergedFromLeadId: merge\.mergedFromLeadId/);
 assert.doesNotMatch(route,/mergedFromLeadId: canonicalizedFromLeadId/);
});
console.log(`PASS: ${checks} merge outcome/helper scenarios. Provider is never called by this test.`);
