import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { sourceRequestSetupSql,id,org,user,dev,unit } from './source-request-fixture.mjs';
const exec=promisify(execFile),container=`bossa_status_${process.pid}`;
const docker=async(...args)=>(await exec('docker',args,{timeout:20000,maxBuffer:4e6})).stdout.trim();
const sql=async(statement)=>docker('exec',container,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','commercial_status_test','-c',statement);
const apply=async(statement)=>new Promise((resolve,reject)=>{
 const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','commercial_status_test']);
 let error='';child.stderr.on('data',c=>error+=c);child.on('close',code=>code===0?resolve():reject(Error(error)));child.stdin.end(statement);
});
const auth=`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`;
const change=(key,proposal,stamp,version,status)=>`select (commercial_proposal_status_once('${org}','${id(key)}','${proposal}','${stamp}',${version},'${status}')->>'replayed') r;`;
const waitForHold=async()=>{
 for(let i=0;i<30;i++){
  if(Number(await sql("select count(*) from pg_stat_activity where pid<>pg_backend_pid() and query like '%status_hold_barrier%' and state='active';"))>0)return;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw Error('First session did not reach lock barrier');
};
try {
 await docker('run','--rm','-d','--network','none','--name',container,'-e','POSTGRES_PASSWORD=isolated-only','-e','POSTGRES_DB=commercial_status_test','postgres:17');
 for(let i=0;i<30;i++){try{await sql('select 1;');break;}catch{if(i===29)throw Error('Disposable PostgreSQL did not start');await new Promise(r=>setTimeout(r,100));}}
 for(const statement of sourceRequestSetupSql())await apply(statement);
 for(const migration of ['20261021182758_commercial_recoverable_requests.sql','20261021203000_commercial_proposal_status_once.sql'])
  await apply(fs.readFileSync(new URL(`../../supabase/migrations/${migration}`,import.meta.url),'utf8'));
 await sql(`${auth} insert into proposals(id,organization_id,lead_id,development_id,unit_id,status,proposed_price,list_price,snapshot)
 values('${id(8500)}','${org}','${id(30)}','${dev}','${unit}','rascunho',90000,100000,'{"workflow_status":"rascunho"}');`);
 const stamp=await sql(`select updated_at from proposals where id='${id(8500)}';`);
 const first=sql(`begin; set local lock_timeout='5s'; ${auth} ${change(8501,id(8500),stamp,1,'enviada')} select pg_sleep(1) /*status_hold_barrier*/; commit;`);
 await waitForHold();
 await assert.rejects(()=>sql(`begin; set local lock_timeout='5s'; ${auth} ${change(8502,id(8500),stamp,1,'aprovada')} commit;`),/COMMERCIAL_SOURCE_CHANGED/);
 assert.match(await first,/f/);
 assert.equal(await sql(`select version from proposals where id='${id(8500)}';`),'2');
 assert.equal(await sql(`select count(*) from activities where metadata->>'proposal_id'='${id(8500)}';`),'1');
 console.log('PASS PostgreSQL concurrency: two different commands on one observed version produce one winner and one conflict');
 const secondStamp=await sql(`select updated_at from proposals where id='${id(8500)}';`);
 const repeatFirst=sql(`begin; set local lock_timeout='5s'; ${auth} ${change(8503,id(8500),secondStamp,2,'aprovada')} select pg_sleep(1) /*status_hold_barrier*/; commit;`);
 await waitForHold();
 const repeated=await sql(`begin; set local lock_timeout='5s'; ${auth} ${change(8503,id(8500),secondStamp,2,'aprovada')} commit;`);
 await repeatFirst;
 assert.match(repeated,/t/);
 assert.equal(await sql(`select version from proposals where id='${id(8500)}';`),'3');
 assert.equal(await sql(`select count(*) from activities where metadata->>'proposal_id'='${id(8500)}';`),'2');
 console.log('PASS PostgreSQL concurrency: simultaneous same-key commands commit one status, one activity and one increment');
} finally { await docker('rm','-f',container).catch(()=>{}); }
