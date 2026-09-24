type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type NaraPreferredContactTime = {
  city: string;
  country: string | null;
  timezone: string;
  local_preference: string;
  brasilia_preference: string;
  source_text: string;
};

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function userText(history: ChatMessage[]) {
  return history.filter((item) => item.role === 'user').map((item) => item.content).join('\n');
}

function extractCity(history: ChatMessage[]) {
  const raw = userText(history);
  const patterns = [
    /\bmoro\s+(?:aqui\s+)?em\s+([\p{L} .'-]{2,60})(?=[,.!?;\n]|\s+h[áa]\s+\d|\s+faz\s+\d|$)/iu,
    /\bsou\s+de\s+([\p{L} .'-]{2,60})(?=[,.!?;\n]|$)/iu,
    /\baqui\s+em\s+([\p{L} .'-]{2,60})(?=[,.!?;\n]|$)/iu,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern)?.[1]?.trim();
    if (match) return match.replace(/\s+(?:ha|há)\s+\d.*$/iu, '').trim();
  }
  return '';
}

function extractClockPreference(history: ChatMessage[]) {
  const messages = history.filter((item) => item.role === 'user').map((item) => item.content);
  for (const message of [...messages].reverse()) {
    const normalized = normalize(message);
    if (!/(depois|apos|a partir|so consigo|melhor horario|pode ligar|video|ligar)/.test(normalized)) continue;

    const ampm = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (ampm) {
      let hour = Number(ampm[1]);
      const minute = Number(ampm[2] ?? 0);
      const marker = normalize(ampm[3]).replace(/\./g, '');
      if (marker === 'pm' && hour < 12) hour += 12;
      if (marker === 'am' && hour === 12) hour = 0;
      if (hour <= 23 && minute <= 59) {
        return {
          hour,
          minute,
          raw: ampm[0],
          after: /(depois|apos|a partir|so consigo)/.test(normalized),
        };
      }
    }

    const h24 = message.match(/\b(?:depois\s+d(?:as?|e)|ap[oó]s\s+(?:as\s+)?|a\s+partir\s+d(?:as?|e)\s+)?(\d{1,2})(?::(\d{2}))?\s*h(?:oras?)?\b/i);
    if (h24) {
      const hour = Number(h24[1]);
      const minute = Number(h24[2] ?? 0);
      if (hour <= 23 && minute <= 59) {
        return {
          hour,
          minute,
          raw: h24[0],
          after: /(depois|apos|a partir|so consigo)/.test(normalized),
        };
      }
    }
  }
  return null;
}

type GeocodeResult = {
  name?: string;
  country?: string;
  timezone?: string;
  admin1?: string;
};

async function geocodeCity(city: string): Promise<GeocodeResult | null> {
  if (!city) return null;
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', city);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'pt');
  url.searchParams.set('format', 'json');
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { results?: GeocodeResult[] };
  return (payload.results ?? []).find((item) => Boolean(item.timezone)) ?? null;
}

function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetMilliseconds(date: Date, timeZone: string) {
  const parts = partsInTimeZone(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - date.getTime();
}

function localWallTimeToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}) {
  let guess = new Date(Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, 0));
  for (let index = 0; index < 3; index += 1) {
    const offset = offsetMilliseconds(guess, args.timeZone);
    guess = new Date(Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, 0) - offset);
  }
  return guess;
}

function clockLabel(hour: number, minute: number) {
  return minute ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : `${String(hour).padStart(2, '0')}h`;
}

export function convertLocalClockToBrasilia(args: {
  sourceTimeZone: string;
  hour: number;
  minute?: number;
  referenceDate?: Date;
}) {
  const reference = args.referenceDate ?? new Date();
  const localDate = partsInTimeZone(reference, args.sourceTimeZone);
  const instant = localWallTimeToUtc({
    year: localDate.year,
    month: localDate.month,
    day: localDate.day,
    hour: args.hour,
    minute: args.minute ?? 0,
    timeZone: args.sourceTimeZone,
  });
  const brasilia = partsInTimeZone(instant, 'America/Sao_Paulo');
  return {
    instant,
    hour: brasilia.hour,
    minute: brasilia.minute,
  };
}

export async function resolvePreferredContactTime(
  history: ChatMessage[],
  now = new Date(),
): Promise<NaraPreferredContactTime | null> {
  const preference = extractClockPreference(history);
  if (!preference) return null;

  const city = extractCity(history);
  if (!city) return null;

  let geocoded: GeocodeResult | null = null;
  try {
    geocoded = await geocodeCity(city);
  } catch {
    return null;
  }
  if (!geocoded?.timezone) return null;

  const converted = convertLocalClockToBrasilia({
    sourceTimeZone: geocoded.timezone,
    hour: preference.hour,
    minute: preference.minute,
    referenceDate: now,
  });
  const brasilia = { hour: converted.hour, minute: converted.minute };
  const prefix = preference.after ? 'depois das ' : 'às ';
  const localPreference = `${prefix}${clockLabel(preference.hour, preference.minute)} em ${geocoded.name || city}`;
  const brasiliaPreference = `${prefix}${clockLabel(brasilia.hour, brasilia.minute)} no horário de Brasília`;

  return {
    city: geocoded.name || city,
    country: geocoded.country || null,
    timezone: geocoded.timezone,
    local_preference: localPreference,
    brasilia_preference: brasiliaPreference,
    source_text: [
      'HORÁRIO PREFERIDO PELO CONTATO:',
      `- Local informado: ${geocoded.name || city}${geocoded.country ? `, ${geocoded.country}` : ''}.`,
      `- Fuso IANA resolvido: ${geocoded.timezone}.`,
      `- Preferência local: ${localPreference}.`,
      `- Conversão para Brasília na data atual, incluindo horário de verão quando aplicável: ${brasiliaPreference}.`,
      '- Salve e repasse os dois horários ao comercial; para combinar com a equipe no Brasil, use também o horário de Brasília.',
    ].join('\n'),
  };
}
