const CITY_TIMEZONES: Array<{ pattern: RegExp; label: string; zone: string }> = [
  { pattern: /\borlando\b/i, label: 'Orlando', zone: 'America/New_York' },
  { pattern: /\bmiami\b/i, label: 'Miami', zone: 'America/New_York' },
  { pattern: /\b(nova york|new york)\b/i, label: 'Nova York', zone: 'America/New_York' },
  { pattern: /\bboston\b/i, label: 'Boston', zone: 'America/New_York' },
  { pattern: /\blisboa\b/i, label: 'Lisboa', zone: 'Europe/Lisbon' },
  { pattern: /\bporto\b/i, label: 'Porto', zone: 'Europe/Lisbon' },
  { pattern: /\bcopenhague\b/i, label: 'Copenhague', zone: 'Europe/Copenhagen' },
  { pattern: /\bsantiago\b/i, label: 'Santiago', zone: 'America/Santiago' },
];

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function zonedLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(desired);
  for (let i = 0; i < 3; i += 1) {
    const actual = partsInZone(guess, timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    guess = new Date(guess.getTime() + (desired - represented));
  }
  return guess;
}

export type ContactTimePreference = {
  original: string;
  city: string;
  source_timezone: string;
  brasilia_timezone: 'America/Sao_Paulo';
  brasilia_time: string;
};

export function extractContactTimePreference(text: string, now = new Date()): ContactTimePreference | null {
  const city = CITY_TIMEZONES.find((item) => item.pattern.test(text));
  if (!city) return null;
  const time = text.match(/(?:depois\s+d(?:as?|e)|ap[oó]s|a partir d(?:as?|e)|por volta d(?:as?|e))?\s*(\d{1,2})(?::(\d{2}))?\s*h?/i);
  if (!time?.[1]) return null;
  const hour = Math.min(23, Number(time[1]));
  const minute = Math.min(59, Number(time[2] ?? 0));
  const localDate = partsInZone(now, city.zone);
  const instant = zonedLocalToUtc(localDate.year, localDate.month, localDate.day, hour, minute, city.zone);
  const br = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return {
    original: text.trim(),
    city: city.label,
    source_timezone: city.zone,
    brasilia_timezone: 'America/Sao_Paulo',
    brasilia_time: br,
  };
}
