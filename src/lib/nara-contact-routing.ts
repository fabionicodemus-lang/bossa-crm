export function normalizeNaraRoutingText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutNegatedBrokerIdentity(value: string): string {
  let text = normalizeNaraRoutingText(value);
  if (/\bnao sou (?:um |uma )?corretor(?:a)?\b/.test(text)) {
    text = text.replace(/\b(corretor|corretora|imobiliaria|creci)\b/g, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function isAssistedSaleSignal(value: string): boolean {
  const text = normalizeNaraRoutingText(value);
  return /\b(?:meu|minha|o|a|um|uma)\s+(?:corretor|corretora|imobiliaria)\b.{0,50}\b(?:me indicou|me mandou|me apresentou|me encaminhou|passou meu contato|indicou voces)\b/.test(text)
    || /\b(?:vim|cheguei|fui indicado|recebi indicacao)\b.{0,40}\b(?:corretor|corretora|imobiliaria)\b/.test(text)
    || /\b(?:corretor|corretora|imobiliaria)\b.{0,40}\b(?:me indicou|me mandou|me apresentou|me encaminhou)\b/.test(text);
}

export function isExplicitBrokerSignal(value: string): boolean {
  if (isAssistedSaleSignal(value)) return false;
  const text = withoutNegatedBrokerIdentity(value);
  return /\b(?:sou|trabalho como|atuo como|falo como)\s+(?:um |uma )?corretor(?:a)?(?: de imoveis)?\b/.test(text)
    || /\b(?:sou|trabalho|atuo)\s+(?:em|numa|na)\s+(?:uma )?imobiliaria\b/.test(text)
    || /\b(?:minha|da nossa) imobiliaria\b/.test(text)
    || /\bmeu creci\b/.test(text)
    || /\bcorretor(?:a)? parceiro(?:a)?\b/.test(text);
}

export function hasStrongBrokerVocabulary(value: string): boolean {
  if (isAssistedSaleSignal(value)) return false;
  const text = withoutNegatedBrokerIdentity(value);
  return /\b(?:espelho(?: de vendas)?|comissionamento|comissao|vgv|pool de vendas|tabela de comissao|parceria com imobiliaria|parceria imobiliaria|meu cliente|tenho (?:um )?cliente|cliente interessado)\b/.test(text)
    || /\bcreci\s*[-:]?\s*\d+/i.test(text);
}

export function isBrokerRoutingSignal(value: string): boolean {
  return isExplicitBrokerSignal(value) || hasStrongBrokerVocabulary(value);
}

export function isCurrentCustomerSignal(value: string): boolean {
  const text = normalizeNaraRoutingText(value);
  if (/\bnao sou (?:um |uma )?cliente\b/.test(text)) return false;
  return /\b(?:ja comprei|sou cliente|comprei com voces|segunda via|boleto|meu contrato|minha unidade|meu apartamento|assistencia tecnica|pos-venda)\b/.test(text);
}
