const CITY_TIMEZONES: Array<{ pattern: RegExp; label: string; zone: string }> = [
  { pattern: /\borlando\b/i, label: 'Orlando', zone: 'America/New_York' },
  { pattern: /\bmiami\b/i, label: 'Miami', zone: 'America/New_York' },
  { pattern: /\b(nova york|new york)\b/i, label: 'Nova York', zone: 'America/New_York' },
  { pattern: /\bboston\b/i, label: 'Boston', zone: 'America/New_York' },
  { pattern: /\blisboa\b/i, label: 'Lisboa', zone: 'Europe/Lisbon' },
  // Porto Belo is the product location in Brazil, not the Portuguese city of Porto.
  { pattern: /\bporto\b(?!\s+belo\b)/i, label: 'Porto', zone: 'Europe/Lisbon' },
  { pattern: /\bcopenhague\b/i, label: 'Copenhague', zone: 'Europe/Copenhagen' },
  { pattern: /\bsantiago\b/i, label: 'Santiago', zone: 'America/Santiago' },
];

export function naraContactZone(text: string) {
  const city = CITY_TIMEZONES.find((item) => item.pattern.test(text));
  if (city) return city.zone;
  if (/\b(chile|chileno)\b/i.test(text)) return 'America/Santiago';
  if (/\b(portugal)\b/i.test(text)) return 'Europe/Lisbon';
  return 'America/Sao_Paulo';
}

export function validNaraTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 100) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; }
  catch { return false; }
}

export function naraSendHours(date: Date, zone: string) {
  // A corrupted preference must not crash the worker or widen the sending window.
  if (!validNaraTimezone(zone) || !Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute >= 8 * 60 + 30 && hour * 60 + minute <= 20 * 60 + 30;
}

export type PreferredContactWindow = { timezone: string; startMinutes: number; endMinutes: number };

export function hasExplicitContactPreference(text: string) {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return /\b(chamar|chame|chama|falar|fale|fala|conversar|converse|contato|contatar|ligar|ligue|liga|mensagem|retornar|retorne|retorno)\b/.test(normalized)
    && /\b(depois|apos|partir|antes|ate|entre|as|manha|tarde|noite|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(normalized);
}

/**
 * Conservative, explicit contact preferences only. A budget/unit number is not an hour.
 * The original local clock is re-evaluated on each date so DST does not freeze a Brasilia conversion.
 */
export function preferredContactWindow(text: string, timezone = 'America/Sao_Paulo'): PreferredContactWindow | null {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (!hasExplicitContactPreference(text)) return null;
  // Negative/recurring restrictions need a richer agreement, never guess their inverse.
  if (/\bnao\b/.test(normalized) || /\b(?:so|somente|apenas)\b.{0,35}\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo|dias uteis)\b/.test(normalized)) return null;
  const time = '(\\d{1,2})(?::(\\d{2}))?\\s*(?:h(?:oras?)?)?';
  const between = normalized.match(new RegExp(`\\b(?:entre|das)\\s+${time}\\s+(?:e|as|ate)\\s+${time}\\b`));
  const after = normalized.match(new RegExp(`\\b(?:depois\\s+d(?:as?|e)|apos(?:\\s+as)?|a partir d(?:as?|e))\\s*${time}\\b`));
  const before = normalized.match(new RegExp(`\\b(?:antes d(?:as?|e)|ate(?:\\s+as)?)\\s*${time}\\b`));
  const exact = normalized.match(new RegExp(`\\b(?:as|por volta d(?:as?|e))\\s*${time}\\b`));
  const minutes = (hour?: string, minute?: string) => {
    const h = Number(hour), m = Number(minute ?? 0);
    return hour && h >= 0 && h <= 23 && m >= 0 && m <= 59 ? h * 60 + m : null;
  };
  let startMinutes: number | null = null, endMinutes: number | null = null;
  if (between) {
    startMinutes = minutes(between[1], between[2]); endMinutes = minutes(between[3], between[4]);
  } else if (after && before) {
    startMinutes = minutes(after[1], after[2]); endMinutes = minutes(before[1], before[2]);
  } else if (after) {
    startMinutes = minutes(after[1], after[2]); endMinutes = 24 * 60;
  } else if (before) {
    startMinutes = 0; endMinutes = minutes(before[1], before[2]);
  } else if (exact) {
    startMinutes = minutes(exact[1], exact[2]);
    // Five-minute cron tolerance; an approximate preference allows a thirty-minute window.
    endMinutes = startMinutes === null ? null : Math.min(24 * 60, startMinutes + (/por volta/.test(exact[0]) ? 30 : 5));
  } else if (/\b(?:pela|de|na|durante a)\s+manha\b/.test(normalized)) {
    startMinutes = 8 * 60 + 30; endMinutes = 12 * 60;
  } else if (/\b(?:pela|de|a|na|durante a)\s+tarde\b/.test(normalized)) {
    startMinutes = 12 * 60; endMinutes = 18 * 60;
  } else if (/\b(?:pela|de|a|na|durante a)\s+noite\b/.test(normalized)) {
    startMinutes = 18 * 60; endMinutes = 24 * 60;
  }
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes || !validNaraTimezone(timezone)) return null;
  return { timezone, startMinutes, endMinutes };
}

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
  const zone = city?.zone ?? naraContactZone(text);
  const preference = preferredContactWindow(text, zone);
  if (!preference) return null;
  const hour = Math.floor(preference.startMinutes / 60), minute = preference.startMinutes % 60;
  const localDate = partsInZone(now, zone);
  const instant = zonedLocalToUtc(localDate.year, localDate.month, localDate.day, hour, minute, zone);
  const br = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return {
    original: text.trim(),
    city: city?.label ?? (zone === 'America/Sao_Paulo' ? 'Horário de Brasília' : zone),
    source_timezone: zone,
    brasilia_timezone: 'America/Sao_Paulo',
    brasilia_time: br,
  };
}
