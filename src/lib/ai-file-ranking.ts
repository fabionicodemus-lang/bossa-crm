import type { AiFileOption } from './ai';
import type { Lead } from './types';

type RankedAiFile = AiFileOption & {
  valid_from?: string | null;
  valid_until?: string | null;
  version_label?: string | null;
  content_group?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(' ').filter((item) => item.length >= 3));
}

function isCurrentlyValid(file: RankedAiFile, now = Date.now()) {
  const from = file.valid_from ? new Date(file.valid_from).getTime() : null;
  const until = file.valid_until ? new Date(file.valid_until).getTime() : null;
  if (from && Number.isFinite(from) && from > now) return false;
  if (until && Number.isFinite(until) && until < now) return false;
  return true;
}

function fileTimestamp(file: RankedAiFile) {
  return new Date(file.updated_at || file.created_at || 0).getTime() || 0;
}

function groupKey(file: RankedAiFile) {
  if (file.content_group?.trim()) return `group:${normalize(file.content_group)}`;
  const title = normalize(file.title || '').replace(/\b(?:v|versao|rev|revisao)\s*\d+[a-z0-9.-]*\b/g, '').trim();
  return `${normalize(file.category || 'outros')}:${title || normalize(file.original_name || file.id)}`;
}

function categoryIntentScore(category: string, corpus: string) {
  const value = normalize(corpus);
  const rules: Array<[RegExp, string[], number]> = [
    [/\b(?:tabela|preco|precos|valor|valores|espelho|disponibilidade)\b/, ['tabela', 'condicoes'], 10],
    [/\b(?:book|material|apresentacao|pdf|folder)\b/, ['book', 'institucional'], 9],
    [/\b(?:planta|layout|tipologia|quartos|suites)\b/, ['planta'], 10],
    [/\b(?:foto|imagem|render|fachada|vista)\b/, ['imagem'], 9],
    [/\b(?:video|obra|andamento|construcao|fundacao)\b/, ['video', 'obra'], 9],
    [/\b(?:condicao|entrada|parcela|parcelamento|pagamento)\b/, ['condicoes', 'tabela'], 10],
  ];
  let score = 0;
  for (const [pattern, categories, points] of rules) {
    if (pattern.test(value) && categories.includes(normalize(category))) score += points;
  }
  return score;
}

export function rankAiFilesForConversation(
  files: AiFileOption[] = [],
  history: ChatMessage[] = [],
  lead?: Lead | null,
  limit = 24,
): AiFileOption[] {
  const now = Date.now();
  const valid = (files as RankedAiFile[]).filter((file) => isCurrentlyValid(file, now));

  // Se houver várias versões do mesmo conteúdo, somente a versão válida mais nova
  // entra no contexto. content_group permite controle explícito; sem ele usamos
  // categoria+título como agrupamento automático.
  const newestByGroup = new Map<string, RankedAiFile>();
  for (const file of valid) {
    const key = groupKey(file);
    const current = newestByGroup.get(key);
    if (!current || fileTimestamp(file) > fileTimestamp(current)) newestByGroup.set(key, file);
  }

  const lastUser = history.filter((item) => item.role === 'user').slice(-8).map((item) => item.content).join(' ');
  const leadText = lead ? [lead.name, lead.company || '', JSON.stringify(lead.metadata || {})].join(' ') : '';
  const corpus = `${lastUser} ${leadText}`;
  const corpusNorm = normalize(corpus);
  const corpusTokens = tokens(corpus);
  const enterpriseFlow = /\bflow\b/.test(corpusNorm);
  const enterpriseAlma = /\balma\b/.test(corpusNorm);

  const scored = [...newestByGroup.values()].map((file) => {
    let score = 0;
    const title = normalize(file.title || '');
    const description = normalize(file.description || '');
    const filename = normalize(file.original_name || '');
    const category = normalize(file.category || '');
    const keywords = Array.isArray(file.trigger_keywords) ? file.trigger_keywords : [];

    for (const keyword of keywords) {
      const term = normalize(String(keyword));
      if (term && corpusNorm.includes(term)) score += 14;
    }
    for (const token of corpusTokens) {
      if (title.includes(token)) score += 5;
      if (description.includes(token)) score += 2;
      if (filename.includes(token)) score += 2;
    }
    score += categoryIntentScore(category, corpusNorm);

    if (enterpriseFlow && /\bflow\b/.test(`${title} ${description} ${filename} ${keywords.join(' ')}`)) score += 18;
    if (enterpriseAlma && /\balma\b/.test(`${title} ${description} ${filename} ${keywords.join(' ')}`)) score += 18;
    if (!enterpriseFlow && !enterpriseAlma && ['institucional', 'book'].includes(category)) score += 2;

    // Pequeno desempate para preferir a versão mais nova sem tornar recência
    // mais importante que relevância semântica.
    score += Math.min(2, Math.max(0, (fileTimestamp(file) - (now - 365 * 86400000)) / (365 * 86400000)));
    return { file, score };
  });

  scored.sort((a, b) => b.score - a.score || fileTimestamp(b.file) - fileTimestamp(a.file));
  const relevant = scored.filter((item) => item.score > 0).slice(0, limit);
  if (relevant.length >= Math.min(8, limit)) return relevant.map((item) => item.file);

  // Mantém alguns materiais institucionais recentes como fallback, mas nunca
  // devolve a biblioteca inteira para o modelo.
  const selected = new Map(relevant.map((item) => [item.file.id, item.file]));
  for (const item of scored) {
    if (selected.size >= limit) break;
    if (selected.has(item.file.id)) continue;
    if (['institucional', 'book', 'imagem', 'video'].includes(normalize(item.file.category || '')) || selected.size < 8) {
      selected.set(item.file.id, item.file);
    }
  }
  return [...selected.values()];
}
