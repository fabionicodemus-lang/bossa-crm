from pathlib import Path
from textwrap import dedent
import json

prompt_config = dedent(r'''
export const NARA_PROMPT_MARKER = '# PROMPT FINAL DA NARA';
export const NARA_PROMPT_STORAGE_KEY = 'prompt_final';
export const LEGACY_NARA_PROMPT_STORAGE_KEY = 'triagem_pergunta_inicial';
export const NARA_PROMPT_MAX_LENGTH = 100_000;
export const DEFAULT_NARA_TRIAGE_QUESTION = 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?';

const TRIAGE_OPEN_MARKER = '<PERGUNTA_TRIAGEM>';
const TRIAGE_CLOSE_MARKER = '</PERGUNTA_TRIAGEM>';
const PHASE9_SCORE_MARKER = '### Score comercial (0–100)';
const PHASE9_PRICE_MARKER = '### Efeito do preço no score e na classificação';
const SCORE_SECTION_HEADING = '### Pontuação';
const SCORE_SECTION_END = '\n\n---\n\n## 7. PREÇO';
const PRICE_ALIGNMENT_ANCHOR = '**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.';

export const NARA_PHASE9_SCORE_BLOCK = `### Score comercial (0–100)

Calcule um número inteiro de **0 a 100**, sem mostrar a pontuação ao contato. O score mede intenção de compra, aderência ao produto, momento e engajamento. Some as evidências abaixo e limite o resultado final ao intervalo de 0 a 100:

- intenção de compra, moradia, veraneio ou investimento confirmada: **+20**
- USO definido: **+10**
- pretende decidir em até 3 meses: **+20** · de 3 a 12 meses: **+10** · acima de 12 meses: **+5**
- faixa confirmada como compatível: **+20** · compatibilidade parcial: **+10**
- decisão individual ou casal/família alinhados: **+10**
- engajamento real, pergunta técnica ou resposta com contexto: **+10**
- pediu unidade, condição de pagamento, proposta, visita, ligação ou atendimento humano: **+10**

Regras de prevalência:

- pedido isolado de faixa geral, sem intenção confirmada, fica em **score máximo 20** e classificação \\`frio\\`;
- enquanto não houver sinal confiável de possível comprador, o score não passa de 20;
- faixa claramente incompatível limita o score a **25**, até surgir alternativa compatível confirmada;
- visita, proposta, reserva, negociação, unidade específica, condição comercial ou pedido de humano são sinais de alta intenção: use **score mínimo 80**, \\`handoff=true\\` e deixe o motor operacional definir a prioridade;
- transferência para Plantão, pós-venda ou outro setor não aumenta o score comercial de compra;
- opt-out, spam ou contato sem relação com a Bossa usa score 0.

### Classificação permitida

Use **exatamente um** destes valores no campo \\`classification\\`:

- \\`frio\\`: score de 0 a 20; curiosidade, intenção ainda não confirmada ou somente pedido de faixa geral;
- \\`morno\\`: score de 21 a 59; possível comprador com interesse real, mas ainda faltam aderência, prazo ou contexto;
- \\`quente\\`: score de 60 a 100; comprador com boa aderência ou intenção concreta, sem horário de visita/ligação já combinado;
- \\`agendamento\\`: somente quando visita, ligação ou videochamada estiver claramente combinada; use score mínimo 80, \\`stage=agendado\\` e \\`handoff=true\\`;
- \\`sem_interesse\\`: somente opt-out, spam ou contato sem relação útil com a Bossa; use score 0.

Nunca escreva \\`nutrir\\`, \\`régua longa\\`, A1, A2, B, C ou D no campo \\`classification\\`. Esses termos pertencem ao tratamento operacional e à prioridade, não ao enum de classificação. Um sinal explícito de alta intenção prevalece sobre a falta de campos de qualificação.`;

export const NARA_PHASE9_PRICE_ALIGNMENT = `### Efeito do preço no score e na classificação

- **Nível 1 — faixa geral sem intenção confirmada:** mantenha \\`classification=frio\\`, score máximo 20, sem arquivo, sem unidade e sem liberar a qualificação.
- **Nível 2 — faixa por tipologia:** só pode elevar para \\`morno\\` quando a conversa também trouxer sinais reais de possível comprador; a faixa, sozinha, não aumenta o score.
- **Nível 3 — apartamento específico:** exige USO e intenção confirmados. Pedido de unidade, disponibilidade, entrada, parcela ou condição específica é sinal de alta intenção: score mínimo 80, \\`classification=quente\\` e \\`handoff=true\\`, salvo quando já houver compromisso agendado, caso em que a classificação é \\`agendamento\\`.
- Se a consulta falhar ou não confirmar a condição vigente, não compense aumentando score nem inventando valor; escale para confirmação humana.`;

type KnowledgeRecord = Record<string, string>;

function stringRecord(value: unknown): KnowledgeRecord {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === 'string' && item.trim())
      .map(([key, item]) => [key, String(item).trim()]),
  );
}

export function isNaraFinalPrompt(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith(NARA_PROMPT_MARKER);
}

function replaceLegacyScoreSection(prompt: string): string {
  if (prompt.includes(PHASE9_SCORE_MARKER)) return prompt;
  const start = prompt.indexOf(SCORE_SECTION_HEADING);
  const end = start >= 0 ? prompt.indexOf(SCORE_SECTION_END, start) : -1;
  if (start < 0 || end < 0) return prompt;
  const current = prompt.slice(start, end);
  const legacy = current.includes('9 ou mais')
    || current.includes('5 a 8')
    || current.includes('USO definido **+2**');
  if (!legacy) return prompt;
  return `${prompt.slice(0, start)}${NARA_PHASE9_SCORE_BLOCK}${prompt.slice(end)}`;
}

function addPriceAlignment(prompt: string): string {
  if (prompt.includes(PHASE9_PRICE_MARKER)) return prompt;
  if (!prompt.includes(PHASE9_SCORE_MARKER) || !prompt.includes(PRICE_ALIGNMENT_ANCHOR)) return prompt;
  return prompt.replace(
    PRICE_ALIGNMENT_ANCHOR,
    `${PRICE_ALIGNMENT_ANCHOR}\n\n${NARA_PHASE9_PRICE_ALIGNMENT}`,
  );
}

export function upgradeNaraPromptPhase9(value: string): string {
  const prompt = value.trim();
  if (!isNaraFinalPrompt(prompt)) return prompt;
  return addPriceAlignment(replaceLegacyScoreSection(prompt));
}

export function naraPromptPhase9Issues(value: string): string[] {
  const prompt = value.trim();
  if (!isNaraFinalPrompt(prompt)) return [];
  const issues: string[] = [];
  if (/\b9 ou mais\b|\b5 a 8\b|\b4 ou menos\b/.test(prompt)) issues.push('escala legada');
  if (!prompt.includes(PHASE9_SCORE_MARKER)) issues.push('score 0–100 ausente');
  if (!prompt.includes(PHASE9_PRICE_MARKER)) issues.push('preço sem alinhamento de score');
  for (const classification of ['frio', 'morno', 'quente', 'agendamento', 'sem_interesse']) {
    if (!prompt.includes(`\\`${classification}\\``)) issues.push(`classificação ${classification} ausente`);
  }
  return [...new Set(issues)];
}

export function extractNaraPrompt(value: unknown): string {
  const knowledge = stringRecord(value);
  const current = knowledge[NARA_PROMPT_STORAGE_KEY]?.trim() ?? '';
  if (current) return current;
  const legacy = knowledge[LEGACY_NARA_PROMPT_STORAGE_KEY]?.trim() ?? '';
  return isNaraFinalPrompt(legacy) ? legacy : '';
}

export function extractMarkedTriageQuestion(prompt: string): string {
  const openIndex = prompt.indexOf(TRIAGE_OPEN_MARKER);
  if (openIndex < 0) return '';
  const contentStart = openIndex + TRIAGE_OPEN_MARKER.length;
  const closeIndex = prompt.indexOf(TRIAGE_CLOSE_MARKER, contentStart);
  if (closeIndex < 0) return '';
  const question = prompt.slice(contentStart, closeIndex).trim();
  return question.includes('?') && question.length <= 500 ? question : '';
}

export function assertNaraPromptLength(prompt: string): void {
  if (prompt.length > NARA_PROMPT_MAX_LENGTH) {
    throw new Error(`O prompt final da Nara ultrapassa o limite de ${NARA_PROMPT_MAX_LENGTH.toLocaleString('pt-BR')} caracteres.`);
  }
}

export function normalizeNaraKnowledge(value: unknown): KnowledgeRecord {
  const knowledge = stringRecord(value);
  const prompt = upgradeNaraPromptPhase9(extractNaraPrompt(knowledge));
  if (prompt) assertNaraPromptLength(prompt);

  const legacyValue = knowledge[LEGACY_NARA_PROMPT_STORAGE_KEY]?.trim() ?? '';
  const explicitQuestion = prompt ? extractMarkedTriageQuestion(prompt) : '';
  const legacyQuestion = legacyValue && !isNaraFinalPrompt(legacyValue) ? legacyValue : '';
  const triageQuestion = explicitQuestion || legacyQuestion || DEFAULT_NARA_TRIAGE_QUESTION;

  const normalized: KnowledgeRecord = {};
  for (const [key, item] of Object.entries(knowledge)) {
    if (key === NARA_PROMPT_STORAGE_KEY || key === LEGACY_NARA_PROMPT_STORAGE_KEY) continue;
    normalized[key.slice(0, 80)] = item.slice(0, 10_000);
  }
  if (prompt) normalized[NARA_PROMPT_STORAGE_KEY] = prompt;
  normalized[LEGACY_NARA_PROMPT_STORAGE_KEY] = triageQuestion;
  return normalized;
}

export function naraKnowledgeForEditor(value: unknown): KnowledgeRecord {
  const normalized = normalizeNaraKnowledge(value);
  const prompt = normalized[NARA_PROMPT_STORAGE_KEY] ?? '';
  const editorKnowledge = { ...normalized };
  delete editorKnowledge[NARA_PROMPT_STORAGE_KEY];
  if (prompt) editorKnowledge[LEGACY_NARA_PROMPT_STORAGE_KEY] = prompt;
  return editorKnowledge;
}
''').strip() + '\n'
Path('src/lib/nara-prompt-config.ts').write_text(prompt_config, encoding='utf-8')

migration = dedent(r'''
-- BOSSA CRM — Fase 9 da Nara: score 0–100 e enum real de classificação
-- Execute depois de 019_nara_prompt_versions.sql.
-- A migration guarda o prompt anterior e altera somente o bloco legado conhecido.

begin;

with current_prompts as (
  select
    id,
    organization_id,
    updated_by,
    knowledge,
    knowledge ->> 'prompt_final' as old_prompt
  from public.ai_agent_configs
  where agent = 'nara'
    and coalesce(knowledge ->> 'prompt_final', '') like '# PROMPT FINAL DA NARA%'
), rewritten as (
  select
    id,
    organization_id,
    updated_by,
    knowledge,
    old_prompt,
    replace(
      replace(
        old_prompt,
        $legacy_score$### Pontuação

USO definido **+2** · decide em até 3 meses **+3** · 3 a 12 meses **+2** · faixa cabe **+3** · faixa muito abaixo **−4** · decide sozinho ou casal alinhado **+2** · pergunta técnica (planta, vaga, condomínio) **+2** · pediu tabela espontaneamente **+2**

**9 ou mais** = quente, feche a agenda nesta conversa · **5 a 8** = nutrir · **4 ou menos** = régua longa$legacy_score$,
        $phase9_score$### Score comercial (0–100)

Calcule um número inteiro de **0 a 100**, sem mostrar a pontuação ao contato. O score mede intenção de compra, aderência ao produto, momento e engajamento. Some as evidências abaixo e limite o resultado final ao intervalo de 0 a 100:

- intenção de compra, moradia, veraneio ou investimento confirmada: **+20**
- USO definido: **+10**
- pretende decidir em até 3 meses: **+20** · de 3 a 12 meses: **+10** · acima de 12 meses: **+5**
- faixa confirmada como compatível: **+20** · compatibilidade parcial: **+10**
- decisão individual ou casal/família alinhados: **+10**
- engajamento real, pergunta técnica ou resposta com contexto: **+10**
- pediu unidade, condição de pagamento, proposta, visita, ligação ou atendimento humano: **+10**

Regras de prevalência:

- pedido isolado de faixa geral, sem intenção confirmada, fica em **score máximo 20** e classificação `frio`;
- enquanto não houver sinal confiável de possível comprador, o score não passa de 20;
- faixa claramente incompatível limita o score a **25**, até surgir alternativa compatível confirmada;
- visita, proposta, reserva, negociação, unidade específica, condição comercial ou pedido de humano são sinais de alta intenção: use **score mínimo 80**, `handoff=true` e deixe o motor operacional definir a prioridade;
- transferência para Plantão, pós-venda ou outro setor não aumenta o score comercial de compra;
- opt-out, spam ou contato sem relação com a Bossa usa score 0.

### Classificação permitida

Use **exatamente um** destes valores no campo `classification`:

- `frio`: score de 0 a 20; curiosidade, intenção ainda não confirmada ou somente pedido de faixa geral;
- `morno`: score de 21 a 59; possível comprador com interesse real, mas ainda faltam aderência, prazo ou contexto;
- `quente`: score de 60 a 100; comprador com boa aderência ou intenção concreta, sem horário de visita/ligação já combinado;
- `agendamento`: somente quando visita, ligação ou videochamada estiver claramente combinada; use score mínimo 80, `stage=agendado` e `handoff=true`;
- `sem_interesse`: somente opt-out, spam ou contato sem relação útil com a Bossa; use score 0.

Nunca escreva `nutrir`, `régua longa`, A1, A2, B, C ou D no campo `classification`. Esses termos pertencem ao tratamento operacional e à prioridade, não ao enum de classificação. Um sinal explícito de alta intenção prevalece sobre a falta de campos de qualificação.$phase9_score$
      ),
      $price_anchor$**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.$price_anchor$,
      $price_aligned$**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.

### Efeito do preço no score e na classificação

- **Nível 1 — faixa geral sem intenção confirmada:** mantenha `classification=frio`, score máximo 20, sem arquivo, sem unidade e sem liberar a qualificação.
- **Nível 2 — faixa por tipologia:** só pode elevar para `morno` quando a conversa também trouxer sinais reais de possível comprador; a faixa, sozinha, não aumenta o score.
- **Nível 3 — apartamento específico:** exige USO e intenção confirmados. Pedido de unidade, disponibilidade, entrada, parcela ou condição específica é sinal de alta intenção: score mínimo 80, `classification=quente` e `handoff=true`, salvo quando já houver compromisso agendado, caso em que a classificação é `agendamento`.
- Se a consulta falhar ou não confirmar a condição vigente, não compense aumentando score nem inventando valor; escale para confirmação humana.$price_aligned$
    ) as new_prompt
  from current_prompts
), changed as (
  select *
  from rewritten
  where new_prompt is distinct from old_prompt
), archived as (
  insert into public.nara_prompt_versions (
    organization_id,
    prompt_text,
    reason,
    restored_from_id,
    created_by
  )
  select
    changed.organization_id,
    changed.old_prompt,
    'save',
    null,
    changed.updated_by
  from changed
  where not exists (
    select 1
    from public.nara_prompt_versions as version
    where version.organization_id = changed.organization_id
      and version.prompt_text = changed.old_prompt
      and version.reason = 'save'
  )
  returning id
)
update public.ai_agent_configs as config
set knowledge = jsonb_set(changed.knowledge, '{prompt_final}', to_jsonb(changed.new_prompt), true)
from changed
where config.id = changed.id;

commit;
''').strip() + '\n'
Path('supabase/migrations/020_nara_prompt_score_enum.sql').write_text(migration, encoding='utf-8')

check = dedent(r'''
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
assert.match(readme, /próximo número disponível é `021`/);
assert.match(workflow, /test:nara-phase9/);

console.log('Fase 9 validada: prompt na escala 0–100 e classificação limitada ao enum real da Nara.');
''').strip() + '\n'
Path('scripts/check-nara-phase9.mjs').write_text(check, encoding='utf-8')

package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package['scripts']['test:nara-phase9'] = 'node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/check-nara-phase9.mjs'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

readme_path = Path('supabase/migrations/README.md')
readme = readme_path.read_text(encoding='utf-8')
readme = readme.replace('19. `018_nara_dynamic_context.sql`\n20. `019_nara_prompt_versions.sql`', '19. `018_nara_dynamic_context.sql`\n20. `019_nara_prompt_versions.sql`\n21. `020_nara_prompt_score_enum.sql`') if '20. `019_nara_prompt_versions.sql`' in readme else readme.replace('19. `018_nara_dynamic_context.sql`', '19. `018_nara_dynamic_context.sql`\n20. `019_nara_prompt_versions.sql`\n21. `020_nara_prompt_score_enum.sql`')
readme = readme.replace('O próximo número disponível é `020`.', 'O próximo número disponível é `021`.').replace('O próximo número disponível é `019`.', 'O próximo número disponível é `021`.')
readme_path.write_text(readme, encoding='utf-8')

print('Fase 9 aplicada aos arquivos de trabalho.')
