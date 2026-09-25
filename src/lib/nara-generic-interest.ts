import type { AiFileOption } from './ai';

export type GenericInterestMessage = { role: 'user' | 'assistant'; content: string };

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGenericPortfolioInterest(history: GenericInterestMessage[]): boolean {
  const lastUserIndex = history.map((item) => item.role).lastIndexOf('user');
  if (lastUserIndex < 0) return false;

  const latest = normalize(history[lastUserIndex]?.content ?? '')
    .replace(/[!?.,;:]+$/g, '')
    .trim();
  const generic = /^(?:sim\s+)?(?:quero|gostaria de|tenho interesse em)\s+(?:conhecer|saber mais)(?:\s+(?:as?|os?|sobre as?|sobre os?)?\s*(?:oportunidades|empreendimentos|projetos|opcoes))?$/.test(latest);
  if (!generic) return false;

  const previousAssistant = [...history.slice(0, lastUserIndex)]
    .reverse()
    .find((item) => item.role === 'assistant')?.content ?? '';
  const previous = normalize(previousAssistant);
  if (!previous) return false;

  if (/\b(visita|visitar|agendar|agendamento|decorado|estande|pessoalmente|subir na obra)\b/.test(previous)) {
    return false;
  }
  return /\b(oportunidades|empreendimentos|projetos|opcoes|conhecer)\b/.test(previous);
}

function fileCorpus(file: AiFileOption) {
  return normalize([
    file.title,
    file.description ?? '',
    file.original_name,
    ...(file.trigger_keywords ?? []),
  ].join(' '));
}

export function selectPortfolioFacadeIds(files: AiFileOption[] = []): string[] {
  const result: string[] = [];
  for (const enterprise of ['flow', 'alma']) {
    const file = files.find((item) => {
      const corpus = fileCorpus(item);
      return String(item.category ?? '').toLocaleLowerCase('pt-BR') === 'imagem'
        && corpus.includes('fachada')
        && corpus.includes(enterprise);
    });
    if (file?.id && !result.includes(file.id)) result.push(file.id);
  }
  return result.slice(0, 2);
}
