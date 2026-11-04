// Isolate the route contract from Next.js, credentials and real external calls.
const modules = new Set([
  '@/lib/auth', '@/lib/agenda', '@/lib/microsoft-calendar',
  '@/lib/supabase/server', '@/lib/supabase/admin',
]);
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/homologation/policy') return { url: new URL('../../src/lib/homologation/policy.ts', import.meta.url).href, shortCircuit: true };
  if (specifier === '@/lib/commercial/source-request') return { url: new URL('../../src/lib/commercial/source-request.ts', import.meta.url).href, shortCircuit: true };
  if (modules.has(specifier)) return { url: new URL('./stubs.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
