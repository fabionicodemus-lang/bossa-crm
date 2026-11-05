import { resolve as resolveTs } from '../ts-extension-loader.mjs';

const site = new URL('../../site/src/', import.meta.url);
const banco = 'bossa-test:site-banco';
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/banco') return { url: banco, shortCircuit: true };
  if (specifier.startsWith('@/')) return { url: new URL(`${specifier.slice(2)}.ts`, site).href, shortCircuit: true };
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  return resolveTs(specifier, context, nextResolve);
}
export async function load(url, context, nextLoad) {
  if (url === banco) return {
    format: 'module', shortCircuit: true,
    source: `export const banco = () => globalThis.__bossaSiteSecurityFixture.db;
      export const ORG = () => 'fixture-organization';
      export { normalizarTelefone } from '${new URL('lib/telefone.ts', site).href}';`,
  };
  return nextLoad(url, context);
}
