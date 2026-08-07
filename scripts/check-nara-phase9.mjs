import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  NARA_PHASE9_PRICE_ALIGNMENT,
  NARA_PHASE9_SCORE_BLOCK,
  naraPromptPhase9Issues,
  normalizeNaraKnowledge,
  upgradeNaraPromptPhase9,
} from '../src/lib/nara-prompt-config.ts';

const legacyScore = `### Pontuação

USO definido **+2** · decide em até 3 meses **+3** · 3 a 12 meses **+2** · faixa cabe **+3** · faixa muito abaixo **−4** · decide sozinho ou casal alinhado **+2** · pergunta técnica (planta, vaga, condomínio) **+2** · pediu tabela espontaneamente **+2**

**9 ou mais** = quente, feche a agenda nesta conversa · **5 a 8** = nutrir · **4 ou menos** = régua longa`;
const priceAnchor = '**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.';
const legacyPrompt = `# PROMPT FINAL DA NARA

<PERGUNTA_TRIAGEM>
Você quer comprar ou precisa de outro atendimento?
</PERGUNTA_TRIAGEM>

## 6. QUALIFICAÇÃO NATURAL

${legacyScore}

---

## 7. PREÇO — VOCÊ CONSULTA O SISTEMA

${priceAnchor}`;

const upgraded = upgradeNaraPromptPhase9(legacyPrompt);
assert.match(upgraded, /### Score comercial \(0–100\)/);
assert.match(upgraded, /score máximo 20/);
assert.match(upgraded, /score mínimo 80/);
assert.match(upgraded, /`frio`/);
assert.match(upgraded, /`morno`/);
assert.match(upgraded, /`quente`/);
assert.match(upgraded, /`agendamento`/);
assert.match(upgraded, /`sem_interesse`/);
assert.match(upgraded, /### Efeito do preço no score e na classificação/);
assert.doesNotMatch(upgraded, /\b9 ou mais\b|\b5 a 8\b|\b4 ou menos\b/);
assert.equal(naraPromptPhase9Issues(upgraded).length, 0);
assert.equal(upgradeNaraPromptPhase9(upgraded), upgraded);
assert.ok(upgraded.includes(NARA_PHASE9_SCORE_BLOCK));
assert.ok(upgraded.includes(NARA_PHASE9_PRICE_ALIGNMENT));

const customPrompt = '# PROMPT FINAL DA NARA\n\nTexto personalizado sem a rubrica legada.';
assert.equal(upgradeNaraPromptPhase9(customPrompt), customPrompt);

const knowledge = normalizeNaraKnowledge({ prompt_final: legacyPrompt });
assert.equal(knowledge.prompt_final, upgraded);
assert.equal(knowledge.triagem_pergunta_inicial, 'Você quer comprar ou precisa de outro atendimento?');

const ai = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const hybrid = await readFile(new URL('../src/lib/hybrid.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/020_nara_prompt_score_enum.sql', import.meta.url), 'utf8');
const readme = await readFile(new URL('../supabase/migrations/README.md', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');

assert.match(ai, /CLIENT_CLASSIFICATIONS = \['frio', 'morno', 'quente', 'agendamento', 'sem_interesse'\]/);
assert.match(ai, /score: \{ type: 'integer', minimum: 0, maximum: 100 \}/);
assert.match(hybrid, /turn\.score >= 80/);
assert.match(hybrid, /turn\.score >= 40/);
assert.match(migration, /insert into public\.nara_prompt_versions/);
assert.match(migration, /jsonb_set\(changed\.knowledge, '\{prompt_final\}'/);
assert.match(migration, /### Score comercial \(0–100\)/);
assert.match(migration, /### Efeito do preço no score e na classificação/);
assert.match(readme, /020_nara_prompt_score_enum\.sql/);
assert.match(readme, /próximo número disponível é `022`/);
assert.match(workflow, /test:nara-phase9/);

console.log('Fase 9 validada: prompt na escala 0–100 e classificação limitada ao enum real da Nara.');
