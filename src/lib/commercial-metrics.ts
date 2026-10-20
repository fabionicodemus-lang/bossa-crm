/**
 * Primitive metric rules. null means unavailable, never a measured zero.
 * Counts and monetary values must already have compatible scopes.
 */
export function divideCost(spend: number | null, count: number): number | null {
  if (spend == null || !Number.isFinite(spend) || spend < 0 ||
      !Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) return null;
  return spend / count;
}

export function relativeChange(current: number | null, reference: number | null): number | null {
  if (current == null || reference == null || !Number.isFinite(current) ||
      !Number.isFinite(reference) || reference <= 0) return null;
  return (current / reference - 1) * 100;
}

export function weightedRate(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || !Number.isFinite(numerator) ||
      !Number.isFinite(denominator) || numerator < 0 || denominator <= 0 ||
      numerator > denominator) return null;
  return numerator / denominator;
}

// Validates the calendar date before constructing a query boundary.
// Offset is determined using IANA rules, including historical daylight saving.
export function parseBrazilDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const localDay = (milliseconds: number) => {
    const parts = formatter.formatToParts(new Date(milliseconds));
    const get = (type: string) => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  // Find the first instant in the requested local calendar day, including
  // midnight gaps at daylight-saving transitions.
  let low = utc.getTime() - 86_400_000;
  let high = utc.getTime() + 86_400_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDay(middle) < value) low = middle + 1;
    else high = middle;
  }
  return localDay(low) === value ? new Date(low) : null;
}

export function milestoneReachedAtCutoff(value: string | null | undefined, cutoff: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= cutoff.getTime();
}
