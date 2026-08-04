const MONEY_PATTERN = /R\$\s*\d[\d.\s]*(?:,\d{1,2})?|\b\d+(?:[.,]\d+)?\s*(?:milh(?:ao|ão|oes|ões)|mil)\b/giu;

function normalizePriceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSpecificUnitReference(value: string): boolean {
  return /\b(?:unidade|apto|apartamento)\s*(?:n(?:umero)?\s*)?\d{2,4}\b/.test(value)
    || /\b\d{1,2}\s*(?:o|º)?\s*andar\b/.test(value);
}

export function asksProtectedCommercialDetail(text: string): boolean {
  const value = normalizePriceText(text);
  if (!value) return false;
  return hasSpecificUnitReference(value)
    || /\b(tabela|disponibilidade|disponivel|reservar|reserva)\b/.test(value)
    || /\b(entrada|parcela|parcelamento|reforco|chaves|sinal|ato|mensais?|plano de pagamento|condicao de pagamento)\b/.test(value)
    || /\b\d+\s*x\b/.test(value);
}

export function isGeneralPriceRangeReply(reply: string): boolean {
  const value = normalizePriceText(reply);
  const money = reply.match(MONEY_PATTERN) ?? [];
  if (!value || !money.length) return false;

  const hasStartingPrice = /\b(a partir de|partem de|comecam em|comeca em|valores? desde)\b/.test(value);
  const hasNamedRange = /\bfaixa(?: de)?\b/.test(value);
  const hasBetweenRange = /\bentre\s+(?:r\$|\d)/.test(value) && money.length >= 2;
  const hasFromToRange = /\bde\s+(?:r\$|\d).+\ba\s+(?:r\$|\d)/.test(value) && money.length >= 2;
  if (!hasStartingPrice && !hasNamedRange && !hasBetweenRange && !hasFromToRange) return false;

  return !asksProtectedCommercialDetail(reply);
}
