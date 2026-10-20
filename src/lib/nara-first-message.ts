// Primeira mensagem da Nara (definida com o Fábio em 20/10/2026).
//
// 1. Se o lead veio de um anúncio de um empreendimento específico, a Nara fala
//    só daquele empreendimento, com um benefício e uma pergunta fácil.
// 2. Sem origem conhecida, apresenta a carteira por benefícios (não por datas)
//    com as fachadas e pergunta se algum é o que a pessoa viu.
// 3. Se o contato disse de onde é ("sou o Fabio de Chile"), comenta isso antes,
//    como uma pessoa faria.

import type { AiFileOption } from './ai';
import { readMetaAdAttribution } from './meta-ad-attribution';

export type Development = 'soul' | 'flow' | 'alma';
export type Language = 'pt' | 'es' | 'en';

const WORD_LIMIT = 45;

function wordCount(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

/** Empreendimento do anúncio de origem (headline, texto, link) ou da origem do lead. */
export function adDevelopment(
  metadata: Record<string, unknown> | null | undefined,
  source?: string | null,
): Development | null {
  const ad = readMetaAdAttribution(metadata);
  const text = normalize([ad?.headline, ad?.body, ad?.source_url, source].filter(Boolean).join(' '));
  if (!text) return null;
  const found = (['soul', 'flow', 'alma'] as const).filter((item) => new RegExp(`\\b${item}\\b`).test(text));
  return found.length === 1 ? found[0] : null;
}

/** "Sou o Fabio de Curitiba", "soy Fabio de Chile", "sou do Rio", "I'm Ana from Texas" → lugar com a preposição usada. */
export function declaredPlace(text: string): string {
  const place = String.raw`(\p{Lu}[\p{L}'’-]+(?:\s+(?:de\s+|do\s+|da\s+)?\p{Lu}[\p{L}'’-]+){0,2})`;
  const intro = String.raw`(?:[Ss]ou|[Ss]oy|[Ii]'?m|[Ii] am|[Aa]qui é|[Mm]e llamo|[Mm]e chamo)`;
  const withName = new RegExp(String.raw`\b${intro}\s+(?:o\s+|a\s+)?[\p{L}'’-]+(?:\s+[\p{L}'’-]+)?\s+(de|do|da|from)\s+${place}`, 'u');
  const withoutName = new RegExp(String.raw`\b(?:[Ss]ou|[Ss]oy|[Ii]'?m)\s+(de|do|da|from)\s+${place}`, 'u');
  const match = text.match(withName) ?? text.match(withoutName);
  return match ? `${match[1]} ${match[2]}`.trim() : '';
}

function placeLine(place: string, language: Language): string {
  if (!place) return '';
  const [prep, ...rest] = place.split(' ');
  const name = rest.join(' ');
  if (language === 'es') return `¡Qué bueno hablar con alguien de ${name}!`;
  if (language === 'en') return `Great to hear from someone in ${name}!`;
  return `Que bom falar com alguém ${prep === 'from' ? 'de' : prep} ${name}!`;
}

const PORTFOLIO: Record<Language, string> = {
  pt: 'Temos o Soul, pronto para morar, o Flow, prático a 800 m do mar, e o Alma, uma casa na praia a 300 m. Algum deles é o que você viu?',
  es: 'Tenemos Soul, listo para vivir, Flow, práctico a 800 m del mar, y Alma, una casa de playa a 300 m. ¿Alguno es el que viste?',
  en: 'We have Soul, ready to move in, Flow, practical and 800 m from the beach, and Alma, a beach house 300 m from the sand. Is one of them the one you saw?',
};

const SINGLE: Record<Development, Record<Language, string>> = {
  alma: {
    pt: 'Que bom que o Alma te chamou atenção! Ele é uma casa na praia: só dois apartamentos por andar, a 4 minutos a pé da areia. Você pensa nele para curtir com a família ou para morar?',
    es: '¡Qué bueno que Alma te llamó la atención! Es una casa de playa: solo dos departamentos por piso, a 4 minutos a pie de la arena. ¿Lo imaginas para disfrutar en familia o para vivir?',
    en: 'So glad Alma caught your eye! It is a beach house: only two apartments per floor, a 4-minute walk to the sand. Do you picture it for family time or to live in?',
  },
  flow: {
    pt: 'Que bom que o Flow te chamou atenção! Ele é para quem quer praia e cidade no mesmo dia: 800 m do mar e dois andares de lazer completos. Você pensa em morar, alugar ou os dois?',
    es: '¡Qué bueno que Flow te llamó la atención! Es para quien quiere playa y ciudad el mismo día: a 800 m del mar y dos pisos de amenidades. ¿Piensas vivir, alquilar o ambos?',
    en: 'So glad Flow caught your eye! It is for people who want beach and city on the same day: 800 m from the sea and two full leisure floors. Thinking of living, renting or both?',
  },
  soul: {
    pt: 'Que bom que o Soul te chamou atenção! Ele está pronto para morar, em Itapema, com rooftop completo. Você procura para morar ou para investir?',
    es: '¡Qué bueno que Soul te llamó la atención! Está listo para vivir, en Itapema, con rooftop completo. ¿Lo buscas para vivir o para invertir?',
    en: 'So glad Soul caught your eye! It is ready to move in, in Itapema, with a full rooftop. Are you looking to live in it or to invest?',
  },
};

/** Monta a primeira mensagem; o lugar só entra se couber no limite de palavras. */
export function firstMessageBody(args: {
  intro: string;
  language: Language;
  development: Development | null;
  place: string;
}): string {
  const body = args.development ? SINGLE[args.development][args.language] : PORTFOLIO[args.language];
  const place = placeLine(args.place, args.language);
  const withPlace = [args.intro, place, body].filter(Boolean).join(' ');
  if (place && wordCount(withPlace) <= WORD_LIMIT) return withPlace;
  return [args.intro, body].filter(Boolean).join(' ');
}

function fileCorpus(file: AiFileOption): string {
  return normalize([file.title, file.description ?? '', file.original_name, ...(file.trigger_keywords ?? [])].join(' '));
}

/** Fachada de um empreendimento na biblioteca (categoria imagem, "fachada" + nome). */
export function facadeFor(files: AiFileOption[] = [], development: Development): string | null {
  const file = files.find((item) => {
    const corpus = fileCorpus(item);
    return String(item.category ?? '').toLocaleLowerCase('pt-BR') === 'imagem'
      && corpus.includes('fachada')
      && new RegExp(`\\b${development}\\b`).test(corpus);
  });
  return file?.id ?? null;
}

/** Bloco para o modelo saber de onde o lead veio. */
export function adOriginInstruction(development: Development | null): string {
  if (!development) return '';
  const name = development === 'alma' ? 'Alma Seahouses' : development === 'flow' ? 'Flow Aptos' : 'Soul Residence';
  return `ORIGEM DO CONTATO: veio de um anúncio do ${name}. Na primeira resposta, fale só do ${name} (um benefício que encante e uma pergunta fácil). Não apresente os outros empreendimentos, a menos que o contato peça ou que o ${name} claramente não atenda ao que ele procura.`;
}
