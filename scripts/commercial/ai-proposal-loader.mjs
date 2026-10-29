export async function resolve(specifier,context,nextResolve){
 if(specifier==='@/lib/whatsapp/aiMediaUnderstanding')return {url:new URL('./ai-proposal-stubs.mjs',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
