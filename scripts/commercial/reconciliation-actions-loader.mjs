import fs from 'node:fs';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === './actions' && context.parentURL?.endsWith('/gestao/contatos/page.tsx')) return {
    url: new URL('../../src/app/(crm)/gestao/contatos/actions.ts', import.meta.url).href, shortCircuit: true,
  };
  if (specifier === '@/lib/commercial/intake') return {
    url: new URL('../../src/lib/commercial/intake.ts', import.meta.url).href, shortCircuit: true,
  };
  if (['next/cache', 'next/navigation', '@/lib/auth', '@/lib/supabase/server'].includes(specifier)) return {
    url: new URL('./reconciliation-actions-stubs.mjs', import.meta.url).href, shortCircuit: true,
  };
  if (specifier === 'next/link' || specifier === '@/components/PageTopbar') return {
    url: new URL('./reconciliation-browser-stubs.mjs', import.meta.url).href, shortCircuit: true,
  };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('/gestao/contatos/page.tsx')) {
    const source = fs.readFileSync(new URL(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: 'page.tsx',
    }).outputText };
  }
  return nextLoad(url, context);
}
