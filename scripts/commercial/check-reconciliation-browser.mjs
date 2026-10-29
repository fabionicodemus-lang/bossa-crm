import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { renderToString } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { integritySetupSql,id,org,user } from './integrity-fixture.mjs';
import { proposeContactReconciliation,reviewContactReconciliation } from '../../src/app/(crm)/gestao/contatos/actions.ts';
import ContactReconciliation from '../../src/app/(crm)/gestao/contatos/page.tsx';

const require=createRequire(import.meta.url);
let playwright;
try {playwright=require('playwright');}
catch {playwright=require(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const { chromium }=playwright;
const db=new PGlite();
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
for(const statement of integritySetupSql()) await db.exec(statement);
await db.exec((await import('node:fs')).readFileSync(new URL('../../supabase/migrations/20261021190000_commercial_contact_reconciliation.sql',import.meta.url),'utf8'));
await db.exec(`insert into profiles values('${id(12)}'); insert into memberships values('${org}','${id(12)}','admin');
 insert into commercial_opportunities(organization_id,title,primary_contact_id,stage) values
 ('${org}','Compra A','${id(40)}','contact'),('${org}','Compra B','${id(43)}','contact');
 insert into messages(id,organization_id,lead_id,body,status) values
 ('${id(900)}','${org}','${id(40)}','Mensagem comercial original','sent');`);

const actor={ proposer:{userId:user,role:'comercial'}, reviewer:{userId:id(12),role:'admin'} };
const activate=async name=>{
 const selected=actor[name]; if(!selected) throw Error('Unknown fixture actor');
 await db.exec('reset role');
 await q("select set_config('request.jwt.claim.sub',$1,false)",[selected.userId]);
 await db.exec('set role authenticated');
 globalThis.reconciliationActionFixture={context:{...selected,organization:{id:org}},revalidated:[],db:{
  from(table) {
   assert.equal(table,'commercial_contact_reconciliations');
   const filters=[];
   const builder={select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},limit(){return this;},
    then(resolve,reject){
     const by=Object.fromEntries(filters);
     q('select * from commercial_contact_reconciliations where organization_id=$1 and status=$2 order by proposed_at desc limit 50',
       [by.organization_id,by.status]).then(rows=>resolve({data:JSON.parse(JSON.stringify(rows)),error:null}),reject);
    }};return builder;
  },
  async rpc(name,args) {
   try {
    const result=name==='commercial_propose_contact_reconciliation'
     ? await q('select commercial_propose_contact_reconciliation($1,$2,$3,$4,$5,$6) result',
       [args.p_org,args.p_first,args.p_second,args.p_preferred,args.p_reason,args.p_evidence])
     : await q('select commercial_review_contact_reconciliation($1,$2,$3,$4) result',
       [args.p_org,args.p_id,args.p_confirm,args.p_reason]);
    return {data:result[0].result,error:null};
   } catch(error) { return {data:null,error:{message:String(error)}}; }
  },
 }};
};
const server=createServer(async(request,response)=>{
 try {
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname==='/favicon.ico') {response.writeHead(204).end();return;}
  if(url.pathname!=='/gestao/contatos' && url.pathname!=='/submit') {response.writeHead(404).end();return;}
  const who=url.searchParams.get('actor')??'proposer';
  await activate(who);
  if(request.method==='POST') {
   const chunks=[];for await(const chunk of request) chunks.push(chunk);
   const form=new FormData();for(const [key,value] of new URLSearchParams(Buffer.concat(chunks).toString()))form.set(key,value);
   try {await (form.has('first')?proposeContactReconciliation(form):reviewContactReconciliation(form));}
   catch(error) {
    if(error.message==='REDIRECT') {
     const target=new URL(error.url,'http://127.0.0.1');target.searchParams.set('actor',who);
     response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({url:target.pathname+target.search}));return;
    }
    throw error;
   }
   response.writeHead(500).end('Expected a redirect');return;
  }
  const content=renderToString(await ContactReconciliation({searchParams:Promise.resolve(Object.fromEntries(url.searchParams))}));
  const javascript=`<script>document.addEventListener('submit',async event=>{
   event.preventDefault();const form=event.target;const data=new URLSearchParams(new FormData(form));
   if(event.submitter?.name)data.set(event.submitter.name,event.submitter.value);
   const actor=new URLSearchParams(location.search).get('actor')||'proposer';
   const response=await fetch('/submit?actor='+actor,{method:'POST',body:data});
   location.href=(await response.json()).url;
  });</script>`;
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="pt-BR"><body>'+content+javascript+'</body></html>');
 } catch(error) {console.error('Browser fixture server:',error);response.writeHead(500).end(String(error.stack||error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/gestao/contatos`;
let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage();
 const proposalReason='Os dois registros foram comparados com contrato e documento apresentados na visita.';
 const evidence='Contrato e documento conferidos na visita';
 async function submitProposal(a,b) {
  await page.goto(base+'?actor=proposer');
  await page.locator('input[name=first]').fill(a);
  await page.locator('input[name=second]').fill(b);
  await page.locator('input[name=preferred]').fill(a);
  await page.locator('textarea[name=reason]').fill(proposalReason);
  await page.locator('textarea[name=evidence]').fill(evidence);
  await page.getByRole('button',{name:'Enviar para revisão de outro administrador'}).click();
  try {await page.waitForURL(/ok=1/,{timeout:5000});}
  catch(error){console.error('Browser URL:',page.url(),'Body:',(await page.locator('body').innerText()).slice(0,500));throw error;}
 }
 async function review(a,b,decision,finalState) {
  await page.goto(base+'?actor=reviewer');
  await page.getByRole('heading',{name:`Cliente de teste ${a-20} / Cliente de teste ${b-20}`}).waitFor();
  await page.locator('form:has(input[name=id]) textarea[name=reason]').first().fill('Identidade conferida separadamente nos documentos e no histórico original.');
  await page.locator('form:has(input[name=id]) button[value='+decision+']').first().click();
  await page.waitForURL(/ok=1/);
  await page.goto(base+`?actor=reviewer&state=${finalState}`);
  await page.getByRole('heading',{name:`Cliente de teste ${a-20} / Cliente de teste ${b-20}`}).waitFor();
 }
 await submitProposal(id(40),id(41));
 assert.equal(await page.getByRole('button',{name:'Confirmar relação'}).count(),0);
 await page.goto(base+'?actor=reviewer');
 await page.getByRole('heading',{name:'Cliente de teste 20 / Cliente de teste 21'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Confirmar relação'}).count(),1);
 assert.equal((await q('select count(*)::int n from commercial_contact_reconciliations where status=$1',['pending']))[0].n,1);
 await review(40,41,'confirm','confirmed');
 await submitProposal(id(43),id(44));
 await review(43,44,'reject','rejected');
 const records=await q('select contact_low_id,contact_high_id,status,contact_snapshot from commercial_contact_reconciliations order by contact_low_id');
 assert.deepEqual(records.map(r=>r.status),['confirmed','rejected']);
 assert.deepEqual(records.map(r=>r.contact_snapshot.first.id),[id(40),id(43)]);
 assert.deepEqual((await q('select primary_contact_id from commercial_opportunities order by primary_contact_id')).map(r=>r.primary_contact_id),[id(40),id(43)]);
 assert.deepEqual((await q('select lead_id,body from messages where id=$1',[id(900)]))[0],
  {lead_id:id(40),body:'Mensagem comercial original'});
 console.log('PASS rendered browser: proposal, pending view, second-user confirmation and rejection preserve contacts and snapshots');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));await db.close();}
