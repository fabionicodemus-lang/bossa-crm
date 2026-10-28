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
 if(u.pathname.includes('/rpc/')){
  if(table==='bossa_homologation_preflight')throw Error('FORBIDDEN_RPC_IN_PILOT');
  // Deliberately do not model business RPCs: independent SQL suites cover them.
  return finish(null);
 }
 let rows=[];
 if(table==='memberships')rows=[{user_id:user.id,organization_id:user.organizationId,role:user.appRole,organizations:{id:user.organizationId,name:'Fixture Organization',slug:'fixture'},profiles:{full_name:'Compiled Fixture',email:user.email}}];
 if(table==='profiles')rows=[{id:user.id,full_name:'Compiled Fixture'}];
 if(table==='organizations')rows=[{id:user.organizationId,name:'Fixture Organization',slug:'fixture'}];
 if(table==='leads'){
  rows=f.leads.filter(l=>l.organization_id===user.organizationId);
  for(const [k,v] of u.searchParams)if(v.startsWith('eq.'))rows=rows.filter(l=>String(l[k])===v.slice(3));
  if(method==='POST'){
   const b=JSON.parse(init.body);if(user.appRole==='viewer'||b.organization_id!==user.organizationId||b.ai_enabled!==false||b.automation_paused!==true||b.owner_mode!=='human')return finish({code:'42501',message:'RLS fixture rejection'},403);
   const row={...f.leads[0],...b,id:'00000000-0000-0000-0000-000000000090'};f.leads.push(row);rows=[row];
  }
  if(method==='PATCH'){
   const b=JSON.parse(init.body);
   if(user.appRole==='viewer'||!rows.length||b.ai_enabled!==false||b.automation_paused!==true||b.owner_mode!=='human')return finish({code:'42501',message:'RLS fixture rejection'},403);
   rows.forEach(row=>Object.assign(row,b));
  }
 }
 if(table==='developments')rows=[{id:'00000000-0000-0000-0000-000000000030',name:'Flow',active:true,default_payment_plan:{},delivery_date:null},{id:'00000000-0000-0000-0000-000000000031',name:'Alma',active:true,default_payment_plan:{},delivery_date:null}];
 if(h.get('accept')?.includes('vnd.pgrst.object'))rows=rows[0]??null;
 if(method==='HEAD'){persist();return new Response(null,{status:200,headers:{'Content-Range':'0-0/0'}});}
 return finish(rows);
}
module.exports={respond};
