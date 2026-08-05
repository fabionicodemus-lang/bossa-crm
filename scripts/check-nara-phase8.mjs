import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countReplyWords, naraCommercialDiagnostics } from '../src/lib/nara-simulator-diagnostics.ts';

assert.equal(countReplyWords('Oi, tudo bem?'), 3);
assert.equal(countReplyWords('  uma   resposta\ncom cinco palavras  '), 5);
assert.equal(countReplyWords(''), 0);

const diagnostics = naraCommercialDiagnostics({
  consulted_at: new Date().toISOString(),
  source_table: 'development_units',
  source_text: 'teste',
  calls: [
    { name: 'faixa_empreendimento', arguments: {}, result: { empreendimento: 'Flow', valor_minimo: 1, valor_maximo: 2, entrada_minima: 1, qtd_disponiveis: 3 } },
    { name: 'buscar_apartamentos', arguments: {}, result: [
      { empreendimento: 'Flow', unidade: '901' },
      { empreendimento: 'Flow', unidade: '1001' },
      { empreendimento: 'Flow', unidade: '901' },
    ] },
    { name: 'consultar_apartamento', arguments: {}, result: { empreendimento: 'Flow', unidade: '1201' } },
  ],
});
assert.equal(diagnostics.price_consulted, true);
assert.deepEqual(diagnostics.returned_units, ['901', '1001', '1201']);
assert.deepEqual(diagnostics.consultation_names, ['faixa_empreendimento', 'buscar_apartamentos', 'consultar_apartamento']);
assert.deepEqual(naraCommercialDiagnostics(null), { price_consulted: false, returned_units: [], consultation_names: [] });

const api = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/(crm)/treinamento/[agente]/page.tsx', import.meta.url), 'utf8');
const helper = await readFile(new URL('../src/lib/nara-prompt-versions.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/019_nara_prompt_versions.sql', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');

assert.match(api, /archiveNaraPromptVersion/);
assert.match(api, /body\.action === 'restore_prompt'/);
assert.match(api, /deriveHybridDecision/);
assert.match(api, /word_count: countReplyWords/);
assert.match(api, /returned_units: commercialDiagnostics\.returned_units/);
assert.match(page, /Versões \(\$\{promptVersions\.length\}\)/);
assert.match(page, /window\.confirm/);
assert.match(page, /Restaurar esta versão/);
assert.match(page, /message\.diagnostics\.word_count/);
assert.match(page, /Preço consultado/);
assert.match(page, /Unidades retornadas/);
assert.match(helper, /loadNaraPromptVersions/);
assert.match(helper, /archiveNaraPromptVersion/);
assert.match(migration, /create table if not exists public\.nara_prompt_versions/);
assert.match(migration, /private\.is_org_admin/);
assert.match(migration, /char_length\(prompt_text\) between 1 and 100000/);
assert.match(workflow, /test:nara-phase8/);

console.log('Fase 8 validada: versionamento reversível e diagnósticos completos por resposta no simulador.');
