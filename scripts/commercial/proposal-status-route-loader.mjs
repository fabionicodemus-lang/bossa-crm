export async function resolve(specifier,context,nextResolve){
 const base=new URL('../../src/',import.meta.url);
 const paths={
  '@/lib/auth':'lib/auth',
  '@/lib/supabase/server':'lib/supabase/server',
  '@/app/api/agenda/route':'app/api/agenda/route',
  '@/lib/commercial/recovery':'lib/commercial/recovery.ts',
  '@/lib/commercial/source-request':'lib/commercial/source-request.ts',
  '@/lib/homologation/manual-pilot':'lib/homologation/manual-pilot',
  '@/app/api/leads/[id]/stage/route':'app/api/leads/[id]/stage/route',
 };
 if(specifier in paths){
  if(['@/lib/auth','@/lib/supabase/server','@/app/api/agenda/route','@/lib/homologation/manual-pilot','@/app/api/leads/[id]/stage/route'].includes(specifier))
   return {url:new URL('./proposal-status-route-stubs.mjs',import.meta.url).href,shortCircuit:true};
  return {url:new URL(paths[specifier],base).href,shortCircuit:true};
 }
 return nextResolve(specifier,context);
}
