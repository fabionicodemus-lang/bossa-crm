import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { sourceRequestSetupSql,id,org,user,dev,unit } from './source-request-fixture.mjs';
const require=createRequire(import.meta.url);
const { build }=require('esbuild');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const db=new PGlite(),q=async(s,p=[])=>(await db.query(s,p)).rows;
const read=n=>fs.readFileSync(new URL(`../../supabase/migrations/${n}`,import.meta.url),'utf8');
for(const s of sourceRequestSetupSql())await db.exec(s);
await db.exec(read('20261021182758_commercial_recoverable_requests.sql'));
await db.exec(read('20261021203000_commercial_proposal_status_once.sql'));
await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
const saved=(await q('select commercial_save_proposal_once($1,$2,$3,$4,$5,$6) r',[org,id(8000),{
 development_id:dev,unit_id:unit,lead_id:id(30),status:'rascunho',list_price:100000,proposed_price:90000,discount_amount:10000,payment_plan:{entry_total:90000},snapshot:{workflow_status:'rascunho',client_name:'Cliente teste',development_name:'Prédio teste'}
},[{kind:'entrada',quantity:1,amount:90000}],null,null]))[0].r.record;
const props={organizationId:org,currentUserId:user,currentUserName:'Pessoa teste',canEdit:true,initialProposals:[saved],developments:[],units:[],leads:[]};
const built=await build({entryPoints:[new URL('./proposal-status-browser-entry.tsx',import.meta.url).pathname],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.tsx':'tsx'},
 define:{'process.env.NODE_ENV':'"production"'},
 alias:{'@/lib/supabase/client':new URL('./proposal-status-browser-stubs.ts',import.meta.url).pathname,'next/navigation':new URL('./proposal-status-browser-stubs.ts',import.meta.url).pathname},
 absWorkingDir:process.cwd(),nodePaths:[new URL('../../node_modules',import.meta.url).pathname],logLevel:'silent'});
const js=built.outputFiles[0].text;
let uncertain=false,callCount=0,holdNext=true,releaseHold,enteredHold;
const holdStarted=new Promise(resolve=>{enteredHold=resolve;});
const response=(res,body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(body));};
const rpc=async(name,a)=>{
 switch(name){
 case 'commercial_prepare_source_request':return (await q('select commercial_prepare_source_request($1,$2,$3,$4) r',[a.p_org,a.p_request,a.p_type,a.p_payload]))[0].r;
 case 'commercial_proposal_status_once':return (await q('select commercial_proposal_status_once($1,$2,$3,$4,$5,$6) r',[a.p_org,a.p_request,a.p_id,a.p_expected_updated_at,a.p_expected_version,a.p_workflow_status]))[0].r;
 case 'commercial_finish_source_recovery':return (await q('select commercial_finish_source_recovery($1,$2,$3) r',[a.p_org,a.p_request,a.p_action]))[0].r;
 case 'commercial_get_source_recovery':return (await q('select commercial_get_source_recovery($1,$2) r',[a.p_org,a.p_request]))[0].r;
 default:throw Error(`Unexpected RPC ${name}`);
 }
};
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(`<div id="app"></div><script>window.process={env:{NODE_ENV:'production'}};window.__PROPS__=${JSON.stringify(props)}</script><script src="/app.js"></script>`);return;}
  if(req.url==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(js);return;}
  if(req.url?.startsWith('/api/commercial/recovery?')){
   const rows=await q("select request_id from commercial_pending_source_requests where organization_id=$1 and actor_id=$2 and entity_type='proposals' and status='pending'",[org,user]);
   if(!rows.length){response(res,{request:null});return;}
   const state=await rpc('commercial_get_source_recovery',{p_org:org,p_request:rows[0].request_id});
   response(res,{request:{requestId:state.request_id,kind:'proposals',state:state.state,createdAt:state.created_at,summary:'Alteração rápida de status',recordId:state.record?.id??null,recordLabel:'Proposta teste'}});return;
  }
  const chunks=[];for await(const c of req)chunks.push(c);const input=JSON.parse(Buffer.concat(chunks).toString());
  if(req.url==='/rpc'){
   callCount++;
   if(input.name==='commercial_proposal_status_once'&&holdNext){holdNext=false;enteredHold();await new Promise(resolve=>{releaseHold=resolve;});}
   const data=await rpc(input.name,input.args);
   if(uncertain&&input.name==='commercial_proposal_status_once'){uncertain=false;response(res,{data:null,error:{message:'Network response lost'}},503);return;}
   response(res,{data,error:null});return;
  }
  if(req.url==='/api/commercial/recovery'){
   const state=await rpc('commercial_get_source_recovery',{p_org:org,p_request:input.requestId});
   if(input.action==='acknowledge')await rpc('commercial_finish_source_recovery',{p_org:org,p_request:input.requestId,p_action:'acknowledge'});
   response(res,{request:{requestId:state.request_id,kind:'proposals',state:input.action==='acknowledge'?'acknowledged':state.state,createdAt:state.created_at,summary:'Alteração rápida de status',recordId:state.record?.id??null,recordLabel:'Proposta teste'}});return;
  }
  response(res,{error:'Not found'},404);
 }catch(e){response(res,{data:null,error:{message:String(e)}},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const select=page.getByRole('combobox',{name:'Status da proposta #'+saved.proposal_number});
 try { await select.waitFor({timeout:5000}); } catch(error) { console.error('Browser errors:',errors,'Body:',(await page.locator('body').innerText()).slice(0,1000)); throw error; }
 await select.selectOption('enviada');
 await holdStarted;
 assert.equal(await select.isDisabled(),true);
 releaseHold();
 await page.getByText('Status e atividade salvos juntos.',{exact:false}).waitFor();
 assert.equal((await q("select count(*)::int n from activities where metadata->>'workflow_status'='enviada'"))[0].n,1);
 assert.equal((await q('select version from proposals where id=$1',[saved.id]))[0].version,saved.version+1);
 console.log('PASS rendered component: status selection blocks simultaneous input, commits and displays success');
 uncertain=true;
 await select.selectOption('aprovada');
 await page.getByText('Resposta incerta.',{exact:false}).waitFor();
 const panel=page.getByRole('region',{name:'Recuperação de salvamento'});
 await panel.getByText('A gravação foi confirmada no CRM.').waitFor();
 assert.equal(await select.isDisabled(),true);
 assert.equal((await q("select count(*)::int n from activities where metadata->>'workflow_status'='aprovada'"))[0].n,1);
 assert.ok(callCount>=4);assert.deepEqual(errors,[]);
 console.log('PASS rendered component: lost response preserves command and shows committed receipt; controls remain blocked');
 const pending=(await q("select request_id from commercial_pending_source_requests where organization_id=$1 and actor_id=$2 and status='pending'",[org,user]))[0];
 await rpc('commercial_finish_source_recovery',{p_org:org,p_request:pending.request_id,p_action:'acknowledge'});
 await page.reload();await select.waitFor();
 await select.selectOption('recusada');
 await page.getByText('A proposta foi alterada desde que você a abriu.',{exact:false}).waitFor();
 assert.equal((await q('select version from proposals where id=$1',[saved.id]))[0].version,saved.version+2);
 console.log('PASS rendered component: stale screen displays conflict without overwriting latest version');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await db.close();}
