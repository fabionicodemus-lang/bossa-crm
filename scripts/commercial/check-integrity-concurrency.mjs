import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { integritySetupSql,id,org,user } from './integrity-fixture.mjs';
const exec=promisify(execFile);
const sql=async(text)=>(await exec('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',text],{timeout:15000,maxBuffer:8*1024*1024})).stdout.trim();
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='commercial_integrity_test') throw Error('Requires the disposable integrity-test database');
for(const text of integritySetupSql()) await sql(text);
const auth=`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForGate(gate) {
 for(let attempt=0;attempt<80;attempt++) {
  if(await sql(`select exists(select 1 from pg_locks where locktype='advisory' and objid=${gate} and granted);`)==='t') return;
  await pause(25);
 }
 throw Error('First transaction did not reach the lock barrier');
}
const insert=(n,buyer)=>`insert into commercial_opportunities(id,organization_id,title,primary_contact_id,stage) values('${id(n)}','${org}','Compra concorrente','${buyer}','contact');`;
async function withHeldReference(gate,statement,competing) {
 const first=sql(`begin; set local lock_timeout='4s'; ${auth} ${statement} select pg_advisory_xact_lock(${gate}); select pg_sleep(1.3); commit;`);
 // Observe a lock taken AFTER the first write, rather than assuming scheduling order.
 try {await waitForGate(gate); return await Promise.allSettled([first,competing()]);}
 catch(error){await first.catch(()=>{});throw error;}
}
let r=await withHeldReference(981001,insert(1000,id(60)),()=>sql(`begin; set local lock_timeout='4s'; ${auth} update leads set kind='corretor' where id='${id(60)}'; commit;`));
assert.equal(r[0].status,'fulfilled'); assert.equal(r[1].status,'rejected');
assert.match(String(r[1].reason.stderr),/COMMERCIAL_HISTORY_PROTECTED/);
assert.equal(await sql(`select kind from leads where id='${id(60)}';`),'cliente');
console.log('PASS integrity concurrency: new purchase reference blocks a racing reclassification');

r=await withHeldReference(981002,`update leads set kind='corretor' where id='${id(61)}';`,()=>sql(`begin; set local lock_timeout='4s'; ${auth} ${insert(1001,id(61))} commit;`));
assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');
assert.match(String(r[1].reason.stderr),/Buyer must be a client/);
assert.equal(await sql(`select count(*) from commercial_opportunities where id='${id(1001)}';`),'0');
console.log('PASS integrity concurrency: a winning reclassification is rechecked before accepting a buyer reference');

r=await withHeldReference(981003,insert(1002,id(62)),()=>sql(`begin; set local lock_timeout='4s'; ${auth} delete from leads where id='${id(62)}'; commit;`));
assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');
assert.match(String(r[1].reason.stderr),/COMMERCIAL_HISTORY_PROTECTED/);
console.log('PASS integrity concurrency: a referenced contact cannot be deleted by the racing transaction');

await sql(`update leads set phone='5547995554433' where id='${id(63)}';
 update leads set phone='5547995554433',archived_at=now() where id='${id(64)}';
 insert into messages(id,organization_id,lead_id,body) values('${id(1100)}','${org}','${id(64)}','Histórico preservado');`);
r=await withHeldReference(981004,insert(1003,id(64)),()=>sql(`begin; set local lock_timeout='4s'; set role service_role; select public.merge_duplicate_lead('${id(63)}','${id(64)}'); commit;`));
assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'fulfilled');
assert.match(r[1].value,/commercial_history/);
assert.equal(await sql(`select lead_id from messages where id='${id(1100)}';`),id(64));
assert.equal(await sql(`select coalesce(metadata->>'merged_into','none') from leads where id='${id(64)}';`),'none');
console.log('PASS integrity concurrency: merge rechecks after locking and refuses a newly protected duplicate without moving messages');
