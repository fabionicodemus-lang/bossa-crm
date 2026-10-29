import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {config,claims,token,origin,site,setEnv} from './fixture.mjs';
const saved={...process.env},oldFetch=globalThis.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'bossa-manual-'));
const require=createRequire(import.meta.url);let checks=0;
async function load(file,stubs={}){
 const out=path.join(dir,fs.readdirSync(dir).length+'.cjs');
 await build({entryPoints:[file],outfile:out,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'isolated',setup(b){
 b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:process.cwd()}));}}]});return {module:require(out),out};
}
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
try{
 setEnv();const {module:p}=await load('src/lib/homologation/manual-pilot.ts');
 await check('manual-pilot pins exact Preview/project/branch/SHA/public origin and rejects secrets or unknown targets',()=>{
  assert.equal(p.inspectManualPilot().ready,true);
  for(const overrides of [{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'bossa-crm'},{VERCEL_GIT_COMMIT_REF:'main'},
   {VERCEL_DEPLOYMENT_ID:''},{BOSSA_HOMOLOGATION_MODE:'remote'},{VERCEL_GIT_COMMIT_SHA:'2'.repeat(40)},
   {NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN:'https://other.vercel.app'},{BOSSA_HOMOLOGATION_SUPABASE_URL:'https://oridhneerxutcjsvwuju.supabase.co'},
   {SUPABASE_SECRET_KEY:'not-used'},{BOSSA_TEST_SUPABASE_SECRET_KEY:'not-used'},{OPENAI_API_KEY:'not-used'},
   {FEATURE_DIRECT_WHATSAPP_CONNECTION:'true'},{NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_not_used'}]){
   setEnv(overrides);assert.equal(p.inspectManualPilot().ready,false,JSON.stringify(Object.keys(overrides)));
  }setEnv();
 });
 const headers={apikey:config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token};
 await check('only Auth password/refresh/user/logout/JWKS and human commercial endpoints pass the request filter',()=>{
  for(const [url,method] of [[origin+'/rest/v1/leads','GET'],[origin+'/rest/v1/rpc/commercial_save_proposal_once','POST'],[origin+'/auth/v1/user','GET'],[origin+'/auth/v1/logout?scope=global','POST']])assert.ok(p.assertPilotRequest(url,{method,headers}));
  assert.equal(p.assertPilotRequest(origin+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:headers.apikey,authorization:'Bearer '+headers.apikey},body:JSON.stringify({email:claims.email})}).has('authorization'),false);
  for(const url of [origin+'/auth/v1/admin/users',origin+'/auth/v1/signup',origin+'/auth/v1/recover',origin+'/functions/v1/nara',origin+'/storage/v1/object/x',origin+'/rest/v1/rpc/bossa_homologation_preflight',origin+'/rest/v1/rpc/next_client_handoff_owner',origin+'/rest/v1/whatsapp_connections','https://api.openai.com/v1/responses','https://graph.microsoft.com/','https://graph.facebook.com/'])assert.throws(()=>p.assertPilotRequest(url,{method:'POST',headers}),/BLOCKED/);
  assert.throws(()=>p.assertPilotRequest(origin+'/auth/v1/token?grant_type=password',{method:'POST',headers,body:JSON.stringify({email:'real@example.com'})}),/FICTIONAL_LOGIN/);
  assert.throws(()=>p.assertPilotRequest(origin+'/rest/v1/leads',{headers:{apikey:headers.apikey}}),/HUMAN_SESSION/);
  assert.throws(()=>p.assertPilotRequest(origin+'/rest/v1/leads',{headers:{...headers,apikey:'sb_secret_bad'}}),/EGRESS/);
  assert.equal(p.pilotUser({...claims,is_anonymous:true}),false);assert.equal(p.pilotUser({...claims,iss:'https://other.supabase.co/auth/v1'}),false);
 });
 await check('HTTP method/route allowlist closes integrations, callbacks, signup, settings and action tunneling',()=>{
  for(const r of ['/clientes','/corretores','/agenda','/propostas','/empreendimentos','/gestao','/gestao/nova','/gestao/oportunidades/00000000-0000-0000-0000-000000000001'])assert.equal(p.manualPilotPath(r),true,r);
  for(const r of ['/nara','/plantao-corretores','/configuracoes','/auth/callback','/cadastro','/recuperar-senha','/api/automation/followup','/api/meta/webhook','/api/microsoft/connect','/gestao/etapas','/gestao/configuracoes','/api/leads/x/ai','/api/homologation/preflight/x','/clientes%2f..%2fnara'])assert.equal(p.manualPilotPath(r),false,r);
  assert.equal(p.manualPilotPath('/clientes','POST'),false);assert.equal(p.manualPilotPath('/login','POST'),false);
  assert.equal(p.manualPilotPath('/gestao/nova','POST'),true);
 });
 await check('session SDK never requests RPC v2 or admin key and administrative construction fails before fallback',async()=>{
  const {module:s}=await load('src/lib/homologation/server.ts');let calls=[];
  globalThis.fetch=async(i,init)=>{calls.push([i,init]);return Response.json([]);};
  assert.throws(()=>s.serverSupabaseOptions(true),/ADMIN_CLIENT_BLOCKED/);
  const opts=s.serverSupabaseOptions(false);assert.equal(opts.key,headers.apikey);
  await opts.global.fetch(origin+'/rest/v1/leads',{headers});assert.equal(calls.length,1);assert.equal(calls[0][1].redirect,'error');
  assert.equal(calls[0][1].headers.get('authorization'),'Bearer '+token);
  await assert.rejects(()=>opts.global.fetch(origin+'/rest/v1/rpc/bossa_homologation_preflight',{method:'POST',headers}),/BLOCKED/);
  assert.equal((await s.getHomologationPreflight()).writesAllowed,false,'H2.3 report is not forged into approval');
  assert.equal(calls.length,1);
 });
 await check('actual proxy rejects foreign host and blocked GET/Server Action paths before session lookup',async()=>{
  const {module:s}=await load('src/proxy.ts',{'@/lib/supabase/proxy':"import {NextResponse} from 'next/server';export async function updateSession(){return NextResponse.next()}"});
  const {NextRequest}=require('next/server');
  for(const method of ['GET','POST'])for(const r of ['/api/automation/followup','/api/microsoft/connect','/auth/callback','/gestao/etapas'])assert.equal((await s.proxy(new NextRequest(site+r,{method,headers:{host:new URL(site).host,'Next-Action':'arbitrary'}}))).status,403);
  assert.equal((await s.proxy(new NextRequest(site+'/clientes',{headers:{host:'other.vercel.app'}}))).status,503);
 });
 await check('browser public SDK fails closed on missing or changed runtime configuration without RPC v2',async()=>{
  const savedWindow=globalThis.window;
  try {
   globalThis.window={location:new URL(site)};
   const {module:b}=await load('src/lib/homologation/browser.ts');
   let configured=true,calls=[];
   globalThis.fetch=async(input)=>{
    calls.push(String(input));
    return Response.json(String(input)==='/api/homologation/preflight'
     ? {mode:'manual-pilot',configured,commit:config.VERCEL_GIT_COMMIT_SHA,deploymentOrigin:site,projectId:config.VERCEL_PROJECT_ID}:[]);
   };
   const client=b.browserSupabaseOptions();
   await client.global.fetch(origin+'/rest/v1/leads',{headers});
   assert.deepEqual(calls,['/api/homologation/preflight',origin+'/rest/v1/leads']);
   configured=false;calls=[];
   await assert.rejects(()=>client.global.fetch(origin+'/rest/v1/leads',{headers}),/CONFIGURATION_BLOCKED/);
   assert.deepEqual(calls,['/api/homologation/preflight']);
   globalThis.fetch=async()=>{throw Error('Runtime configuration unavailable')};
   await assert.rejects(()=>client.global.fetch(origin+'/rest/v1/leads',{headers}),/unavailable/);
  } finally {if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;}
 });
 await check('actual server actions reject unrelated operations even when tunneled through an allowed page',async()=>{
  const {module:a}=await load('src/app/(crm)/gestao/actions.ts',{
   '@/lib/auth':"export async function getCurrentContext(){return {role:'admin',organization:{id:'org'}}}",
   '@/lib/supabase/server':"export async function createClient(){return {from(){throw Error('Unexpected write')}}}",
   'next/navigation':"export function redirect(){throw Error('REDIRECT')}",'next/cache':"export function revalidatePath(){}"});
  for(const operation of ['settings','ranking','review','contract','cancellation','receipt']){const f=new FormData();f.set('operation',operation);await assert.rejects(()=>a.saveCommercial(f),/indisponível/);}
 });
 await check('actual Node egress guard blocks raw HTTP/TLS/sockets and only permits connections inside scoped fetch',async()=>{
  const {out}=await load('src/lib/homologation/manual-egress.ts');
  const script=`const assert=require('node:assert/strict');let connects=0;const net=require('node:net'),tls=require('node:tls');net.Socket.prototype.connect=function(){connects++;return this};tls.connect=function(){connects++;return new net.Socket()};globalThis.fetch=async()=>{tls.connect({host:'okhtfibuexfsgkobjxtu.supabase.co',port:443,rejectUnauthorized:true}).destroy();return Response.json([])};require(${JSON.stringify(out)}).installPilotNetworkGuard();(async()=>{for(const f of [()=>net.connect(443,'okhtfibuexfsgkobjxtu.supabase.co'),()=>tls.connect({host:'okhtfibuexfsgkobjxtu.supabase.co',port:443}),()=>require('node:https').get('https://example.com'),()=>net.connect('/tmp/sock')])assert.throws(f,/BLOCKED/);await fetch('${origin}/rest/v1/leads',{headers:${JSON.stringify(headers)}});assert.equal(connects,1);await assert.rejects(()=>fetch('https://api.openai.com/'),/BLOCKED/);assert.throws(()=>tls.connect({host:'okhtfibuexfsgkobjxtu.supabase.co',port:443}),/BLOCKED/)})().catch(e=>{console.error(e);process.exit(1)})`;
  const child=spawnSync(process.execPath,['-e',script],{env:process.env,encoding:'utf8'});assert.equal(child.status,0,child.stderr);
 });
 console.log(`PASS ${checks} manual-pilot isolation groups. This local run does not certify managed Auth/RLS; real scenarios 3/5/6 require Work revalidation.`);
}finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);fs.rmSync(dir,{recursive:true,force:true});}
