import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { sourceRequestSetupSql,id,org,user,dev,unit } from './source-request-fixture.mjs';
const exec=promisify(execFile);
const sql=async(text)=>(await exec('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',text],{timeout:20000,maxBuffer:8*1024*1024})).stdout.trim();
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='commercial_source_request_test') throw Error('Disposable local request-test database required');
for(const statement of sourceRequestSetupSql()) await sql(statement);
const auth=`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`;
const quote=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const data={development_id:dev,unit_id:unit,lead_id:id(50),status:'rascunho',list_price:100000,proposed_price:90000,discount_amount:10000,payment_plan:{},snapshot:{},notes:null};
const items=[{kind:'entrada',quantity:1,amount:90000}];
const save=(key,d=data,entity=null,revision=null)=>`select commercial_save_proposal_once('${org}','${key}',${quote(d)},${quote(items)},${entity?`'${entity}'`:'null'},${revision?`'${revision}'`:'null'});`;
const create=(key,title='Visita')=>`select commercial_create_agenda_once('${org}','${key}',${quote({assigned_to:user,title,event_type:'visita',meeting_mode:'presencial',starts_at:'2030-01-01T12:00:00Z',ends_at:'2030-01-01T13:00:00Z'})});`;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function gate(n){for(let i=0;i<100;i++){if(await sql(`select exists(select 1 from pg_locks where locktype='advisory' and objid=${n} and granted);`)==='t')return;await pause(20);}throw Error('Lock barrier was not reached');}
async function race(n,a,b){
 const first=sql(`begin; set local lock_timeout='5s'; ${auth} ${a} select pg_advisory_xact_lock(${n}); select pg_sleep(1.2); commit;`);
 try{await gate(n);return await Promise.allSettled([first,sql(`begin; set local lock_timeout='5s'; ${auth} ${b} commit;`)]);}
 catch(error){await first.catch(()=>{});throw error;}
}
let r=await race(982001,save(id(2000)),save(id(2000)));
assert.ok(r.every(x=>x.status==='fulfilled'));assert.match(r[1].value,/"replayed": true/);
assert.equal(await sql(`select count(*) from proposals where commercial_request->>'id'='${id(2000)}';`),'1');
assert.equal(await sql(`select count(*) from activities where metadata->>'request_id'='${id(2000)}';`),'1');
console.log('PASS request concurrency: simultaneous identical creates commit one proposal, one receipt and one activity');
r=await race(982002,save(id(2001)),save(id(2001),{...data,notes:'Changed'}));
assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');assert.match(r[1].reason.stderr,/COMMERCIAL_REQUEST_REUSED/);
console.log('PASS request concurrency: same key with different data rejects the second command');
const target=await sql(`select id from proposals where commercial_request->>'id'='${id(2000)}';`);
const revision=await sql(`select updated_at::text from proposals where id='${target}';`);
r=await race(982003,save(id(2002),{...data,notes:'Winner'},target,revision),save(id(2003),{...data,notes:'Stale'},target,revision));
assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');assert.match(r[1].reason.stderr,/COMMERCIAL_SOURCE_CHANGED/);
assert.equal(await sql(`select notes from proposals where id='${target}';`),'Winner');
console.log('PASS request concurrency: two edits of the same revision never overwrite the first commit');
r=await race(982004,create(id(3000)),create(id(3000)));
assert.ok(r.every(x=>x.status==='fulfilled'));assert.match(r[1].value,/"replayed": true/);
assert.equal(await sql(`select count(*) from agenda_events where commercial_request->>'id'='${id(3000)}';`),'1');
console.log('PASS request concurrency: two identical agenda creates produce one event');
await sql(`update agenda_events set status='cancelled' where commercial_request->>'id'='${id(3000)}';`);
r=await race(982005,create(id(3001)),create(id(3002),'Different command'));
assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');assert.match(r[1].reason.stderr,/COMMERCIAL_AGENDA_CONFLICT/);
console.log('PASS request concurrency: different commands for an overlapping slot conflict rather than silently deduplicating');
