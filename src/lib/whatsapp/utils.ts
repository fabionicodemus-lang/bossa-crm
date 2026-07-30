export function normalizeWaId(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function metaTimestamp(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return new Date().toISOString();
  return new Date(timestamp * 1000).toISOString();
}
