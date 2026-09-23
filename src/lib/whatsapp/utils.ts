export function normalizeWaId(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  // Telefones brasileiros locais chegam com 10/11 dígitos. IDs internacionais
  // já vêm no formato E.164 sem "+" e não podem receber o DDI 55 artificialmente.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function metaTimestamp(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return new Date().toISOString();

  // A Meta usa segundos em mensagens e milissegundos em partes do
  // smb_app_state_sync. Aceitamos ambos (e microssegundos defensivamente).
  const absolute = Math.abs(timestamp);
  const milliseconds = absolute < 100_000_000_000
    ? timestamp * 1000
    : absolute > 100_000_000_000_000
      ? timestamp / 1000
      : timestamp;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
