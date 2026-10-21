import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SourceSaveAttempt,sourceRequestFailure } from '../../src/lib/commercial/source-request.ts';
import { microsoftEventCreateOptions } from '../../src/lib/microsoft-event-write.ts';
let count=0;const test=(name,fn)=>{fn();console.log(`PASS client ${++count}: ${name}`);};
test('same command keeps the key after an uncertain response',()=>{
 const a=new SourceSaveAttempt();assert.equal(a.prepare({a:1,b:2},()=> 'key-one'),'key-one');
 a.rejected(new Error('Network unavailable'));assert.equal(a.prepare({b:2,a:1},()=> 'wrong'),'key-one');
 assert.throws(()=>a.prepare({a:2,b:2}),/anterior/);assert.equal(a.pending,true);
});
test('known rollback permits corrected input, but payload/key collision does not',()=>{
 const a=new SourceSaveAttempt();a.prepare({a:1},()=> 'one');a.rejected({code:'23505',message:'COMMERCIAL_REQUEST_REUSED'});
 assert.throws(()=>a.prepare({a:2}),/anterior/);a.rejected({code:'23514',message:'COMMERCIAL_ITEMS_TOTAL_MISMATCH'});
 assert.equal(a.prepare({a:2},()=> 'two'),'two');
});
test('success ends an attempt; new explicit action gets another key',()=>{
 const a=new SourceSaveAttempt();a.prepare({a:1},()=> 'one');a.complete();assert.equal(a.pending,false);
 assert.equal(a.prepare({a:1},()=> 'two'),'two');
});
test('missing migration is explicit and has no privileged fallback',()=>{
 const failure=sourceRequestFailure({code:'PGRST202'});assert.equal(failure.status,503);assert.equal(failure.definiteRollback,true);
 assert.match(failure.message,/alternativo/);
});
test('editing stale data is a conflict; permission denial is forbidden',()=>{
 assert.equal(sourceRequestFailure({message:'COMMERCIAL_SOURCE_CHANGED',code:'40001'}).status,409);
 assert.equal(sourceRequestFailure({code:'42501'}).status,403);
});
test('physical meeting creation also has a stable Graph transactionId',()=>{
 assert.deepEqual(microsoftEventCreateOptions({id:'event-one',meeting_mode:'presencial'}),{transactionId:'event-one'});
});
test('Teams creation retains meeting options; PATCH does not reset creation identity',()=>{
 assert.deepEqual(microsoftEventCreateOptions({id:'event-one',meeting_mode:'video'}),{transactionId:'event-one',isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness'});
 assert.deepEqual(microsoftEventCreateOptions({id:'event-one',meeting_mode:'video',microsoft_event_id:'remote'}),{});
});
test('proposal editor no longer performs split payment writes and records success before optional stage work',()=>{
 const s=fs.readFileSync('src/components/ProposalsManager.tsx','utf8');
 const save=s.slice(s.indexOf('async function saveProposal'),s.indexOf('async function changeStatus'));
 assert.match(save,/commercial_save_proposal_once/);assert.ok(!save.includes("from('proposal_payment_items')"));
 assert.ok(save.indexOf('setEditingId(saved.id)')<save.indexOf('const stageResponse'));
 assert.match(save,/!data.replayed/);assert.match(save,/saveLock.current = true/);
 assert.ok(!save.includes('created_by: currentUserId'));assert.match(save,/p_expected_updated_at/);
});
test('agenda editor includes a retry key, prevents concurrent click, and displays warnings',()=>{
 const s=fs.readFileSync('src/components/AgendaCalendar.tsx','utf8');
 assert.match(s,/Idempotency-Key/);assert.match(s,/saveLock.current = true/);assert.match(s,/setNotice\(\(payload.warning/);assert.match(s,/\+ recoveryWarning/);
});
console.log(`PASS: ${count} client/helper/structural checks. UI structure is not a rendered-browser test.`);
