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

- pedido isolado de faixa geral, sem intenção confirmada, fica em **score máximo 20** e classificação \`frio\`;
- enquanto não houver sinal confiável de possível comprador, o score não passa de 20;
- faixa claramente incompatível limita o score a **25**, até surgir alternativa compatível confirmada;
- visita, proposta, reserva, negociação, unidade específica, condição comercial ou pedido de humano são sinais de alta intenção: use **score mínimo 80**, \`handoff=true\` e deixe o motor operacional definir a prioridade;
- transferência para Plantão, pós-venda ou outro setor não aumenta o score comercial de compra;
- opt-out, spam ou contato sem relação com a Bossa usa score 0.

### Classificação permitida

Use **exatamente um** destes valores no campo \`classification\`:

- \`frio\`: score de 0 a 20; curiosidade, intenção ainda não confirmada ou somente pedido de faixa geral;
- \`morno\`: score de 21 a 59; possível comprador com interesse real, mas ainda faltam aderência, prazo ou contexto;
- \`quente\`: score de 60 a 100; comprador com boa aderência ou intenção concreta, sem horário de visita/ligação já combinado;
- \`agendamento\`: somente quando visita, ligação ou videochamada estiver claramente combinada; use score mínimo 80, \`stage=agendado\` e \`handoff=true\`;
- \`sem_interesse\`: somente opt-out, spam ou contato sem relação útil com a Bossa; use score 0.

Nunca escreva \`nutrir\`, \`régua longa\`, A1, A2, B, C ou D no campo \`classification\`. Esses termos pertencem ao tratamento operacional e à prioridade, não ao enum de classificação. Um sinal explícito de alta intenção prevalece sobre a falta de campos de qualificação.`;

export const NARA_PHASE9_PRICE_ALIGNMENT = `### Efeito do preço no score e na classificação

- **Nível 1 — faixa geral sem intenção confirmada:** mantenha \`classification=frio\`, score máximo 20, sem arquivo, sem unidade e sem liberar a qualificação.
- **Nível 2 — faixa por tipologia:** só pode elevar para \`morno\` quando a conversa também trouxer sinais reais de possível comprador; a faixa, sozinha, não aumenta o score.
- **Nível 3 — apartamento específico:** exige USO e intenção confirmados. Pedido de unidade, disponibilidade, entrada, parcela ou condição específica é sinal de alta intenção: score mínimo 80, \`classification=quente\` e \`handoff=true\`, salvo quando já houver compromisso agendado, caso em que a classificação é \`agendamento\`.
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
    if (!prompt.includes(`\`${classification}\``)) issues.push(`classificação ${classification} ausente`);
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
