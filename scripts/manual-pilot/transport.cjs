// Local compiled-test adapter only. No real Supabase account, key, login or RLS proof.
// The Node --require preload needs a synchronous CommonJS test transport.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs=require('node:fs');
function respond(url,init={}){
 // Browser and Next are separate processes: serialize fixture read/modify/write.
 const filename=process.env.BOSSA_MANUAL_PILOT_FIXTURE_FILE,lock=filename+'.lock',deadline=Date.now()+5000;
 for(;;){
  try{fs.closeSync(fs.openSync(lock,'wx'));break;}
  catch(error){if(error.code!=='EEXIST'||Date.now()>deadline)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);}
 }
 try{return respondLocked(url,init);}finally{fs.unlinkSync(lock);}
}
function respondLocked(url,init){
 const u=new URL(url);if(u.origin!=='https://okhtfibuexfsgkobjxtu.supabase.co')throw Error('TEST_EGRESS_REFUSED');
 const filename=process.env.BOSSA_MANUAL_PILOT_FIXTURE_FILE;const f=JSON.parse(fs.readFileSync(filename,'utf8'));
 const method=init.method||'GET';const h=new Headers(init.headers);const user=f.users.find(x=>h.get('authorization')==='Bearer '+x.token);
 f.events.push({path:u.pathname,method,role:user?.appRole??null});
 const persist=()=>{const tmp=filename+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(f));fs.renameSync(tmp,filename);};
 const finish=(data,status=200)=>{persist();return Response.json(data,{status,headers:{'Content-Range':'0-0/0'}});};
 if(u.pathname==='/auth/v1/.well-known/jwks.json')return finish({keys:[]});
 if(u.pathname==='/auth/v1/token')return finish({msg:'Invalid login credentials',error_code:'invalid_credentials'},400);
 if(u.pathname==='/auth/v1/user')return user?finish({id:user.id,email:user.email,role:'authenticated',is_anonymous:false}):finish({message:'Invalid JWT'},401);
 if(u.pathname==='/auth/v1/logout')return finish({});
 if(!user)return finish({code:'PGRST301',message:'Invalid JWT'},401);
 const table=u.pathname.split('/').at(-1);
 const scoped=rows=>rows.filter(row=>row.organization_id===user.organizationId).filter(row=>[...u.searchParams].every(([k,v])=>{
  if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
  if(v==='is.null')return row[k]==null;
  if(v.startsWith('gte.'))return row[k]>=v.slice(4);
  if(v.startsWith('lt.'))return row[k]<v.slice(3);
  if(v.startsWith('gt.'))return row[k]>v.slice(3);
  if(v.startsWith('neq.'))return String(row[k])!==v.slice(4);
  return true;
 }));
 if(u.pathname.includes('/rpc/')){
  if(table==='bossa_homologation_preflight')throw Error('FORBIDDEN_RPC_IN_PILOT');
  // Adapter responses for actual compiled callers. Independent SQL suites verify RPC semantics.
  const b=JSON.parse(init.body||'{}');f.requests??={};f.proposals??=[];f.items??=[];f.agenda??=[];
  if(b.p_org!==user.organizationId||user.appRole==='viewer')return finish({code:'42501',message:'RLS fixture rejection'},403);
  const key=b.p_request;
  if(table==='commercial_prepare_source_request')return finish({request_id:key,status:'pending'});
  if(table==='commercial_finish_source_recovery')return finish({state:'acknowledged'});
  if(table==='commercial_replay_source_request')return finish(f.requests[key]?{record:f.requests[key],replayed:true}:null);
  if(table==='commercial_create_agenda_once'){
   if(f.requests[key])return finish({record:f.requests[key],replayed:true});
   const row={...b.p_data,id:'00000000-0000-0000-0000-000000000070',organization_id:user.organizationId,created_by:user.id,created_by_kind:'human',agent:null,status:'scheduled',opportunity_id:null,microsoft_event_id:null,microsoft_sync_status:'internal_only',updated_at:new Date().toISOString()};
   f.agenda.push(row);f.requests[key]=row;return finish({record:row,replayed:false});
  }
  if(table==='commercial_save_proposal_once'){
   if(f.requests[key])return finish({record:f.requests[key],replayed:true});
   const row={...b.p_data,id:b.p_id||'00000000-0000-0000-0000-000000000081',organization_id:user.organizationId,proposal_number:2,version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
   f.proposals=f.proposals.filter(p=>p.id!==row.id);f.proposals.push(row);f.items.push(...b.p_items.map((item,i)=>({...item,organization_id:user.organizationId,proposal_id:row.id,sort_order:i})));f.requests[key]=row;
   if(f.uncertainFirstProposalResponse){f.uncertainFirstProposalResponse=false;return finish({code:'XX000',message:'Compiled fixture response lost after commit'},503);}
   return finish({record:row,replayed:false});
  }
  return finish(null);
 }
 let rows=[];
 if(table==='memberships')rows=[{user_id:user.id,organization_id:user.organizationId,role:user.appRole,organizations:{id:user.organizationId,name:'Fixture Organization',slug:'fixture'},profiles:{full_name:'Compiled Fixture',email:user.email}}];
 if(table==='profiles')rows=[{id:user.id,full_name:'Compiled Fixture'}];
 if(table==='organizations')rows=[{id:user.organizationId,name:'Fixture Organization',slug:'fixture'}];
 if(table==='leads'){
  rows=scoped(f.leads);
  if(method==='POST'){
   const b=JSON.parse(init.body);if(user.appRole==='viewer'||b.organization_id!==user.organizationId||b.ai_enabled!==false||b.automation_paused!==true||b.owner_mode!=='human')return finish({code:'42501',message:'RLS fixture rejection'},403);
   const row={...f.leads[0],...b,id:'00000000-0000-0000-0000-000000000090'};f.leads.push(row);rows=[row];
  }
  if(method==='PATCH'){
   const b=JSON.parse(init.body);
   if(user.appRole==='viewer'||Object.hasOwn(b,'automation_paused')||b.ai_enabled!==false||!['human','none'].includes(b.owner_mode)||rows.some(row=>row.automation_paused!==true))return finish({code:'42501',message:'H2.2 column/RLS fixture rejection'},403);
   f.activities??=[];
   rows.forEach(row=>{if(row.stage!==b.stage)f.activities.push({lead_id:row.id,user_id:user.id,metadata:{from:row.stage,to:b.stage}});Object.assign(row,b,{updated_at:new Date().toISOString()});});
  }
 }
 if(table==='developments')rows=scoped(f.developments??[]);
 if(table==='development_units')rows=scoped(f.units??[]);
 if(table==='proposals')rows=scoped(f.proposals??[]);
 if(table==='proposal_payment_items')rows=scoped(f.items??[]);
 if(table==='agenda_events'){
  rows=scoped(f.agenda??[]);
  if(method==='PATCH'){
   if(user.appRole==='viewer')return finish({code:'42501',message:'RLS fixture rejection'},403);
   const b=JSON.parse(init.body);rows.forEach(row=>Object.assign(row,b,{updated_at:new Date().toISOString()}));
  }
  rows=rows.map(row=>({...row,leads:f.leads.find(l=>l.id===row.lead_id&&l.organization_id===user.organizationId)??null}));
 }
 if(h.get('accept')?.includes('vnd.pgrst.object'))rows=rows[0]??null;
 if(method==='HEAD'){persist();return new Response(null,{status:200,headers:{'Content-Range':'0-0/0'}});}
 return finish(rows);
}
module.exports={respond};
