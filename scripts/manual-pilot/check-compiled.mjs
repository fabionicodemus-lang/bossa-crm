// Compiled Next + Chromium with explicit LOCAL adapters. Work must revalidate scenarios 3/5/6.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {config,claims,site,origin} from './fixture.mjs';
const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bossa-pilot-compiled-'));
const fixture=path.join(dir,'fixture.json');
const user=(n,role,org)=>{const id=`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;const c={...claims,sub:id,email:`fixture${n}@bossa-homolog.invalid`};return {id,email:c.email,appRole:role,organizationId:org,token:[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify(c)).toString('base64url'),'unregistered-local-fixture'].join('.')};};
const org='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const users=[user(10,'admin',org),user(11,'comercial',org),user(12,'viewer',org),user(13,'admin',other)];
const lead={id:'00000000-0000-0000-0000-000000000020',organization_id:org,kind:'cliente',name:'Compiled Fixture Client',phone:null,email:null,stage:'novo_triagem',source:'Cadastro manual',temperature:0,metadata:{},ai_enabled:false,automation_paused:true,owner_mode:'human',owner_id:users[0].id,archived_at:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
const development={id:'00000000-0000-0000-0000-000000000030',organization_id:org,name:'Flow',active:true,default_payment_plan:{},delivery_date:'2030-12-01',logo_path:'must-not-download.jpg'};
const proposal={id:'00000000-0000-0000-0000-000000000080',organization_id:org,development_id:development.id,lead_id:lead.id,unit_id:null,proposal_number:1,proposed_price:100,list_price:100,discount_amount:0,version:1,status:'enviada',snapshot:{nominal_total:100,client_name:lead.name,origin:'cliente',workflow_status:'enviada'},payment_plan:{entry_total:100,proposal_date:'2026-10-28'},created_at:'2026-10-28',updated_at:'2026-10-28'};
fs.writeFileSync(fixture,JSON.stringify({users,leads:[lead,{...lead,id:'00000000-0000-0000-0000-000000000021',kind:'corretor',name:'Compiled Fixture Broker'}],developments:[development,{...development,id:'00000000-0000-0000-0000-000000000031',name:'Alma'}],proposals:[proposal],items:[{organization_id:org,proposal_id:proposal.id,kind:'entrada',label:'Entrada',quantity:1,amount:100,start_date:'2026-10-28',sort_order:0}],uncertainFirstProposalResponse:true,events:[]}));
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','HOME','TMPDIR','LANG','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'].includes(k)));
Object.assign(env,config,{NEXT_TELEMETRY_DISABLED:'1'});
const run=cmd=>new Promise((resolve,reject)=>{const log=fs.openSync(path.join(dir,'build.log'),'w');const child=spawn(cmd[0],cmd.slice(1),{env,stdio:['ignore',log,log]});child.on('error',reject);child.on('exit',code=>{fs.closeSync(log);if(code===0)resolve();else reject(Error('Manual compiled build failed; '+path.join(dir,'build.log')));});});
await run(['npm','run','build']);console.log('PASS compiled Next manual-pilot build with no administrative credentials');
const preload=path.join(dir,'preload.cjs');
fs.writeFileSync(preload,`globalThis.fetch=async(input,init)=>require(${JSON.stringify(path.join(root,'scripts/manual-pilot/transport.cjs'))}).respond(String(input),init);`);
const log=fs.openSync(path.join(dir,'server.log'),'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3003'],{env:{...env,NODE_OPTIONS:'--require='+preload,BOSSA_MANUAL_PILOT_FIXTURE_FILE:fixture},stdio:['ignore',log,log]});
const request=(pathname,method='GET',cookie='',host=new URL(site).host,body=null)=>new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port:3003,path:pathname,method,headers:{host,cookie,'x-forwarded-proto':'https','content-type':'application/json'}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});
const cookieFor=(u,access=u.token)=>'sb-okhtfibuexfsgkobjxtu-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:access,refresh_token:'not-a-managed-credential',expires_at:4102444800,expires_in:999999999,token_type:'bearer',user:{id:u.id,email:u.email}})).toString('base64url');
try{
 let response;for(let i=0;i<100;i++){try{response=await request('/login');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.equal(response?.status,200,JSON.stringify(response));
 assert.equal((await request('/clientes')).status,307);
 assert.equal((await request('/clientes','GET',cookieFor(users[0]),'other.vercel.app')).status,503);
 for(const p of ['/api/automation/followup','/api/microsoft/connect','/api/leads/x/ai','/auth/callback','/cadastro','/recuperar-senha','/configuracoes','/gestao/etapas'])for(const method of ['GET','POST'])assert.equal((await request(p,method,cookieFor(users[0]))).status,403,p);
 assert.equal((await request('/clientes','GET',cookieFor(users[0],users[0].token+'tampered'))).status,307);
 console.log('PASS compiled HTTP blocks anonymous/invalid sessions, foreign origin, forbidden APIs and action paths');
 const browser=await chromium.launch({executablePath:process.env.BOSSA_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
 const context=await browser.newContext({serviceWorkers:'block'});
 try{
  let outside=[];
  const require=createRequire(import.meta.url);process.env.BOSSA_MANUAL_PILOT_FIXTURE_FILE=fixture;const {respond}=require('./transport.cjs');
  await context.route('**/*',async route=>{const u=new URL(route.request().url());
   // Chromium's built-in PDF viewer loads local browser resources, not network integrations.
   if((u.protocol==='chrome-extension:'&&u.hostname==='mhjfbmdgcfjbbpaeojofohoefgiehjai')||(u.protocol==='chrome:'&&u.hostname==='resources'))return await route.continue();
   if(u.origin===site){const r=await route.fetch({url:'http://127.0.0.1:3003'+u.pathname+u.search,headers:{...route.request().headers(),host:new URL(site).host,'x-forwarded-proto':'https'},maxRedirects:0});return await route.fulfill({response:r});}
   if(u.origin===origin){const r=respond(u.href,{method:route.request().method(),headers:route.request().headers(),body:route.request().postData()});return await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});}
   outside.push(u.href);return await route.abort();
  });
  const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site+'/login');await page.getByRole('button',{name:'Entrar no Bossa CRM'}).waitFor();assert.equal(await page.getByText('Esqueci minha senha').count(),0);
  await context.addCookies([{name:'sb-okhtfibuexfsgkobjxtu-auth-token',value:cookieFor(users[0]).split('=')[1],url:site,sameSite:'Lax'}]);
  for(const p of ['/clientes','/corretores','/agenda','/propostas','/empreendimentos','/gestao','/gestao/nova','/leads/'+lead.id]){
   const r=await page.goto(site+p);assert.equal(r.status(),200,p+' '+(await page.textContent('body')).slice(0,150));
   await page.waitForTimeout(250);
   console.log('PASS compiled navigation '+p);
  }
  await page.goto(site+'/clientes');await page.getByRole('button',{name:'+ Novo lead',exact:true}).click();await page.locator('input[name=name]').fill('Local Compiled Manual');await page.getByRole('button',{name:'Cadastrar',exact:true}).click();await page.getByText('Local Compiled Manual',{exact:true}).first().waitFor();
  const state=JSON.parse(fs.readFileSync(fixture,'utf8'));const created=state.leads.find(l=>l.name==='Local Compiled Manual');assert.equal(created.ai_enabled,false);assert.equal(created.automation_paused,true);assert.equal(created.owner_mode,'human');
  console.log('PASS rendered manual pages and creation through public SDK; local session/REST adapters only');
  assert.equal((await request('/api/leads/'+lead.id+'/stage','POST',cookieFor(users[0]),new URL(site).host,{stage:'futuro'})).status,200);
  const moved=JSON.parse(fs.readFileSync(fixture,'utf8')).leads.find(l=>l.id===lead.id);
  assert.equal(moved.stage,'futuro');assert.equal(moved.ai_enabled,false);assert.equal(moved.automation_paused,true);assert.equal(moved.owner_mode,'human');
  const field=label=>page.locator('.field').filter({has:page.getByText(label,{exact:true})});
  await page.goto(site+'/agenda');await page.getByRole('button',{name:'+ Criar',exact:true}).click();
  await page.getByPlaceholder('Ex.: Apresentação do Flow para João').fill('Visita compilada vinculada');
  await field('Tipo').locator('select').selectOption('visita');
  await page.getByLabel('Contato vinculado',{exact:true}).fill('Compiled Fixture Client');
  await page.getByRole('option',{name:/Compiled Fixture Client/}).click();
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  const visit=page.getByRole('button',{name:/Visita compilada vinculada/});await visit.waitFor();await visit.click();
  assert.equal(await page.getByLabel('Contato vinculado',{exact:true}).inputValue(),lead.name);
  await page.getByLabel('Situação do compromisso').selectOption('completed');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await page.getByText('Concluído',{exact:true}).waitFor();
  const savedVisit=JSON.parse(fs.readFileSync(fixture,'utf8')).agenda[0];assert.equal(savedVisit.lead_id,lead.id);assert.equal(savedVisit.status,'completed');assert.equal(savedVisit.assigned_to,users[0].id);
  console.log('PASS compiled agenda UI links a lead, retains assignee and records completion through real POST/PATCH handlers');
  await page.goto(site+'/propostas?lead='+lead.id);
  await field('Empreendimento').locator('select').selectOption(development.id);
  await field('Valor de tabela').locator('input').fill('10000');
  await field('Entrada direta · vencimento na data da proposta').locator('input').fill('10000');
  const uncertain=page.waitForResponse(r=>r.url().includes('/rpc/commercial_save_proposal_once'));
  await page.getByRole('button',{name:'Criar proposta e abrir PDF',exact:true}).click();assert.equal((await uncertain).status(),503);
  await page.locator('.error-box').filter({hasText:/confirm|salv|incert/i}).first().waitFor();
  const committed=JSON.parse(fs.readFileSync(fixture,'utf8'));assert.equal(committed.proposals.length,2);assert.equal(committed.leads.find(l=>l.id===lead.id).stage,'futuro');
  const pdfResponse=page.waitForResponse(r=>r.url().includes('/api/leads/'+lead.id+'/stage')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Criar proposta e abrir PDF',exact:true}).click();assert.equal((await pdfResponse).status(),200);
  await page.getByText('Gravação anterior recuperada sem duplicar a proposta.',{exact:true}).waitFor();
  const savedState=JSON.parse(fs.readFileSync(fixture,'utf8'));assert.equal(savedState.proposals.length,2);assert.equal(savedState.leads.find(l=>l.id===lead.id).stage,'proposta_negociacao');
  const stageHistory=savedState.activities.filter(a=>a.lead_id===lead.id&&a.metadata.to==='proposta_negociacao');assert.equal(stageHistory.length,1);
  const pdf=await request('/api/propostas/'+proposal.id+'/pdf','GET',cookieFor(users[0]));assert.equal(pdf.status,200);assert.equal(pdf.headers['content-type'],'application/pdf');assert.match(pdf.body,/^%PDF-/);
  assert.equal((await request('/api/leads/'+lead.id+'/stage','POST',cookieFor(users[0]),new URL(site).host,{stage:'proposta_negociacao',proposalId:savedState.proposals[1].id})).status,200);
  assert.equal(JSON.parse(fs.readFileSync(fixture,'utf8')).activities.filter(a=>a.lead_id===lead.id&&a.metadata.to==='proposta_negociacao').length,1);
  console.log('PASS compiled proposal retry after uncertain commit keeps one proposal, moves lead once and returns authenticated PDF without Storage');
  await context.clearCookies();await context.addCookies([{name:'sb-okhtfibuexfsgkobjxtu-auth-token',value:cookieFor(users[2]).split('=')[1],url:site,sameSite:'Lax'}]);
  await page.goto(site+'/clientes');assert.equal(await page.getByRole('button',{name:'+ Novo lead',exact:true}).count(),0);
  assert.equal((await request('/api/leads/'+lead.id+'/stage','POST',cookieFor(users[2]))).status,403);
  assert.equal((await request('/api/leads/'+lead.id+'/stage','POST',cookieFor(users[0]),new URL(site).host,{stage:'passagem_pendente'})).status,400);
  assert.equal((await request('/api/leads/'+lead.id+'/detail','GET',cookieFor(users[3]))).status,404);
  assert.equal((await request('/api/propostas/'+proposal.id+'/pdf','GET',cookieFor(users[2]))).status,200);
  assert.equal((await request('/api/propostas/'+proposal.id+'/pdf','GET',cookieFor(users[3]))).status,404);
  assert.equal((await request('/api/propostas/'+proposal.id+'/pdf','GET')).status,401);
  assert.equal((await request('/api/propostas/'+proposal.id+'/pdf','POST',cookieFor(users[0]))).status,403);
  assert.equal((await request('/api/agenda','PATCH',cookieFor(users[2]),new URL(site).host,{id:savedVisit.id,status:'completed'})).status,403);
  console.log('PASS compiled viewer mutation and foreign-organization read rejected with local adapters');
  const events=JSON.parse(fs.readFileSync(fixture,'utf8')).events;assert.ok(!events.some(e=>/bossa_homologation_preflight|whatsapp|microsoft|storage|functions/.test(e.path)));
  assert.equal(outside.length,0,JSON.stringify(outside));assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS no privileged RPC, administrative integration lookup, provider egress or browser page errors');
 }finally{
  // Playwright's documented shutdown policy: stop routing AFTER all assertions,
  // then close the context. Waiting on cancelled Chromium prefetches can deadlock.
  await context.unrouteAll({behavior:'ignoreErrors'});await context.close();await browser.close();
 }
 console.log('PASS compiled browser teardown');
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({compiledLocalAdapters:'PASS',managedAcceptanceRevalidation:{status:'PENDING',scenarios:[3,5,6]},deployed:false},null,2));
 console.log('PENDING: Work must revalidate real scenarios 3/5/6. Local adapters do not change other Work acceptance results. Local evidence: '+dir);
}finally{server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();const t=setTimeout(()=>{server.kill('SIGKILL');resolve();},5000);server.once('exit',()=>{clearTimeout(t);resolve();});});fs.closeSync(log);}
