import type { AiFileOption } from './ai';

/**
 * Plantas oficiais dos empreendimentos, conforme o site (site/src/content/empreendimentos.ts).
 * A Nara usa este catálogo para escolher a planta pelo que o cliente pedir — metragem,
 * "o menor", número de suítes, duplex ou nome do tipo — sem exigir que ele conheça os
 * nomes internos dos arquivos (Fábio, 04/11/2026: "pediu planta, manda e explica").
 */
export type PlantDevelopment = 'alma' | 'flow';
type Language = 'pt' | 'es' | 'en';

export type PlantEntry = {
  development: PlantDevelopment;
  label: string;
  area: number;
  areaLabel: string;
  suites: number;
  duplex: boolean;
  /** Números de tipo usados nos nomes dos arquivos (ex.: "Tipo 02" → '2'). */
  types: string[];
  detail: Record<Language, string>;
  /** Diferença curta usada quando várias plantas vão juntas na mesma mensagem. */
  short?: Record<Language, string>;
};

export const PLANT_CATALOG: PlantEntry[] = [
  {
    development: 'alma', label: 'Tipo 02', area: 103, areaLabel: '103 m²', suites: 3, duplex: false, types: ['2'],
    detail: {
      pt: '3 suítes, 2 vagas, living integrado à cozinha, lavabo e churrasqueira a carvão',
      es: '3 suites, 2 cocheras, living integrado a la cocina, toilette y parrilla a carbón',
      en: '3 suites, 2 parking spaces, living room open to the kitchen, powder room and charcoal grill',
    },
  },
  {
    development: 'alma', label: 'Tipo 01', area: 114, areaLabel: '114 m²', suites: 3, duplex: false, types: ['1'],
    detail: {
      pt: '3 suítes, 2 vagas, living integrado à cozinha, lavabo e churrasqueira a carvão',
      es: '3 suites, 2 cocheras, living integrado a la cocina, toilette y parrilla a carbón',
      en: '3 suites, 2 parking spaces, living room open to the kitchen, powder room and charcoal grill',
    },
  },
  {
    development: 'alma', label: 'Duplex Tipo 2', area: 145, areaLabel: '145 m²', suites: 4, duplex: true, types: ['2'],
    detail: {
      pt: '4 suítes em dois pisos, 2 vagas e living com pé-direito duplo',
      es: '4 suites en dos pisos, 2 cocheras y living de doble altura',
      en: '4 suites over two floors, 2 parking spaces and a double-height living room',
    },
  },
  {
    development: 'alma', label: 'Duplex Tipo 1', area: 168, areaLabel: '168 m²', suites: 4, duplex: true, types: ['1'],
    detail: {
      pt: '4 suítes em dois pisos, 2 vagas, living com pé-direito duplo e suíte master no piso superior',
      es: '4 suites en dos pisos, 2 cocheras, living de doble altura y suite principal en el piso superior',
      en: '4 suites over two floors, 2 parking spaces, double-height living room and master suite upstairs',
    },
    short: { pt: 'suíte master no piso superior', es: 'suite principal arriba', en: 'master suite upstairs' },
  },
  {
    development: 'flow', label: 'Tipo 2', area: 62, areaLabel: '62 m²', suites: 2, duplex: false, types: ['2'],
    detail: { pt: '2 suítes, com sol da manhã', es: '2 suites, con sol de la mañana', en: '2 suites, with morning sun' },
    short: { pt: 'sol da manhã', es: 'sol de la mañana', en: 'morning sun' },
  },
  {
    development: 'flow', label: 'Tipo 3', area: 62, areaLabel: '62 m²', suites: 2, duplex: false, types: ['3'],
    detail: { pt: '2 suítes, com sol da tarde', es: '2 suites, con sol de la tarde', en: '2 suites, with afternoon sun' },
    short: { pt: 'sol da tarde', es: 'sol de la tarde', en: 'afternoon sun' },
  },
  {
    development: 'flow', label: 'Tipo 1', area: 73, areaLabel: '73 m²', suites: 2, duplex: false, types: ['1'],
    detail: {
      pt: '2 suítes e lavabo, sol da manhã no living e da tarde nas suítes',
      es: '2 suites y toilette, sol de la mañana en el living y de la tarde en las suites',
      en: '2 suites and powder room, morning sun in the living room and afternoon sun in the suites',
    },
    short: { pt: 'com lavabo', es: 'con toilette', en: 'with powder room' },
  },
  {
    development: 'flow', label: 'Duplex Tipo 2 e 3', area: 93, areaLabel: '93 m²', suites: 3, duplex: true, types: ['2', '3'],
    detail: {
      pt: '3 suítes em dois pisos e living com pé-direito duplo, todo em vidro',
      es: '3 suites en dos pisos y living de doble altura, todo vidriado',
      en: '3 suites over two floors and a double-height, fully glazed living room',
    },
  },
  {
    development: 'flow', label: 'Duplex Tipo 1', area: 117.7, areaLabel: '117,7 m²', suites: 3, duplex: true, types: ['1'],
    detail: {
      pt: '3 suítes em dois pisos e living com pé-direito duplo de 4,90 m, todo em vidro',
      es: '3 suites en dos pisos y living de doble altura de 4,90 m, todo vidriado',
      en: '3 suites over two floors and a 4.90 m double-height, fully glazed living room',
    },
  },
];

const PROJECT_NAME: Record<PlantDevelopment, string> = { alma: 'Alma', flow: 'Flow' };

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

/**
 * O texto pede planta? Em português "plano" é ambíguo ("o caminho é plano?", "plano de pagamento"),
 * então só conta "planta". Em espanhol, "plano" vale quando vem como substantivo ("el plano", "los planos").
 */
export function mentionsPlant(text: string): boolean {
  const value = normalize(text);
  if (/\b(plantas?|floor ?plans?|layout)\b/.test(value)) return true;
  if (/\bplanos? (?:de |del )?(?:pagamento|pago|completo|financ\w*|parcelamento)\b/.test(value)) return false;
  return /\b(?:el|los|un|unos|ver|mandame|mandar|enviame|enviar|manda|envia)\s+planos?\b/.test(value)
    || /\bplanos? (?:del|de la|de los) (?:departamento|depto|apartamento|unidad)/.test(value);
}

function fileHaystack(file: AiFileOption): string {
  return normalize([file.category, file.title, file.description ?? '', file.original_name ?? '', ...(file.trigger_keywords ?? [])].join(' '));
}

export function isPlantFile(file: AiFileOption): boolean {
  const haystack = fileHaystack(file);
  return /\b(planta|plantas|plano|planos)\b/.test(haystack) && !/\b(lazer|rooftop|roof|move|implantacao)\b/.test(haystack);
}

function areaInText(haystack: string, area: number): boolean {
  const whole = String(Math.floor(area));
  const decimal = String(area).replace('.', ',');
  return new RegExp(`\\b(?:${whole}|${decimal.replace(',', '[,.]')})\\s*(?:m2|m²|m\\b|metros)`).test(haystack);
}

function typeInText(haystack: string, type: string, duplex = false): boolean {
  if (new RegExp(`\\btipos?\\s*0?${type}\\b|\\btipo\\s*0?\\d\\s*e\\s*0?${type}\\b`).test(haystack)) return true;
  // Biblioteca do Alma: "Planta Duplex 01" / "Duplex 02.jpg", sem a palavra "tipo".
  return duplex && new RegExp(`\\bduplex\\s*0?${type}\\b`).test(haystack);
}

/** Arquivos da biblioteca que correspondem a uma planta do catálogo. */
export function filesForPlant(entry: PlantEntry, files: AiFileOption[] = []): AiFileOption[] {
  return files.filter((file) => {
    if (!isPlantFile(file)) return false;
    const haystack = fileHaystack(file);
    if (!new RegExp(`\\b${entry.development}\\b`).test(haystack)) return false;
    const fileIsDuplex = /\bduplex\b/.test(haystack);
    if (fileIsDuplex !== entry.duplex) return false;
    return entry.types.some((type) => typeInText(haystack, type, entry.duplex)) || areaInText(haystack, entry.area);
  });
}

export type PlantRequest = {
  entries: PlantEntry[];
  /** true quando o cliente não especificou nada e mandamos as plantas padrão. */
  generic: boolean;
};

/** Interpreta o pedido de planta pelo texto do cliente (e, se preciso, pela fala anterior da Nara). */
export function resolvePlantRequest(development: PlantDevelopment, latest: string, previousAssistant = ''): PlantRequest {
  const own = PLANT_CATALOG.filter((entry) => entry.development === development);
  const standard = own.filter((entry) => !entry.duplex);
  const extreme = (entries: PlantEntry[], value: string): PlantEntry[] => {
    if (entries.length < 2) return entries;
    if (/\b(maior|mais espacos[oa]|mas grande|largest|biggest)\b/.test(value)) {
      const max = Math.max(...entries.map((entry) => entry.area));
      return entries.filter((entry) => entry.area === max);
    }
    if (/\b(menor|mais barat[oa]|mais em conta|compacto|pequen[oa]|mas chico|smallest|cheapest)\b/.test(value)) {
      const min = Math.min(...entries.map((entry) => entry.area));
      return entries.filter((entry) => entry.area === min);
    }
    return entries;
  };
  const fromText = (text: string): PlantEntry[] => {
    const value = normalize(text);
    const area = value.match(/\b(\d{2,3}(?:[.,]\d)?)\s*(?:m2|m²|m\b|metros)/)?.[1];
    if (area) {
      const target = Number(area.replace(',', '.'));
      const matches = own.filter((entry) => Math.abs(entry.area - target) <= 1.5);
      if (matches.length) return matches;
    }
    // "duplex de 145", "a de 103": número que bate com uma metragem do catálogo, mesmo sem "m²".
    for (const number of value.match(/\b\d{2,3}(?:[.,]\d)?\b/g) ?? []) {
      const target = Number(number.replace(',', '.'));
      const matches = own.filter((entry) => Math.abs(entry.area - target) <= 1.5);
      if (matches.length) return matches;
    }
    const type = value.match(/\b(duplex\s*)?tipo\s*0?(\d)\b/);
    if (type) {
      const duplex = Boolean(type[1]) || /\bduplex\b/.test(value);
      const matches = own.filter((entry) => entry.duplex === duplex && entry.types.includes(type[2]));
      if (matches.length) return matches;
    }
    const suites = value.match(/\b(\d|dois|duas|tres|quatro)\s*(?:suites?|quartos?|dormitorios?|habitaciones?|bedrooms?)\b/)?.[1];
    if (suites) {
      const count = ({ dois: 2, duas: 2, tres: 3, quatro: 4 } as Record<string, number>)[suites] ?? Number(suites);
      const matches = own.filter((entry) => entry.suites === count);
      if (matches.length) return extreme(/\bduplex\b/.test(value) ? matches.filter((entry) => entry.duplex) : matches, value);
    }
    if (/\bduplex\b/.test(value)) return extreme(own.filter((entry) => entry.duplex), value);
    if (/\b(menor|mais barat[oa]|mais em conta|compacto|pequen[oa]|mas chico|mas barato|smallest|cheapest)\b/.test(value)) {
      const min = Math.min(...standard.map((entry) => entry.area));
      return standard.filter((entry) => entry.area === min);
    }
    if (/\b(maior|mais espacos[oa]|mas grande|largest|biggest)\b/.test(value)) {
      const max = Math.max(...own.map((entry) => entry.area));
      return own.filter((entry) => entry.area === max);
    }
    return [];
  };

  const direct = fromText(latest);
  if (direct.length) return { entries: direct, generic: false };
  // "Manda a planta dessa" logo depois de a Nara citar uma metragem específica.
  if (/\b(dess[ae]|est[ae]|ess[ae] mesm[oa]|que voce (?:falou|disse|citou))\b/.test(normalize(latest))) {
    const previous = fromText(previousAssistant);
    if (previous.length && previous.length <= 2) return { entries: previous, generic: false };
  }
  return { entries: standard, generic: true };
}

function joinList(items: string[], language: Language): string {
  if (items.length <= 1) return items[0] ?? '';
  const and = language === 'es' ? 'y' : language === 'en' ? 'and' : 'e';
  return `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`;
}

/** Texto humano que acompanha a planta enviada (ou explica a planta quando o arquivo não existe). */
export function plantReply(args: {
  development: PlantDevelopment;
  request: PlantRequest;
  sentEntries: PlantEntry[];
  language: Language;
  allowQuestion: boolean;
}): string {
  const { development, request, sentEntries, language, allowQuestion } = args;
  const name = PROJECT_NAME[development];
  const own = PLANT_CATALOG.filter((entry) => entry.development === development);
  const entries = request.entries;
  const sentAll = sentEntries.length === entries.length;
  const smallest = Math.min(...own.filter((entry) => !entry.duplex).map((entry) => entry.area));

  let main: string;
  if (entries.length === 1) {
    const entry = entries[0];
    const extra = !entry.duplex && entry.area === smallest
      ? (language === 'es' ? ' Es la opción más compacta del proyecto.' : language === 'en' ? ' It is the most compact option in the project.' : ' É a opção mais compacta do projeto.')
      : '';
    main = language === 'es'
      ? `${sentAll ? 'Aquí está' : 'Te cuento'} la planta de ${entry.areaLabel} de ${name} (${entry.label}): ${entry.detail.es}.${extra}`
      : language === 'en'
        ? `${sentAll ? 'Here is' : 'Here are the details of'} the ${entry.areaLabel} floor plan at ${name} (${entry.label}): ${entry.detail.en}.${extra}`
        : `${sentAll ? 'Aqui está' : 'Te explico'} a planta de ${entry.areaLabel} do ${name} (${entry.label}): ${entry.detail.pt}.${extra}`;
  } else {
    const sameSuites = entries.every((entry) => entry.suites === entries[0].suites);
    const allDuplex = entries.every((entry) => entry.duplex);
    const parts = entries.map((entry) => {
      const short = entry.short?.[language];
      return `${entry.areaLabel} (${entry.label}${short ? `, ${short}` : ''})`;
    });
    const count = entries.length === 2
      ? (language === 'es' ? 'ambas' : language === 'en' ? 'both' : 'as duas')
      : (language === 'es' ? 'todas' : language === 'en' ? 'all' : 'todas');
    const suitesWord = language === 'en' ? 'suites' : language === 'es' ? 'suites' : 'suítes';
    const duplexWord = allDuplex ? (language === 'en' ? ' over two floors' : language === 'es' ? ' en dos pisos' : ' em dois pisos') : '';
    const withWord = language === 'en' ? 'with' : language === 'es' ? 'con' : 'com';
    const sameDetail = entries.every((entry) => entry.detail.pt === entries[0].detail.pt);
    // Pedido genérico leva também a oferta do duplex: texto mais enxuto para caber em 45 palavras.
    const common = sameDetail && !request.generic
      ? `, ${count} ${withWord} ${entries[0].detail[language]}`
      : sameSuites ? `, ${count} ${withWord} ${entries[0].suites} ${suitesWord}${duplexWord}` : '';
    main = language === 'es'
      ? `${sentAll ? 'Te envío' : 'Te cuento'} las plantas de ${name}: ${joinList(parts, language)}${common}.`
      : language === 'en'
        ? `${sentAll ? 'Sending you' : 'Here are'} the ${name} floor plans: ${joinList(parts, language)}${common}.`
        : `${sentAll ? 'Te mando' : 'Te explico'} as plantas do ${name}: ${joinList(parts, language)}${common}.`;
  }

  if (!sentEntries.length) {
    main += language === 'es'
      ? ' El archivo de esta planta no está conmigo ahora; el equipo puede enviártelo.'
      : language === 'en'
        ? ' I do not have this floor plan file with me right now; the team can send it to you.'
        : ' O arquivo dessa planta não está comigo agora; o time pode te enviar.';
    return main;
  }

  if (allowQuestion && request.generic) {
    const duplexes = own.filter((entry) => entry.duplex);
    if (duplexes.length) {
      const areas = joinList(duplexes.map((entry) => entry.areaLabel), language);
      main += language === 'es'
        ? ` También hay dúplex de ${duplexes[0].suites} suites, de ${areas}. ¿Quieres verlos?`
        : language === 'en'
          ? ` There are also ${duplexes[0].suites}-suite duplexes, ${areas}. Want to see them?`
          : ` Também tem duplex de ${duplexes[0].suites} suítes, de ${areas}. Quer ver?`;
    }
  }
  return main;
}
