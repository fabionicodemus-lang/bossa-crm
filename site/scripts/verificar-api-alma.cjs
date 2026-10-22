/* Exercita a rota HTTP real contra um servidor RPC local simulado. Não usa banco ou leads reais. */
const assert = require('node:assert/strict');
const http = require('node:http');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
(async()=>{
 let ultimo, falhar=false;
 const rpc=http.createServer(async(req,res)=>{let dados='';for await(const b of req)dados+=b;
  assert.equal(req.url,'/rest/v1/rpc/site_registrar_lead');ultimo=JSON.parse(dados);
  res.writeHead(falhar?500:200,{'content-type':'application/json'});
  res.end(JSON.stringify(falhar?{message:'Falha simulada',code:'XX000'}:'00000000-0000-4000-8000-000000000001'));
 });
 await new Promise(r=>rpc.listen(0,'127.0.0.1',r));
 const next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3210'],{env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${rpc.address().port}`,SUPABASE_SECRET_KEY:'chave-ficticia-isolada',SUPABASE_SERVICE_ROLE_KEY:'',BOSSA_ORGANIZATION_ID:'00000000-0000-4000-8000-000000000002'},stdio:'ignore'});
 try {
  let pronto=false;for(let n=0;n<60;n++){try{await fetch('http://localhost:3210/api/leads');pronto=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert(pronto);
  const enviar=body=>fetch('http://localhost:3210/api/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({formulario:'interesse',empreendimento:'alma-seahouses',nome:'Teste isolado',consentimento:true,site:'',...body})});
  for(const [whatsapp,esperado] of [['+351 912 345 678','351912345678'],['+1 212 555 1234','12125551234'],['+49 30 123456','4930123456'],['(47) 99288-9395','5547992889395']]){
   const res=await enviar({whatsapp});assert.equal(res.status,200);assert.deepEqual((({ok,gravado})=>({ok,gravado}))(await res.json()),{ok:true,gravado:true});assert.equal(ultimo.p_telefone,esperado);assert.equal(ultimo.p_interesse,null);assert.equal(ultimo.p_empreendimento,'alma-seahouses');assert.equal(ultimo.p_formulario,'interesse');
  }
  assert.equal((await enviar({whatsapp:'123'})).status,422);assert.equal((await enviar({whatsapp:'+351912345678',consentimento:false})).status,422);
  falhar=true;const falha=await enviar({whatsapp:'+351912345678'});assert.equal(falha.status,500);assert.equal((await falha.json()).gravado,undefined);
  const evidencia={data:new Date().toISOString(),modo:'API real do site contra RPC HTTP local simulado; nenhum Supabase ou CRM real acessado',verificacoes:['DDI +351, +1 e +49 preservados até p_telefone da RPC','DDD nacional recebe 55','Interesse geral, finalidade opcional nula e contrato de sucesso confirmados','Validação 422 e falha RPC 500 verificadas']};
  const pasta=process.env.EVIDENCIAS_DIR || 'docs/alma/capturas';fs.mkdirSync(pasta,{recursive:true});fs.writeFileSync(`${pasta}/api-verificacao.json`,JSON.stringify(evidencia,null,2));console.log(evidencia);
 }finally{next.kill('SIGTERM');rpc.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
