import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { id,org,user,dev,unit } from './intake-fixture.mjs';
const exec=promisify(execFile);
const sql=async(text)=>(await exec('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',text],{maxBuffer:4*1024*1024,timeout:15000})).stdout.trim();
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='commercial_test') throw Error('Requires isolated CI PostgreSQL');
// Run after check-intake-concurrency: reuse its five-migration isolated fixture.
await sql(fs.readFileSync(new URL('../../supabase/migrations/20261021162332_commercial_fact_stage_sync.sql',import.meta.url),'utf8'));
await sql(`update memberships set role='admin' where user_id='${user}';`);
const auth=`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`;
const make=async(n)=>{
 const o=id(n),p=id(n+1),v=id(n+2);
 await sql(`${auth}
 insert into commercial_opportunities(id,organization_id,title,primary_contact_id,stage) values('${o}','${org}','Concorrência de etapas','${id(30)}','contact');
 insert into proposals(id,organization_id,lead_id,opportunity_id,development_id,unit_id,status,proposed_price) values('${p}','${org}','${id(30)}','${o}','${dev}','${unit}','rascunho',100000);
 insert into agenda_events(id,organization_id,lead_id,opportunity_id,status,starts_at,event_type,visit_kind,created_by_kind) values('${v}','${org}','${id(30)}','${o}','scheduled',now()-interval '1 hour','visita','buyer','human');`);
 return {o,p,v};
};
const first=await make(700);
await sql(`${auth} update commercial_settings set auto_stage_enabled=true where organization_id='${org}';`);
const send=(p)=>`update proposals set status='enviada',sent_at=now() where id='${p}';`;
const complete=(v)=>`update agenda_events set visit_outcome='completed' where id='${v}';`;
// Concurrent evidence writes have key-share FKs to the same purchase. The stage
// lock must not deadlock with those FKs and must never regress a later stage.
await Promise.all([
 sql(`begin; set local lock_timeout='4s'; ${auth} ${send(first.p)} select pg_sleep(0.5); commit;`),
 sql(`begin; set local lock_timeout='4s'; ${auth} ${complete(first.v)} commit;`),
]);
assert.equal(await sql(`select stage from commercial_opportunities where id='${first.o}';`),'proposal');
assert.equal(await sql(`select count(*) from commercial_stage_decisions where opportunity_id='${first.o}' and decision='advanced';`).then(Number)>=1,true);
console.log('PASS stage concurrency: simultaneous visit and proposal preserve the furthest justified stage without FK deadlock');
const second=await make(710);
// Both transactions begin before either finishes; a fact recorded now must not
// be mistaken for a deliberately backdated fact merely because it waited.
await Promise.all([
 sql(`begin; set local lock_timeout='4s'; ${auth} ${complete(second.v)} select pg_sleep(0.5); commit;`),
 sql(`begin; set local lock_timeout='4s'; ${auth} ${send(second.p)} commit;`),
]);
assert.equal(await sql(`select stage from commercial_opportunities where id='${second.o}';`),'proposal');
console.log('PASS stage concurrency: a higher stage also wins when visit completion takes the opportunity lock first');
const third=await make(720);
await Promise.all([
 sql(`begin; set local lock_timeout='4s'; ${auth} ${send(third.p)} select pg_sleep(0.5); commit;`),
 sql(`begin; set local lock_timeout='4s'; ${auth} ${send(third.p)} commit;`),
]);
assert.equal(await sql(`select count(*) from commercial_stage_decisions where opportunity_id='${third.o}' and decision='advanced';`),'1');
console.log('PASS stage concurrency: replayed status updates do not advance or audit the same sending twice');
