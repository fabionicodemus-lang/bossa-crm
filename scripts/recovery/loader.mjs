export async function resolve(specifier,context,nextResolve){
 const real={'@/lib/commercial/recovery':'../../src/lib/commercial/recovery.ts','@/lib/commercial/source-request':'../../src/lib/commercial/source-request.ts'};
 if(real[specifier]) return {url:new URL(real[specifier],import.meta.url).href,shortCircuit:true};
 if(['@/lib/auth','@/lib/supabase/server','@/app/api/agenda/route'].includes(specifier)) return {url:new URL('./stubs.mjs',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
