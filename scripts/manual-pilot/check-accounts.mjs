// Local file validation only. Never logs credentials, authenticates, creates users or approves browser tests.
import fs from 'node:fs';
import path from 'node:path';
const filename=process.env.BOSSA_MANUAL_PILOT_ACCOUNTS_FILE;
if(!filename){console.log('PENDENTES: oito cenários autenticados reais. Configure BOSSA_MANUAL_PILOT_ACCOUNTS_FILE por armazenamento privado.');process.exit(2);}
try{
 const actual=fs.realpathSync(filename),repo=fs.realpathSync(process.cwd());
 if(actual===repo||actual.startsWith(repo+path.sep))throw Error('Arquivo deve ficar fora do repositório.');
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 let accounts;
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error('Exija arquivo regular com modo 0600.');accounts=JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
 const ids=new Set(),organizations=new Map();
 if(!Array.isArray(accounts)||accounts.length!==7)throw Error('São necessárias as sete contas existentes.');
 for(const a of accounts){
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(a.userId)||ids.has(a.userId)
   ||!/^[^\s@]+@bossa-homolog\.invalid$/.test(a.email)||typeof a.password!=='string'||a.password.length<8
   ||!['admin','comercial','viewer'].includes(a.role)||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(a.organizationId))throw Error('Formato de conta inválido.');
  ids.add(a.userId);const roles=organizations.get(a.organizationId)??new Set();roles.add(a.role);organizations.set(a.organizationId,roles);
 }
 if(organizations.size!==2||[...organizations.values()].some(roles=>roles.size!==3))throw Error('Exija os três papéis nas duas organizações.');
 console.log('Formato e proteção local conferidos para sete contas; senhas não exibidas. Auth/RLS e oito cenários de navegador continuam PENDENTES até execução separada.');
}catch(error){console.error(error instanceof SyntaxError?'JSON privado inválido; conteúdo não exibido.':error instanceof Error?error.message:'Arquivo privado indisponível.');process.exit(2);}
