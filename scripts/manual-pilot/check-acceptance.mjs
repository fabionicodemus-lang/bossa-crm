// Real handlers + disposable PostgreSQL/PGlite ACL/RLS and the repository's actual history trigger.
// No managed Auth, production data, remote SQL or new database grants.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'pilot-356-'));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),lead=id(20),foreign=id(21),proposal=id(30),development=id(40),unit=id(50);
const db=new PGlite();let user=id(10),signedIn=true,race=null,adminCalls=0;
const qid=s=>{assert.match(s,/^[a-z_]+$/);return '"'+s+'"';};
class Query {
 constructor(table){this.table=table;this.filters=[];this.op='select';this.count=100;}
 select(){return this;}
 eq(k,v){this.filters.push([k,v]);return this;}
 is(k,v){return this.eq(k,v);}
 in(k,v){this.filters.push([k,v,'in']);return this;}
 order(){return this;}
 limit(n){this.count=n;return this;}
 update(value){this.op='update';this.value=value;return this;}
 insert(){throw Error('Direct activity/source insert forbidden in this fixture');}
 maybeSingle(){return this.run(true);}
 then(resolve,reject){return this.run(false).then(resolve,reject);}
 async run(one){
  if(this.op==='update'&&race){const f=race;race=null;await f();}
  const values=[],param=v=>{values.push(v);return '$'+values.length;};
  const patch=this.op==='update'?Object.entries(this.value).map(([k,v])=>`${qid(k)}=${param(v)}`).join(','):'';
  const where=this.filters.map(([k,v,op])=>v===null?`${qid(k)} is null`:op==='in'?`${qid(k)} in (${v.map(param).join(',')})`:`${qid(k)}=${param(v)}`).join(' and ')||'true';
  const sql=this.op==='update'?`update ${qid(this.table)} set ${patch} where ${where} returning *`:`select * from ${qid(this.table)} where ${where} limit ${this.count}`;
  try{const result=await db.query(sql,values);const rows=JSON.parse(JSON.stringify(result.rows));return {data:one?rows[0]??null:rows,error:null};}
  catch(error){return {data:null,error:{code:error.code,message:error.message}};}
 }
}
const client={from:table=>new Query(table),auth:{getUser:async()=>({data:{user:signedIn?{id:user}:null}})}};
globalThis.__pilot356={client,admin(){adminCalls++;throw Error('Administrative client forbidden');}};
async function handler(file){
 const outfile=path.join(dir,path.basename(path.dirname(file))+fs.readdirSync(dir).length+'.cjs');
 await build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'isolated-session',setup(b){
  b.onResolve({filter:/^@\/lib\/supabase\/(server|admin)$/},a=>({path:a.path,namespace:'session'}));
  b.onResolve({filter:/^(@\/lib\/auth|@\/app\/api\/agenda\/route)$/},a=>({path:a.path,namespace:'session'}));
  b.onLoad({filter:/.*/,namespace:'session'},a=>({loader:'js',contents:a.path.endsWith('admin')?'export const createAdminClient=()=>globalThis.__pilot356.admin();':a.path.endsWith('/auth')?'export const getCurrentContext=async()=>globalThis.__pilot356.context;':a.path.endsWith('agenda/route')?'export function POST(){throw Error("Agenda must not be called for proposal recovery");}':'export const createClient=async()=>globalThis.__pilot356.client;'}));
 }}]});return require(outfile);
}
async function as(n){user=id(n);globalThis.__pilot356.context={userId:user,role:n===12?'viewer':n===11?'comercial':'admin',organization:{id:n===13?other:org}};await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
async function owner(sql){await db.exec('reset role');await db.exec(sql);await as(Number(user.slice(-12)));}
let checks=0;async function check(name,fn){await fn();console.log('PASS '+name);checks++;}
try{
 process.env.NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE='manual-pilot';process.env.BOSSA_HOMOLOGATION_MODE='manual-pilot';
 await db.exec(`create role authenticated;create schema auth;create schema private;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table memberships(organization_id uuid,user_id uuid,role text);
  create function private.is_org_member(uuid) returns boolean language sql as $$select exists(select 1 from memberships where organization_id=$1 and user_id=auth.uid())$$;
  create function private.can_edit_org(uuid) returns boolean language sql as $$select exists(select 1 from memberships where organization_id=$1 and user_id=auth.uid() and role in ('admin','comercial'))$$;
  create table leads(id uuid primary key,organization_id uuid,kind text,stage text,name text,company text,owner_id uuid,owner_mode text,ai_enabled boolean,automation_paused boolean,opt_out boolean,archived_at timestamptz,updated_at timestamptz,next_action text,next_action_type text,next_action_due_at timestamptz);
  create table activities(id uuid default gen_random_uuid(),organization_id uuid,lead_id uuid,user_id uuid,type text,title text,description text,metadata jsonb);
  create table proposals(id uuid primary key,organization_id uuid,lead_id uuid,development_id uuid,unit_id uuid,status text,proposal_number int,proposed_price numeric,list_price numeric,discount_amount numeric,valid_until date,notes text,snapshot jsonb,payment_plan jsonb,created_at timestamptz);
  create table developments(id uuid primary key,organization_id uuid,name text,delivery_date date,logo_path text);
  create table development_units(id uuid primary key,organization_id uuid,unit_code text);
  create table proposal_payment_items(organization_id uuid,proposal_id uuid,kind text,label text,quantity int,amount numeric,start_date date,interval_months int,sort_order int,metadata jsonb);
  grant usage on schema public,auth,private to authenticated;grant select on all tables in schema public to authenticated;
  grant update(stage,ai_enabled,owner_mode,owner_id,next_action,next_action_type,next_action_due_at) on leads to authenticated;
  alter table leads enable row level security;
  create policy lead_read on leads for select to authenticated using(private.is_org_member(organization_id));
  create policy lead_write on leads for update to authenticated using(private.can_edit_org(organization_id)) with check(private.can_edit_org(organization_id));
  create policy pilot_manual on leads as restrictive for update to authenticated using(true) with check(ai_enabled=false and automation_paused=true and owner_mode in ('human','none'));
  insert into memberships values('${org}','${id(10)}','admin'),('${org}','${id(11)}','comercial'),('${org}','${id(12)}','viewer'),('${other}','${id(13)}','admin');
  insert into leads values('${lead}','${org}','cliente','novo_triagem','Cliente Fictício',null,'${id(10)}','human',false,true,false,null,'2026-01-01',null,null,null),('${foreign}','${other}','cliente','novo_triagem','Outra organização',null,'${id(13)}','human',false,true,false,null,'2026-01-01',null,null,null);
  insert into proposals values('${proposal}','${org}','${lead}','${development}','${unit}','enviada',1,100,100,0,null,null,'{"nominal_total":100,"workflow_status":"enviada"}','{}','2026-01-01');
  insert into developments values('${development}','${org}','Flow','2030-01-01','must-not-download.jpg');
  insert into development_units values('${unit}','${org}','101');
  insert into proposal_payment_items values('${org}','${proposal}','entrada','Entrada',1,100,'2026-01-01',null,0,'{}');`);
 await db.exec('alter table leads add column last_human_activity_at timestamptz;grant update(updated_at,last_human_activity_at) on leads to authenticated;');
 for(const table of ['activities','proposals','developments','development_units','proposal_payment_items'])await db.exec(`alter table ${table} enable row level security;create policy org_read on ${table} for select to authenticated using(private.is_org_member(organization_id));`);
 const source=fs.readFileSync('supabase/migrations/001_bossa_crm.sql','utf8');
 const trigger=source.match(/create or replace function public\.log_lead_stage_change\(\)[\s\S]*?\$\$;/)[0];
 const body=trigger.match(/as \$\$([\s\S]*?)\$\$;/)[1];assert.equal(createHash('md5').update(body).digest('hex'),'0d953f9c2b2de2b8156ef6f8e55293c6');
 await db.exec(trigger+`;create trigger leads_log_stage_change after update on leads for each row execute function public.log_lead_stage_change();revoke all on function public.log_lead_stage_change() from public,authenticated;`);
 const stage=await handler('src/app/api/leads/[id]/stage/route.ts'),bulk=await handler('src/app/api/leads/bulk-stage/route.ts'),pdf=await handler('src/app/api/propostas/[id]/pdf/route.ts');
 const move=(body,who=lead)=>stage.POST(new Request('http://localhost/api/leads/'+who+'/stage',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:who})});
 const print=()=>pdf.GET(new Request('http://localhost/pdf'),{params:Promise.resolve({id:proposal})});
 await as(10);
 await check('stage works with NO automation_paused UPDATE and NO activity INSERT; real trigger records one actor/from/to event',async()=>{
  assert.equal((await move({stage:'humano_ativo'})).status,200);
  let rows=(await db.query('select * from activities')).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,id(10));assert.deepEqual(rows[0].metadata,{from:'novo_triagem',to:'humano_ativo'});
  assert.equal((await move({stage:'humano_ativo'})).status,200);assert.equal((await db.query('select * from activities')).rows.length,1);
  await as(11);assert.equal((await move({stage:'agendado'})).status,200);
  rows=(await db.query('select * from activities')).rows;assert.equal(rows.length,2);assert.equal(rows[1].user_id,id(11));
 });
 await check('viewer, foreign organization, invalid/AI stage and unsafe automation state fail closed',async()=>{
  await as(12);assert.equal((await move({stage:'futuro'})).status,403);
  await as(13);assert.equal((await move({stage:'futuro'})).status,404);
  await as(10);assert.equal((await move({stage:'qualificacao_ia'})).status,400);assert.equal((await move({stage:'unknown'})).status,400);
  signedIn=false;assert.equal((await move({stage:'futuro'})).status,401);signedIn=true;
  await owner(`update leads set automation_paused=false where id='${lead}'`);assert.equal((await move({stage:'futuro'})).status,409);await owner(`update leads set automation_paused=true where id='${lead}'`);
 });
 await check('audit trigger failure rolls back stage; concurrent stage change returns 409 without overwriting winner',async()=>{
  const before=(await db.query('select stage from leads where id=$1',[lead])).rows[0].stage;
  await owner(`create function fail_audit() returns trigger language plpgsql as $$begin raise exception 'Fixture audit unavailable';end$$;create trigger fail_audit before insert on activities for each row execute function fail_audit()`);
  assert.equal((await move({stage:'futuro'})).status,500);assert.equal((await db.query('select stage from leads where id=$1',[lead])).rows[0].stage,before);
  await owner('drop trigger fail_audit on activities');
  race=()=>owner(`update leads set stage='pos_reuniao',updated_at='2026-02-01' where id='${lead}'`);
  assert.equal((await move({stage:'futuro'})).status,409);assert.equal((await db.query('select stage from leads where id=$1',[lead])).rows[0].stage,'pos_reuniao');
 });
 await check('confirmed proposal stage is idempotent, scoped and never reopens terminal lead',async()=>{
  assert.equal((await move({stage:'proposta_negociacao',proposalId:foreign})).status,404);
  assert.equal((await move({stage:'proposta_negociacao',proposalId:proposal})).status,200);
  const count=(await db.query('select * from activities')).rows.length;
  assert.equal((await move({stage:'proposta_negociacao',proposalId:proposal})).status,200);assert.equal((await db.query('select * from activities')).rows.length,count);
  await owner(`update leads set stage='encerrado',owner_mode='none' where id='${lead}'`);
  assert.equal((await move({stage:'proposta_negociacao',proposalId:proposal})).status,200);assert.equal((await db.query('select stage from leads where id=$1',[lead])).rows[0].stage,'encerrado');
 });
 await check('bulk human stage also uses existing transactional history without forbidden writes',async()=>{
  const r=await bulk.POST(new Request('http://localhost/api/leads/bulk-stage',{method:'POST',body:JSON.stringify({kind:'cliente',fromStage:'encerrado',toStage:'humano_ativo'})}));
  assert.equal(r.status,200,r.status===200?'':await r.text());assert.equal((await r.json()).updated,1);
 });
 await check('PDF generated by authenticated admin/comercial/viewer RLS, with no administrative or Storage access',async()=>{
  for(const n of [10,11,12]){await as(n);const r=await print();assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.match(r.headers.get('Cache-Control'),/no-store/);assert.match(Buffer.from(await r.arrayBuffer()).toString('latin1'),/^%PDF-/);}
  assert.equal(adminCalls,0);
 });
 await check('explicit pending recovery confirms the source once, retries stage safely and keeps committed checks read-only',async()=>{
  await as(10);
  const recovery=await handler('src/app/api/commercial/recovery/route.ts');let state='pending',saves=0;
  const record=JSON.parse(JSON.stringify((await db.query('select * from proposals where id=$1',[proposal])).rows[0]));
  client.rpc=async(name,args)=>{
   if(args.p_org!==org)return {error:{code:'42501'}};
   if(name==='commercial_get_source_recovery')return {data:{request_id:id(201),entity_type:'proposals',created_at:'2026-01-01',state,record:state==='committed'?record:null,payload:{data:record,items:[]}}};
   assert.equal(name,'commercial_save_proposal_once');saves++;state='committed';return {data:{record,replayed:true}};
  };
  const retry=()=>recovery.POST(new Request('http://localhost/api/commercial/recovery',{method:'POST',body:JSON.stringify({requestId:id(201),action:'retry',confirmed:true})}));
  assert.equal((await retry()).status,200);assert.equal(saves,1);assert.equal((await db.query('select stage from leads where id=$1',[lead])).rows[0].stage,'proposta_negociacao');
  const history=(await db.query('select * from activities')).rows.length;
  assert.equal((await retry()).status,200);assert.equal(saves,1);assert.equal((await db.query('select * from activities')).rows.length,history);
  await as(12);assert.equal((await retry()).status,403);await as(13);assert.equal((await retry()).status,403);await as(10);
  await owner(`update leads set stage='humano_ativo' where id='${lead}';create trigger fail_audit before insert on activities for each row execute function fail_audit()`);
  state='pending';const failedStage=await retry();assert.equal(failedStage.status,200);assert.match((await failedStage.json()).warning,/Proposta salva/);assert.equal(state,'committed');assert.equal((await db.query('select stage from leads where id=$1',[lead])).rows[0].stage,'humano_ativo');
  await owner('drop trigger fail_audit on activities');
 });
 await check('PDF rejects no session, other organization, unreadable development and inconsistent totals without side effects',async()=>{
  signedIn=false;assert.equal((await print()).status,401);signedIn=true;await as(13);assert.equal((await print()).status,404);await as(10);
  await owner(`update proposals set proposed_price=99 where id='${proposal}'`);assert.equal((await print()).status,409);
  await owner(`update proposals set proposed_price=100 where id='${proposal}';update developments set organization_id='${other}' where id='${development}'`);assert.equal((await print()).status,404);
  assert.equal(adminCalls,0);assert.equal((await db.query('select count(*)::int n from proposals')).rows[0].n,1);
 });
 console.log(`PASS ${checks} acceptance correction groups with disposable PostgreSQL. Managed scenarios 3/5/6 still require Work revalidation.`);
}finally{delete globalThis.__pilot356;await db.close();fs.rmSync(dir,{recursive:true,force:true});}
