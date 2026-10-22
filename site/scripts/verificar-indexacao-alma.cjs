/* Matriz do módulo usado pelo metadata e robots; não consulta nem altera a Vercel. */
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const codigo=ts.transpileModule(fs.readFileSync('src/lib/publicacao.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const matriz=[];
for(const VERCEL_ENV of ['preview','production','development',undefined])for(const BOSSA_PUBLICADO of ['sim','nao']){const contexto={exports:{},process:{env:{VERCEL_ENV,BOSSA_PUBLICADO}}};vm.runInNewContext(codigo,contexto);const esperado=BOSSA_PUBLICADO==='sim'&&VERCEL_ENV!=='preview';assert.equal(contexto.exports.indexacaoPermitida,esperado);matriz.push({ambiente:VERCEL_ENV||'local',liberacao:BOSSA_PUBLICADO,indexavel:contexto.exports.indexacaoPermitida});}
const dir=process.env.EVIDENCIAS_DIR||'docs/alma/fase5';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/indexacao.json',JSON.stringify({data:new Date().toISOString(),matriz},null,2));console.log('Indexação: 8 combinações aprovadas');
