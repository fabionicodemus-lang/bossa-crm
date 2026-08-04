export const NARA_PROMPT_MARKER = '# PROMPT FINAL DA NARA';
export const NARA_PROMPT_STORAGE_KEY = 'prompt_final';
export const LEGACY_NARA_PROMPT_STORAGE_KEY = 'triagem_pergunta_inicial';
export const NARA_PROMPT_MAX_LENGTH = 100_000;
export const DEFAULT_NARA_TRIAGE_QUESTION = 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?';

const TRIAGE_OPEN_MARKER = '<PERGUNTA_TRIAGEM>';
const TRIAGE_CLOSE_MARKER = '</PERGUNTA_TRIAGEM>';

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
  const prompt = extractNaraPrompt(knowledge);
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
