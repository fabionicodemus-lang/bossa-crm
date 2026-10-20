/**
 * Camada linguística única da Nara. Não revela identidade de usuários ou dados do CRM.
 * Evita divergência entre o motor principal, a triagem e o pós-processamento.
 */
export type NaraLanguage = 'pt' | 'es' | 'en';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

function norm(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function requestedNaraLanguage(text: string): NaraLanguage | null {
  const value = norm(text);
  const wantsLanguage = /\b(habl(?:ar|amos|as|a)|hablar|conversar|responder|contestar|escribir|falar|falamos|responda|responder|escreva|speak|speaking|reply|write|switch|prefiero|preferiria|preferimos|prefer|idioma|language)\b/.test(value);
  if (!wantsLanguage) return null;
  if (/\b(espanol|castellano|spanish)\b/.test(value)) return 'es';
  if (/\b(portugues|portuguese)\b/.test(value)) return 'pt';
  if (/\b(ingles|english)\b/.test(value)) return 'en';
  return null;
}

export function naraConversationLanguage(history: ChatMessage[]): NaraLanguage {
  const userMessages = history.filter(item => item.role === 'user').map(item => item.content);
  const latest = userMessages.at(-1) || '';
  const explicit = requestedNaraLanguage(latest);
  if (explicit) return explicit;
  const latestNorm = norm(latest);
  const spanish = /\b(hola|soy|me llamo|mi nombre|hablar|puedes|podes|quiero|quisiera|cuanto|cuesta|ustedes|espanol|departamento|gracias|necesito|busco|invertir|vivir|chile)\b/g;
  const portuguese = /\b(ola|oi|me chamo|meu nome|voce|voces|quero|quanto|custa|preco|valor|obrigad[oa]|preciso|procuro|morar|investir|falar|portugues)\b/g;
  const english = /\b(hello|hi|i am|i'm|please|how much|price|looking|apartment|english|can you|thank you)\b/g;
  const hits = (value: string, re: RegExp) => (value.match(re) || []).length;
  const scores = [
    { language: 'es' as const, count: hits(latestNorm, spanish) },
    { language: 'pt' as const, count: hits(latestNorm, portuguese) },
    { language: 'en' as const, count: hits(latestNorm, english) },
  ].sort((a,b) => b.count-a.count);
  if (scores[0].count > 0 && scores[0].count > scores[1].count) return scores[0].language;
  // "ok"/"sim" não deve inverter o idioma que o cliente escolheu anteriormente.
  for (let i = userMessages.length - 2; i >= 0; i--) {
    const older = userMessages[i];
    const choice = requestedNaraLanguage(older);
    if (choice) return choice;
    const value = norm(older);
    if (hits(value, spanish) >= 1 && hits(value, spanish) > hits(value, portuguese)) return 'es';
    if (hits(value, english) >= 1 && hits(value, english) > hits(value, portuguese)) return 'en';
    if (hits(value, portuguese) >= 1) return 'pt';
  }
  return 'pt';
}

const introductionPattern = /^\s*[¡!]?\s*(?:hola|oi|olá|ola|hi|hello)\b[\s\S]{0,105}?\bbossa\b[.!]?\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)*/iu;

function comparableIntroduction(text: string): string {
  return norm(text).replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** Remove aberturas idênticas colocadas em cadeia por múltiplos guardrails. */
export function collapseRepeatedNaraIntroductions(reply: string): string {
  let value = reply.trim();
  for (let i = 0; i < 6; i++) {
    const first = value.match(introductionPattern)?.[0] || '';
    if (!first) break;
    const remaining = value.slice(first.length).trimStart();
    const duplicate = remaining.match(introductionPattern)?.[0] || '';
    if (!duplicate || comparableIntroduction(first) !== comparableIntroduction(duplicate)) break;
    value = (first.trimEnd() + ' ' + remaining.slice(duplicate.length).trimStart()).trim();
  }
  return value;
}

export function removeRepeatedNaraIntroduction(reply: string): string {
  const collapsed = collapseRepeatedNaraIntroductions(reply);
  const start = collapsed.match(introductionPattern)?.[0] || '';
  return start ? collapsed.slice(start.length).trim() : collapsed;
}

export function hasNaraIntroduction(reply: string): boolean {
  const start = reply.match(introductionPattern)?.[0] || '';
  return /\bnara\b/i.test(start) && /\bbossa\b/i.test(start);
}

export function naraLanguageSwitchReply(language: NaraLanguage): string {
  if (language === 'es') return '¡Claro! Podemos conversar en español. Te puedo contar sobre los proyectos de Bossa, sus características y materiales. ¿Qué te gustaría conocer primero?';
  if (language === 'en') return 'Of course! We can speak English. I can tell you about Bossa’s developments, features and available materials. What would you like to know first?';
  return 'Claro! Podemos conversar em português. Posso te contar sobre os empreendimentos, os diferenciais e os materiais da Bossa. O que você gostaria de conhecer primeiro?';
}
