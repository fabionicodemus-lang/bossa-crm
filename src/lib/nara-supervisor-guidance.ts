import type { AiFileOption } from './ai';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function fileCorpus(file: AiFileOption) {
  return normalize([
    file.title,
    file.description ?? '',
    file.original_name,
    ...(file.trigger_keywords ?? []),
  ].join(' '));
}

export function requestsAllEnterpriseFacades(instruction: string): boolean {
  const value = normalize(instruction);
  const facade = /\b(fachada|fachadas|foto da fachada|fotos das fachadas)\b/.test(value);
  const all = /\b(cada|cada um|todos|todas|empreendimentos|projetos)\b/.test(value);
  return facade && all;
}

function facadeScore(file: AiFileOption, enterprise: 'soul' | 'flow' | 'alma') {
  if (String(file.category ?? '').toLowerCase() !== 'imagem') return -1;
  const corpus = fileCorpus(file);
  if (!corpus.includes(enterprise)) return -1;

  let score = 0;
  if (/\bfachada\b/.test(corpus)) score += 100;
  if (normalize(file.title).includes('fachada')) score += 30;
  if (enterprise === 'soul' && normalize(file.title) === 'soul bossa') score += 80;
  if (enterprise === 'soul' && /\b(pronto|exterior|bossa)\b/.test(corpus)) score += 15;
  if (file.mime_type?.toLowerCase().startsWith('image/')) score += 5;
  return score;
}

export function selectAllEnterpriseFacadeIds(
  instruction: string,
  files: AiFileOption[] = [],
): string[] {
  if (!requestsAllEnterpriseFacades(instruction)) return [];

  const ids: string[] = [];
  for (const enterprise of ['soul', 'flow', 'alma'] as const) {
    const match = files
      .map((file) => ({ file, score: facadeScore(file, enterprise) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.file;
    if (match?.id && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids.slice(0, 3);
}

export function mergeSupervisorAttachmentIds(args: {
  instruction: string;
  files: AiFileOption[];
  modelAttachmentIds: string[];
}): string[] {
  const available = new Set(args.files.map((file) => file.id));
  const forced = selectAllEnterpriseFacadeIds(args.instruction, args.files);
  const model = args.modelAttachmentIds.filter((id) => available.has(id));
  return [...new Set([...forced, ...model])].slice(0, 3);
}

export function promoteSupervisorFiles(args: {
  instruction: string;
  allFiles: AiFileOption[];
  rankedFiles: AiFileOption[];
  limit?: number;
}): AiFileOption[] {
  const limit = Math.max(3, args.limit ?? 40);
  const forcedIds = selectAllEnterpriseFacadeIds(args.instruction, args.allFiles);
  const byId = new Map(args.allFiles.map((file) => [file.id, file]));
  const forced = forcedIds.map((id) => byId.get(id)).filter((file): file is AiFileOption => Boolean(file));
  const merged = [...forced, ...args.rankedFiles];
  const seen = new Set<string>();
  return merged.filter((file) => {
    if (seen.has(file.id)) return false;
    seen.add(file.id);
    return true;
  }).slice(0, limit);
}
