import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { integritySetupSql,id,org,user } from './integrity-fixture.mjs';

const localContainer=process.env.BOSSA_TEST_CONTAINER==='bossa-reconciliation-test';
if(!localContainer && (process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='commercial_reconciliation_test'))
 throw Error('Requires disposable commercial_reconciliation_test database');
const sql=(script)=>new Promise((resolve,reject)=>{
 const base=['-X','-A','-t','-v','ON_ERROR_STOP=1'];
 const child=localContainer
  ? spawn('docker',['exec','-i','bossa-reconciliation-test','psql',...base,'-U','postgres','-d','commercial_reconciliation_test'])
  : spawn('psql',base);
 let out='',err=''; child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
 child.on('close',code=>code?reject(Error(err)):resolve(out.trim()));child.stdin.end(script);
});
for(const text of integritySetupSql()) await sql(text.replace(
 'create role anon; create role authenticated; create role service_role bypassrls;',
 ()=>`do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
 end $$;`,
));
await sql(fs.readFileSync(new URL('../../supabase/migrations/20261021190000_commercial_contact_reconciliation.sql',import.meta.url),'utf8'));
await sql(`insert into profiles values('${id(12)}'); insert into memberships values('${org}','${id(12)}','admin');
 insert into commercial_opportunities(organization_id,title,primary_contact_id,stage)
 values('${org}','Compra documentada','${id(50)}','contact');`);
const auth=(uid)=>`select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`;
const reason='Duas fichas confirmadas por documento de identidade e contrato.';
const evidence='Contrato e documento conferidos presencialmente';
const propose=(a,b)=>`select commercial_propose_contact_reconciliation('${org}','${a}','${b}','${id(50)}','${reason}','${evidence}');`;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitLock(gate) {
 for(let i=0;i<60;i++) {
  if((await sql(`select exists(select 1 from pg_locks where locktype='advisory' and objid=${gate} and granted);`))==='t') return;
  await pause(25);
 }
 throw Error('Lock barrier was not reached');
}
const first=sql(`begin; set local lock_timeout='5s'; ${auth(user)} ${propose(id(50),id(51))}
 select pg_advisory_xact_lock(981117); select pg_sleep(1); commit;`);
await waitLock(981117);
const competing=sql(`begin; set local lock_timeout='5s'; ${auth(user)} ${propose(id(51),id(50))} commit;`);
const results=await Promise.allSettled([first,competing]);
assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled');
assert.equal(await sql(`select count(*) from commercial_contact_reconciliations;`),'1');
console.log('PASS reconciliation concurrency: reverse proposals serialize and create one review');

const rid=await sql('select id from commercial_contact_reconciliations;');
const review=(confirm)=>`select commercial_review_contact_reconciliation('${org}','${rid}',${confirm},'${reason}');`;
const approving=sql(`begin; set local lock_timeout='5s'; ${auth(id(12))} ${review(true)}
 select pg_advisory_xact_lock(981118); select pg_sleep(1); commit;`);
await waitLock(981118);
const rejecting=sql(`begin; set local lock_timeout='5s'; ${auth(user)} ${review(false)} commit;`);
const decisions=await Promise.allSettled([approving,rejecting]);
assert.equal(decisions[0].status,'fulfilled');assert.equal(decisions[1].status,'rejected');
assert.match(String(decisions[1].reason),/ALREADY_REVIEWED/);
assert.equal(await sql(`select status from commercial_contact_reconciliations where id='${rid}';`),'confirmed');
assert.equal(await sql(`select primary_contact_id from commercial_opportunities where primary_contact_id='${id(50)}';`),id(50));
console.log('PASS reconciliation concurrency: competing decisions leave one confirmation and preserve sources');
