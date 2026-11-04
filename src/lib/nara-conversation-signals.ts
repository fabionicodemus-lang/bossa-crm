/**
 * Sinais de conversa usados para deixar a Nara mais humana (rodada 3 de testes, 04/11/2026):
 * - qual empreendimento está em discussão agora (o último citado, não o do anúncio);
 * - quando o cliente está só pesquisando ou recusou responder algo;
 * - quando ele recusou encaminhamento/contato, mesmo usando palavras como "proposta".
 */
type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type Enterprise = 'soul' | 'flow' | 'alma';
export type QualificationTopic = 'suites' | 'finalidade' | 'prazo' | 'faixa' | 'decisor' | 'cidade';

export function normalizeSignalText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

function enterprisesIn(text: string): { name: Enterprise; index: number }[] {
  const value = normalizeSignalText(text);
  return (['soul', 'flow', 'alma'] as const).flatMap((name) => {
    const index = value.search(new RegExp(`\\b${name}\\b`));
    return index >= 0 ? [{ name, index }] : [];
  });
}

/**
 * Empreendimento em discussão: o citado mais recentemente. Mensagem do cliente com mais de um
 * nome usa o último citado; mensagem da Nara com mais de um nome é ambígua e é ignorada.
 */
export function enterpriseInFocus(history: ChatMessage[]): Enterprise | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const found = enterprisesIn(history[i].content);
    if (!found.length) continue;
    if (found.length === 1) return found[0].name;
    if (history[i].role === 'user') return [...found].sort((a, b) => b.index - a.index)[0].name;
  }
  return null;
}

const RELUCTANCE = /\b(so (?:pra|para) (?:olhar|ver|conhecer|ter uma ideia)|so (?:estou |to |tô )?pesquisando|so pesquisando|so (?:estou |to )?olhando|so isso|so queria|so quero (?:saber|entender|conhecer|ver)|nao quero responder|prefiro nao (?:responder|dizer|falar)|ainda nao sei|nao sei ainda|nao sei (?:as |quantas |o |a )?\w*|nao decidi|nao escolhi|sem cadastro|sem compromisso|sem decidir|nao vou decidir|volto depois|eu volto|te chamo depois|chamo depois|vou deixar pra depois|deixar pra depois|deixa pra la|por enquanto (?:nao|e so|so)|por agora e so|depois eu vejo|vou pensar|solo (?:estoy )?mirando|solo averiguando|todavia no se|no se todavia|no quiero responder|just looking|not sure yet)\b/;

/** O cliente mostrou que não quer ser qualificado agora. */
export function isReluctant(text: string): boolean {
  return RELUCTANCE.test(normalizeSignalText(text));
}

/** Pausa a qualificação quando uma das duas últimas falas do cliente mostra relutância. */
export function qualificationPaused(history: ChatMessage[]): boolean {
  return history.filter((item) => item.role === 'user').slice(-2).some((item) => isReluctant(item.content));
}

/** Assunto de uma pergunta de qualificação, se houver. */
export function questionTopic(text: string): QualificationTopic | null {
  const value = normalizeSignalText(text);
  if (/\b(suites?|quartos?|dormitorios?|habitaciones?|tipologia|3 ou 4|tres ou quatro)\b/.test(value)) return 'suites';
  if (/\b(morar|investir|investimento|ferias|aproveitar|veranear|temporada|usar com a familia|curtir|vivir|invertir|alquilar|alugar)\b/.test(value)) return 'finalidade';
  if (/\b(prazo|em quanto tempo|quando (?:voce )?pretende|plazo)\b/.test(value)) return 'prazo';
  if (/\b(faixa|orcamento|quanto (?:voce )?pretende investir|rango)\b/.test(value)) return 'faixa';
  if (/\b(decisao|decide|decidir com)\b/.test(value)) return 'decisor';
  if (/\b(cidade|onde voce mora|de onde)\b/.test(value)) return 'cidade';
  return null;
}

function finalQuestion(text: string): string {
  const sentences = text.trim().match(/[^.!?]+[.!?]*/g) ?? [];
  const last = sentences.at(-1)?.trim() ?? '';
  return last.endsWith('?') ? last : '';
}

/** Assuntos que o cliente já recusou ou disse não saber, para não perguntar de novo. */
export function declinedTopics(history: ChatMessage[]): Set<QualificationTopic> {
  const declined = new Set<QualificationTopic>();
  history.forEach((message, index) => {
    if (message.role === 'user') {
      const value = normalizeSignalText(message.content);
      const explicit = value.match(/\bnao sei (?:as |quantas |o |a )?(\w+)/)?.[1] ?? '';
      const topic = questionTopic(explicit);
      if (topic) declined.add(topic);
      return;
    }
    const question = finalQuestion(message.content);
    const topic = question ? questionTopic(question) : null;
    const answer = history.slice(index + 1).find((item) => item.role === 'user');
    if (topic && answer && isReluctant(answer.content)) declined.add(topic);
  });
  return declined;
}

/**
 * Remove a pergunta final de qualificação quando o cliente pausou a qualificação ou já recusou
 * aquele assunto. Perguntas de oferta ("Quer ver a planta?") continuam.
 */
export function withoutUnwantedQualification(reply: string, history: ChatMessage[]): string {
  const question = finalQuestion(reply);
  if (!question) return reply;
  const topic = questionTopic(question);
  if (!topic) return reply;
  if (!qualificationPaused(history) && !declinedTopics(history).has(topic)) return reply;
  const stripped = reply.trim().slice(0, reply.trim().length - question.length).trim().replace(/[,:;—-]\s*$/, '.');
  return stripped || reply;
}

export function withoutNegatedRequests(value: string): string {
  return value.replace(/\b(?:nao|nem|sem|no)\s+(?:\w+\s+){0,3}?(?:proposta|reserva|reservar|vendedor|corretor|consultor|comercial|ligacao|ligar|contato|encaminh\w*|videochamada|ninguem)\b/g, ' ');
}

/** O cliente recusou encaminhamento ou contato do comercial nesta mensagem. */
export function refusesHandoff(text: string): boolean {
  const value = normalizeSignalText(text);
  return /\b(nao (?:me )?encaminh\w*|sem encaminh\w*|nao precisa (?:me )?(?:chamar|ligar|encaminhar|passar|pedir|mandar pra ninguem)|nao precisa pedir|sem contato|sem (?:o )?comercial|sem corretor|sem vendedor|sem consultor|nao quero (?:falar com )?(?:consultor|corretor|vendedor|ninguem|contato)|nao pedi (?:vendedor|corretor|reserva|proposta|consultor)|pode deixar|deixa pra la|volto depois|eu volto|te chamo depois|vou deixar pra depois|nao (?:precisa|quero) que me (?:chamem|liguem)|nao me (?:chama|chame|liga|ligue)|no me deriv\w*|sin contacto|sin vendedor)\b/.test(value);
}

/** Pedido explícito de pessoa/consultor, ignorando frases negadas ("não pedi vendedor"). */
export function explicitHumanRequest(text: string): boolean {
  const value = withoutNegatedRequests(normalizeSignalText(text));
  return /\b(quero (?:falar com )?(?:alguem|uma pessoa|um corretor|um consultor|um atendente|o comercial|um humano)|quero alguem|falar com (?:alguem|uma pessoa|um corretor|corretor|atendente|consultor|o comercial)|atendimento humano|me liga|pode me ligar|alguem (?:que )?(?:me )?(?:confirme|responda|chame)|pode (?:passar|encaminhar) (?:pro|para o) comercial|pode verificar|quiero hablar con|atencion humana)\b/.test(value);
}

/** Intenção real de compra nesta mensagem (não apenas pedido de informação). */
export function purchaseIntent(text: string): boolean {
  const value = withoutNegatedRequests(normalizeSignalText(text));
  return /\b(quero (?:reservar|comprar|fechar|fazer (?:uma )?proposta)|vou (?:reservar|comprar|fechar)|reservar a unidade|fazer (?:uma )?proposta|quero visitar|agendar (?:uma )?visita|quiero (?:reservar|comprar)|hacer una propuesta)\b/.test(value);
}

/** O texto da Nara pede permissão para responder ("Posso verificar...?"). */
export function asksPermissionToAnswer(reply: string): boolean {
  return /^\s*(?:posso|quer que eu|deseja que eu|puedo|quieres que)\s+(?:verificar|consultar|checar|confirmar|ver|buscar|averiguar)\b/i.test(normalizeSignalText(reply));
}

/** Palavras que nunca são nome próprio quando aparecem depois de "sou"/"aqui é". */
export const NOT_A_NAME = new Set([
  'robo', 'robot', 'bot', 'ia', 'pessoa', 'humano', 'humana', 'gente', 'de', 'da', 'do', 'das', 'dos', 'um', 'uma', 'o', 'a',
  'cliente', 'corretor', 'corretora', 'interessado', 'interessada', 'brasileiro', 'brasileira', 'investidor', 'investidora',
  'novo', 'nova', 'eu', 'so', 'ja', 'muito', 'mais', 'bem', 'casado', 'casada', 'aposentado', 'aposentada', 'medico', 'medica',
  'engenheiro', 'engenheira', 'advogado', 'advogada', 'empresario', 'empresaria', 'mae', 'pai', 'filho', 'filha', 'aqui', 'que',
  'quem', 'isso', 'esse', 'essa', 'com', 'para', 'pra', 'por', 'sim', 'nao', 'ai', 'la', 'agora', 'el', 'la', 'un', 'una',
  'persona', 'the', 'an', 'interested', 'looking', 'from', 'not', 'just', 'here', 'real', 'verdade', 'mesmo', 'mesma',
]);

export function isPlausibleFirstName(word: string): boolean {
  const value = normalizeSignalText(word);
  return value.length >= 2 && !NOT_A_NAME.has(value) && !/\d/.test(value);
}

/**
 * Primeiro nome declarado pelo contato ("me chamo Ana", "sou o João", "Oi, aqui é a Carla").
 * "Aqui é" só vale no começo da frase, para não ler "isso aqui é robô?" como nome.
 */
export function declaredFirstName(text: string): string {
  const patterns = [
    /\b(?:me chamo|meu nome (?:é|e)|me llamo|mi nombre (?:es|e)|my name is)\s+(?:a\s+|o\s+)?([\p{L}'’-]{2,})/giu,
    /(?:^|[.!?,]\s*|\b(?:oi|olá|ola|bom dia|boa tarde|boa noite|hola|hi|hello)[,!]?\s+)(?:aqui (?:é|e)|soy|i'm|i am)\s+(?:a\s+|o\s+)?([\p{L}'’-]{2,})/giu,
    /\bsou\s+(?:a\s+|o\s+)([\p{L}'’-]{2,})/giu,
    /(?:^|[.!?,]\s*|\b(?:oi|olá|ola|bom dia|boa tarde|boa noite)[,!]?\s+)sou\s+([\p{L}'’-]{2,})(?=\s*(?:[,.!]|$|e\s|,?\s*(?:vi|tenho|quero|moro|estou|tô|to)\b))/giu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1]?.trim() ?? '';
      const after = text.slice((match.index ?? 0) + match[0].length);
      if (/^\s+ou\b/i.test(after)) continue;
      if (isPlausibleFirstName(candidate)) return candidate;
    }
  }
  return '';
}
