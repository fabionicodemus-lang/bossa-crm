export async function resolve(specifier,context,nextResolve){
 const base=new URL('../../src/',import.meta.url);
 const paths={
  '@/lib/auth':'lib/auth',
  '@/lib/supabase/server':'lib/supabase/server',
  '@/app/api/agenda/route':'app/api/agenda/route',
  '@/lib/commercial/recovery':'lib/commercial/recovery.ts',
  '@/lib/commercial/source-request':'lib/commercial/source-request.ts',
 };
 if(specifier in paths){
  if(['@/lib/auth','@/lib/supabase/server','@/app/api/agenda/route'].includes(specifier))
   return {url:new URL('./proposal-status-route-stubs.mjs',import.meta.url).href,shortCircuit:true};
  return {url:new URL(paths[specifier],base).href,shortCircuit:true};
 }
 return nextResolve(specifier,context);
}
