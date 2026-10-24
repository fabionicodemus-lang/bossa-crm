// Compiled Next + Chromium with synthetic transports only; never contacts a provider or restores a DB.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bossa-remote-compiled-'));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BOSSA_PLAYWRIGHT_MODULE ?? 'playwright');
const executablePath=process.env.BOSSA_CHROMIUM_PATH ?? '/usr/bin/chromium';
const ref='okhtfibuexfsgkobjxtu', project='prj_L89zRE7TKcC4ij14B5QyOa72XfPz', origin=`https://${ref}.supabase.co`, sha='1'.repeat(40), id=randomUUID();
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const key=publicKey.export({format:'der',type:'spki'}).toString('base64');
const payload=Buffer.from(JSON.stringify({contractVersion:1,environmentId:id,vercelProjectId:project,deploymentId:'dpl_Synthetic',deploymentOrigin:'https://bossa-synthetic.vercel.app',supabaseProjectRef:ref,commit:sha,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),evidenceSha256:'a'.repeat(64),checks:{networkEgressRestricted:true,externalIntegrationsDisabled:true,cronDisabled:true,webhooksDisabled:true,authEmailDisabled:true,functionsDisabled:true,storageEffectsDisabled:true}}));
const proof={contractVersion:2,environmentId:id,supabaseProjectRef:ref,syntheticUsersOnly:true,requiredRolesReady:true,guardsIntact:true,schemaReady:true,zeroExternalEffects:true,permissionsSafe:true,serviceRoleGuardsIntact:true,authEmailBlocked:true,platformAttestation:{payload:payload.toString('base64url'),signature:sign(null,payload,privateKey).toString('base64url')}};
const fixture=path.join(dir,'http-proof.json');fs.writeFileSync(fixture,JSON.stringify(proof));
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','HOME','TMPDIR','LANG','LC_ALL','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'].includes(k)));
env.PATH='/workspace/.bossa-tools/node_modules/.bin:'+env.PATH;
Object.assign(env,{BOSSA_HOMOLOGATION_MODE:'remote',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:project,VERCEL_DEPLOYMENT_ID:'dpl_Synthetic',VERCEL_URL:'bossa-synthetic.vercel.app',VERCEL_GIT_COMMIT_REF:'feat/commercial-metrics-foundation',VERCEL_GIT_COMMIT_SHA:sha,BOSSA_HOMOLOGATION_COMMIT:sha,BOSSA_HOMOLOGATION_ENVIRONMENT_ID:id,NEXT_PUBLIC_SUPABASE_URL:origin,BOSSA_HOMOLOGATION_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-anon',BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY:'synthetic-anon',BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY:'synthetic-service',BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY:key,FEATURE_DIRECT_WHATSAPP_CONNECTION:'false',FEATURE_EMBEDDED_SIGNUP:'false',NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP:'false',NEXT_PUBLIC_APP_URL:'https://bossa-synthetic.vercel.app'});
function processRun(args,options={}) {return new Promise((resolve,reject)=>{const log=fs.openSync(path.join(dir,'remote-build.log'),'w');const child=spawn(args[0],args.slice(1),{env,stdio:['ignore',log,log],...options}); child.on('error',reject);child.on('exit',code=>{fs.closeSync(log);if(code===0)resolve();else reject(Error('Remote build failed: '+code));});});}
await processRun(['npm','run','build']);console.log('PASS compiled remote Next build with synthetic configuration');
const preloader=path.join(dir,'http-adapter.cjs');
fs.writeFileSync(preloader,`const fs=require('node:fs');globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url||String(input);if(url!==${JSON.stringify(origin+'/rest/v1/rpc/bossa_homologation_preflight')}||init.method!=='POST')throw Error('SYNTHETIC_TRANSPORT_DENIED');return Response.json({...JSON.parse(fs.readFileSync(${JSON.stringify(fixture)},'utf8')),checkedAt:new Date().toISOString()});};`);
const log=fs.openSync(path.join(dir,'remote-http.log'),'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3002'],{env:{...env,NODE_OPTIONS:'--require='+preloader},stdio:['ignore',log,log]});
const request=(url,method='GET',host='bossa-synthetic.vercel.app')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:3002,path:url,method,headers:{Host:host}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.setTimeout(10000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end();});
try{
 let report;
 for(let i=0;i<100;i++){try{report=await request('/api/homologation/preflight');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(report,'server not ready');assert.equal(report.status,200,report.body);assert.equal(JSON.parse(report.body).writesAllowed,true);assert.equal(JSON.parse(report.body).humanAcceptanceAllowed,false);assert.equal(JSON.parse(report.body).environmentId,id);assert.equal(JSON.parse(report.body).commit,sha);assert.equal(server.exitCode,null);
 assert.equal((await request('/api/homologation/preflight','GET','other.vercel.app')).status,503);
 console.log('PASS actual compiled HTTP preflight accepts complete synthetic v2 proof and rejects unknown aliases');
 const login=await request('/login');assert.equal(login.status,200,login.body.slice(0,200));assert.match(login.body,/Bem-vindo de volta/);assert.ok(login.headers['content-security-policy'].includes(origin));console.log('PASS actual compiled login HTML and CSP under synthetic proof (not browser/human homologation)');
 for(const u of ['/api/automation/followup','/api/meta/whatsapp/webhook','/api/microsoft/connect','/api/users/invite','/api/leads/synthetic/ai','/auth/callback'])for(const method of ['GET','POST'])assert.equal((await request(u,method)).status,403,u+' '+method);
 console.log('PASS actual compiled HTTP blocks provider, email/admin, automation and callback paths for GET/POST');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
 try {
  const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();let authCalls=0;const errors=[],outside=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const u=new URL(route.request().url());
   if(u.origin==='https://bossa-synthetic.vercel.app') {const response=await route.fetch({url:'http://127.0.0.1:3002'+u.pathname+u.search,headers:{...route.request().headers(),host:'bossa-synthetic.vercel.app'},maxRedirects:0});return route.fulfill({response});}
   if(u.origin===origin&&u.pathname==='/auth/v1/token'&&u.search==='?grant_type=password'&&route.request().method()==='POST'){authCalls++;assert.equal(JSON.parse(route.request().postData()).email,'operator@example.invalid');return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({msg:'Invalid login credentials',error_code:'invalid_credentials'})});}
   outside.push(u.origin+u.pathname);return route.abort();});
  await page.goto('https://bossa-synthetic.vercel.app/login');await page.locator('form').waitFor();await page.locator('input[type=email]').fill('operator@example.invalid');await page.locator('input[type=password]').fill('fixture-password-only');await page.getByRole('button',{name:'Entrar no Bossa CRM'}).click();await page.getByText('E-mail ou senha inválidos.').waitFor();assert.equal(authCalls,1);assert.equal(errors.length,0,errors.join('\n'));
  const blocked=await page.evaluate(()=>new Promise(resolve=>{let n=0;window.addEventListener('securitypolicyviolation',e=>{if(e.effectiveDirective==='connect-src'&&++n===2)resolve(true);});fetch('https://example.invalid/blocked').catch(()=>{});fetch('https://okhtfibuexfsgkobjxtu.supabase.co/auth/v1/recover',{method:'POST'}).catch(()=>{});setTimeout(()=>resolve(false),5000);}));assert.equal(blocked,true);assert.equal(outside.length,0,JSON.stringify(outside));await context.close();
  console.log('PASS rendered Chromium login uses compiled SDK + preflight with mocked Auth; CSP blocks external and direct recovery calls');
 } finally {await browser.close();}
 fs.writeFileSync(fixture,JSON.stringify({...proof,permissionsSafe:false}));
 assert.equal((await request('/api/homologation/preflight')).status,503);assert.equal((await request('/login')).status,503);
 console.log('PASS actual compiled HTTP revokes access immediately on failed DB permissions proof');
 fs.writeFileSync(fixture,JSON.stringify({...proof,platformAttestation:{...proof.platformAttestation,signature:'invalid'}}));
 assert.equal((await request('/api/homologation/preflight')).status,503);
 console.log('PASS actual compiled HTTP rejects tampered signed platform receipt');
 let chunks=0;function walk(p){for(const entry of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,entry.name);if(entry.isDirectory())walk(q);else if(q.endsWith('.js')){assert.ok(!fs.readFileSync(q,'utf8').includes('synthetic-service'),'service key in browser bundle');chunks++;}}}walk('.next/static');
 console.log('PASS '+chunks+' compiled browser chunks contain no synthetic service-role key');
 fs.writeFileSync(path.join(dir,'remote-http-results.json'),JSON.stringify({syntheticOnly:true,deployed:false,browserRendered:true,humanAcceptance:0,checks:8,status:'PASS'},null,2));
 console.log('Synthetic evidence: '+dir);
}finally{server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();const t=setTimeout(()=>{server.kill('SIGKILL');resolve();},5000);server.once('exit',()=>{clearTimeout(t);resolve();});});fs.closeSync(log);}
