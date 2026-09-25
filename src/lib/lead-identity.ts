export type LeadIdentity = {
  displayName: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  creci: string | null;
  raw: string;
};

const GENERIC_NAMES = new Set([
  'cliente', 'corretor', 'corretora', 'lead', 'contato', 'whatsapp',
  'sem nome', 'nao informado', 'não informado',
]);

function clean(value: unknown) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

export function leadNameLooksGeneric(value: unknown, phone?: string | null) {
  const name = clean(value);
  if (!name) return true;
  if (GENERIC_NAMES.has(fold(name))) return true;
  if (/^lead meta \d+$/i.test(name)) return true;
  const digits = name.replace(/\D/g, '');
  const phoneDigits = clean(phone).replace(/\D/g, '');
  if (digits.length >= 7 && /^[+() 0-9'-]+$/.test(name)) return true;
  if (phoneDigits && digits.length >= 7 && digits === phoneDigits) return true;
  return false;
}

function stripPrefix(value: string) {
  return clean(value)
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/^(?:bc2|bc3)\s*[-:]\s*/i, '')
    .replace(/^(?:eng(?:enheiro|enheira)?\.?|dr\.?|dra\.?|sr\.?|sra\.?)\s+/i, '')
    .trim();
}

function cutAtSeparator(value: string) {
  return value
    .split('|')[0]
    .split(' / ')[0]
    .split(';')[0]
    .replace(/\s[-=]\s.*$/u, '')
    .replace(/\.\s+.*$/u, '')
    .replace(/\s*\(.*$/u, '')
    .trim();
}

function truncateAtDescriptor(value: string) {
  const normalized = clean(value);
  const ascii = normalized.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const descriptor = /\s+(?:corretor(?:a)?|vendedor(?:a)?|proprietari[oa]|financeiro|comercial|representante|fundador(?:a)?|ceo|designer|engenheir[oa]|fornecedor(?:a)?|prestador(?:a)?|inquilin[oa]|marido|esposa|prop|seu|imobiliaria|imoveis|engenharia|construtora|construcoes|marmoraria|marmitaria|grafica|empreiteira|locacoes|distribuidora|investimentos?|representacoes|servicos|studio|acos|materiais?|decor|iluminacao|vidros|aluminio)\b/i.exec(ascii);
  if (!descriptor || descriptor.index === undefined) return normalized;
  return normalized.slice(0, descriptor.index).trim();
}

function personCandidate(value: string) {
  return truncateAtDescriptor(cutAtSeparator(stripPrefix(value)))
    .replace(/[,:;.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsBusinessSignal(value: string) {
  const text = fold(value);
  return /(?:imobiliaria|imobiliarios?|imoveis|engenharia|construtora|construcoes|marmoraria|marmitaria|grafica|empreiteira|locacoes|distribuidora|investimentos?|representacoes|servicos|studio|acos|materiais?|decor|iluminacao|vidros|aluminio|comercial|ltda)\b/.test(text)
    || /imoveis$/.test(text.replace(/\s+/g, ''));
}

function isPlausiblePersonName(value: string) {
  const name = clean(value);
  if (!name || leadNameLooksGeneric(name) || containsBusinessSignal(name)) return false;
  const tokens = name.split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 6) return false;
  if (tokens.length === 1) return /^[\p{L}][\p{L}'’.-]*$/u.test(tokens[0]);

  return tokens.every((token) => {
    if (/^(?:d[aeo]s?|dos|das|de|e)$/iu.test(token)) return true;
    if (!/^[\p{L}][\p{L}'’.-]*$/u.test(token)) return false;
    const first = token[0];
    return first === first.toLocaleUpperCase('pt-BR') || token === token.toLocaleUpperCase('pt-BR');
  });
}

function companyFromRaw(value: string) {
  const raw = clean(value);
  if (!raw) return null;

  const separator = raw.match(/(?:\||\s[-=]\s|\s\/\s)(.+)$/u)?.[1]?.trim();
  if (separator) {
    const cleaned = separator
      .replace(/^corretor(?:a)?\s+(?:de\s+)?im[oó]veis?\s*/iu, '')
      .replace(/^corretor(?:a)?\s*/iu, '')
      .trim();
    if (cleaned
      && !/^(?:creci|corretor|corretora)(?:\s|$)/i.test(cleaned)
      && (containsBusinessSignal(cleaned)
        || (cleaned.length <= 40 && cleaned === cleaned.toLocaleUpperCase('pt-BR')))) {
      return cleaned;
    }
  }

  const imobiliaria = raw.match(/\b(imobili[aá]ria\s+[\p{L}0-9&.'’ -]{2,60})/iu)?.[1]?.trim();
  if (imobiliaria) return imobiliaria.replace(/[,.]+$/g, '').trim();

  const tail = raw.match(/\b([\p{L}0-9&.'’ -]{2,50}\s+(?:im[oó]veis|engenharia|constru[cç][oõ]es|construtora|investimentos?|representa[cç][oõ]es|marmoraria|gr[aá]fica|empreiteira|loca[cç][oõ]es|ltda))\b/iu)?.[1]?.trim();
  if (tail && !isPlausiblePersonName(tail)) return tail;

  const candidate = cutAtSeparator(stripPrefix(raw));
  if (containsBusinessSignal(candidate) && !isPlausiblePersonName(candidate)) return candidate;

  return null;
}

function extractCreci(value: string) {
  const match = clean(value).match(/\bcreci\s*(?:[-:/]\s*)?([0-9]{3,8}\s*[A-Za-z]?)\b/i);
  return match?.[1]?.replace(/\s+/g, '').toUpperCase() ?? null;
}

export function splitLeadFullName(value: unknown) {
  const fullName = clean(value);
  if (!fullName || leadNameLooksGeneric(fullName)) {
    return { fullName: null, firstName: null, lastName: null };
  }
  const parts = fullName.split(/\s+/);
  return {
    fullName,
    firstName: parts[0] || null,
    lastName: parts.slice(1).join(' ') || null,
  };
}

export function normalizeLeadIdentity(value: unknown, fallbackCompany?: string | null): LeadIdentity {
  const raw = clean(value);
  const fallback = clean(fallbackCompany) || null;
  if (!raw || leadNameLooksGeneric(raw)) {
    return {
      displayName: fallback,
      fullName: null,
      firstName: null,
      lastName: null,
      company: fallback,
      creci: extractCreci(raw),
      raw,
    };
  }

  const candidate = personCandidate(raw);
  const person = isPlausiblePersonName(candidate)
    ? splitLeadFullName(candidate)
    : { fullName: null, firstName: null, lastName: null };
  const company = companyFromRaw(raw) || fallback;
  const displayName = person.fullName || company || (isPlausiblePersonName(raw) ? raw : null);

  return {
    displayName,
    fullName: person.fullName,
    firstName: person.firstName,
    lastName: person.lastName,
    company,
    creci: extractCreci(raw),
    raw,
  };
}

export function chooseLeadIdentity(values: Array<unknown>, fallbackCompany?: string | null) {
  for (const value of values) {
    const identity = normalizeLeadIdentity(value, fallbackCompany);
    if (identity.fullName || identity.company || identity.creci) return identity;
  }
  return normalizeLeadIdentity('', fallbackCompany);
}
