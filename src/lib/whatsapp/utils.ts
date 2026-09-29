export function normalizeWaId(value: string) {
  // wa_id e telefones já salvos podem ser internacionais. O tamanho não revela
  // sua origem: 1 + 10 dígitos é um número comum dos EUA.
  return value.replace(/\D/g, '');
}

/** Somente para números digitados sem DDI no CRM, nunca para IDs da Meta. */
export function normalizeManualPhone(value: string): string {
  const digits = normalizeWaId(value);
  const hasInternationalPrefix = value.trim().startsWith('+');
  if (hasInternationalPrefix || digits.startsWith('55')) return digits;
  // DDD brasileiro precisa existir; comprimento sozinho não identifica país.
  const validDdd = /^(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/.test(digits.slice(0, 2));
  const validLocal = (digits.length === 10 && /^[2-9]\d{7}$/.test(digits.slice(2)))
    || (digits.length === 11 && /^9\d{8}$/.test(digits.slice(2)));
  return validDdd && validLocal ? `55${digits}` : digits;
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

/**
 * Variações do mesmo celular brasileiro com e sem o nono dígito.
 *
 * O WhatsApp identifica muitos celulares brasileiros (principalmente DDDs fora de
 * SP/RJ, como 47) SEM o nono dígito: o contato digita (47) 99933-3634 no
 * formulário, mas as mensagens dele chegam com wa_id 554799333634. Buscar o lead
 * só pelo número exato cria um lead duplicado para a mesma pessoa. Toda busca de
 * lead por telefone deve usar `.in('phone', phoneMatchVariants(numero))`.
 */
export function phoneMatchVariants(value: string | null | undefined): string[] {
  const raw = String(value ?? '').replace(/\D/g, '');
  const digits = normalizeWaId(raw);
  if (!digits) return [];
  // Inclui também os dígitos crus: números estrangeiros (ex.: EUA, 1 + 10 dígitos)
  // não podem depender da suposição de que 11 dígitos são um celular brasileiro.
  const variants = new Set<string>([raw, digits].filter(Boolean));
  // Compatibilidade para números brasileiros locais digitados no cadastro.
  // A variante nunca substitui o ID original vindo da Meta.
  if (digits.length === 10 || digits.length === 11) variants.add(normalizeManualPhone(digits));
  if (digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    // Com nono dígito: 55 + DDD + 9 + 8 dígitos → também procura sem o 9.
    if (local.length === 9 && local.startsWith('9')) variants.add(`55${ddd}${local.slice(1)}`);
    // Sem nono dígito: 55 + DDD + 8 dígitos de celular (6–9) → também procura com o 9.
    if (local.length === 8 && /^[6-9]/.test(local)) variants.add(`55${ddd}9${local}`);
  }
  return [...variants];
}

/**
 * wa_id enviado pela própria Meta (remetente de mensagens, destinatário de ecos).
 * A Meta sempre manda o número completo com o código do país, então aqui não se
 * aplica a regra de "11 dígitos = celular brasileiro sem 55": um número dos EUA
 * (1 + 10 dígitos) viraria 55 + 1 + ... e a Nara responderia para o número errado.
 */
export function metaWaId(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}
