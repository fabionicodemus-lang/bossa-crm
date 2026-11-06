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
  // Stop at contrast clauses so a later "mas agora quero falar com alguém"
  // remains an affirmative request, even after an earlier refusal.
  return value.replace(/\b(?:nao|nem|sem|no)\s+(?:(?!(?:mas|porem|pero|but|however)\b)\w+\s+){0,4}?(?:proposta|reserva|reservar|vendedor|corretor|consultor|comercial|ligacao|ligar|contato|encaminh\w*|videochamada|ninguem|alguem|atendimento humano|(?:(?:um|uma)\s+)?(?:pessoa|humano|humana|atendente))\b/g, ' ');
}

/** O cliente recusou encaminhamento ou contato do comercial nesta mensagem. */
export function refusesHandoff(text: string): boolean {
  const value = normalizeSignalText(text);
  return /\b(nao (?:me )?encaminh\w*|sem encaminh\w*|nao precisa (?:me )?(?:chamar|ligar|encaminhar|passar|transferir|pedir|mandar pra ninguem)|nao precisa pedir|sem contato|sem (?:o )?comercial|sem corretor|sem vendedor|sem consultor|nao quero (?:falar com )?(?:consultor|corretor|vendedor|ninguem|contato)|nao pedi (?:vendedor|corretor|reserva|proposta|consultor)|pode deixar|deixa pra la|volto depois|eu volto|te chamo depois|vou deixar pra depois|nao (?:precisa|quero) que me (?:chamem|liguem|transfiram|passem)|nao me (?:chama|chame|liga|ligue|transfira|transfiram|transfere|transferir)|no me deriv\w*|sin contacto|sin vendedor)\b/.test(value)
    // "Não me passe para alguém" é recusa; "não me passe preço errado" não.
    || /\bnao me (?:passa|passe|passem|passar)\b(?=\s+(?:para|pra|pro|ao|aos|adiante|agora|ninguem|nenhum)\b|\s*(?:[.!?,;]|$))/.test(value)
    || /\bnao (?:passe|passa|compartilhe|compartilha)\s+(?:o\s+)?meu\s+(?:contato|numero|telefone)\b/.test(value)
    || /\bnao (?:quero|preciso|gostaria de)\s+ser\s+(?:transferid[oa]|encaminhad[oa]|contatad[oa])\b/.test(value)
    || /\b(?:nao (?:quero|preciso)(?: de)?|sem)\s+(?:(?:agora|hoje|ainda)\s+)?(?:(?:falar(?: (?:agora|hoje|ainda))? com|receber|ter|ser atendid[oa] por)\s+)?(?:(?:um|uma|o|a)\s+)?(?:pessoa|humano|humana|atendimento humano|alguem|atendente)\b/.test(value)
    || /\bno me (?:transfiera|transfieras|transfieran|contacte|contactes|contacten|llame|llames|llamen)\b/.test(value)
    || /\bno me (?:pase|pases|pasen)\b(?=\s+(?:a|al|con|para|ahora|todavia|nadie|ningun)\b|\s*(?:[.!?,;]|$))/.test(value)
    || /\b(?:do not|don['’]?t|never)\s+(?:transfer|forward|connect|refer|redirect|contact|call|phone)(?:\s+(?:or|and)\s+(?:contact|call|phone))?\s+me\b/.test(value)
    || /\b(?:do not|don['’]?t)\s+want\s+to\s+be\s+(?:transferred|forwarded|connected|contacted|called)\b/.test(value);
}

/** Pedido explícito de pessoa/consultor, ignorando frases negadas ("não pedi vendedor"). */
export function explicitHumanRequest(text: string): boolean {
  const value = withoutNegatedRequests(normalizeSignalText(text));
  return /\b(quero (?:falar com )?(?:alguem|uma pessoa|um corretor|um consultor|um atendente|o comercial|um humano)|quero alguem|falar com (?:alguem|uma pessoa|um corretor|corretor|atendente|consultor|o comercial)|atendimento humano|me liga|pode me ligar|alguem (?:que )?(?:me )?(?:confirme|responda|chame)|pode (?:passar|encaminhar) (?:pro|para o) comercial|pode verificar|quiero hablar con|atencion humana)\b/.test(value);
}

/** Intenção real de compra nesta mensagem (não apenas pedido de informação). */
export function purchaseIntent(text: string): boolean {
  const value = withoutNegatedRequests(normalizeSignalText(text))
    // "Não sei se quero comprar" is uncertainty, not a closing instruction.
    // Remove only the negated clause so a later explicit "quero reservar" still counts.
    .replace(/\b(?:ainda )?(?:nao sei se|nao tenho certeza se|nao decidi se|estou em duvida se)\s+(?:eu\s+)?(?:quero|vou|pretendo)\s+(?:comprar|fechar|reservar)\b/g, ' ')
    .replace(/\b(?:nao|nem)\s+(?:quero|vou|pretendo)\s+(?:comprar|fechar|reservar)\b/g, ' ');
  // Visita não entra aqui: a Nara agenda pela agenda conectada, sem transferir.
  return /\b(quero (?:reservar|comprar|fechar|fazer (?:uma )?proposta)|vou (?:reservar|comprar|fechar)|reservar a unidade|fazer (?:uma )?proposta|quiero (?:reservar|comprar)|hacer una propuesta)\b/.test(value);
}

/**
 * Exclui recusas de discutir condições, não condições negativas de uma negociação.
 * "Não quero proposta" é recusa; "não tenho entrada" e "sem juros" ainda precisam
 * de análise comercial. Uma recusa a falar com o comercial é tratada pelo chamador.
 */
function withoutNegatedFinancialDiscussion(value: string): string {
  return value
    .replace(/\b(?:nao|nem|no)\s+(?:quero|queremos|pretendo|pretendemos|vou|vamos|pedi|pedimos|preciso|precisamos|desejo|quiero|necesito)\s+(?:(?:fazer|montar|enviar|receber|pedir|solicitar|hacer|recibir)\s+)?(?:(?:uma?|una?|la|a|o|el|nenhuma?)\s+)?(?:propostas?|contrapropostas?|propuestas?|ofertas?|descontos?|negociacao|negociar)\b/g, ' ')
    .replace(/\b(?:nao|nem|no)\s+(?:quero|queremos|pretendo|vou|pedi|preciso|desejo|quiero|necesito)\s+(?:falar|conversar|discutir|tratar|saber|pensar|hablar)\s+(?:(?:sobre|a respeito de|de|da|do|das|dos|em|na|no|nas|nos|del|la|el|as|os|a|o)\s+){0,3}(?:formas? de pagamento|condicao de pagamento|condicoes de pagamento|entrada|sinal|parcelas?|parcelamento|pagamento|prestacoes?|reforcos?|saldo|financiamento|condicao|condicoes|propostas?|descontos?|cuotas?|anticipo|pago|condiciones)\b/g, ' ')
    .replace(/\b(?:nao|no)\s+(?:estou|estamos|to|estoy)\s+(?:pensando|interessad[oa]s?|interesad[oa]s?)\s+(?:(?:em|numa|na|en|una|la)\s+){1,2}(?:proposta|negociar|negociacao|propuesta|oferta)\b/g, ' ')
    .replace(/\b(?:sem|sin)\s+(?:(?:uma|nenhuma|una)\s+)?(?:proposta|contraproposta|propuesta|oferta)\b/g, ' ')
    .replace(/\b(?:nao|nem|no)\s+(?:a|o|as|os|uma|um)\s+(?:valor (?:da|de|das)\s+)?(?:entrada|parcelas?|sinal|proposta|prestacao|prestacoes)\b/g, ' ')
    .replace(/\bnem\s+(?:propostas?|contrapropostas?|descontos?|negociacao|parcelas?|entrada)\b/g, ' ')
    .replace(/\b(?:proposta|negociacao|propuesta|oferta)\s+(?:nao|no)\b/g, ' ')
    .replace(/\b(?:do not|don't|dont|not)\s+(?:want|need|plan|intend|wish)\s+(?:(?:to|a|an|any|make|receive|discuss|talk|about|the)\s+){0,5}(?:offer|proposal|negotiation|discount|down payment|instalments?|installments?|payment terms)\b/g, ' ')
    .replace(/\b(?:without|no)\s+(?:(?:an?|any)\s+)?(?:offer|proposal|negotiation)\b/g, ' ');
}

/**
 * Removes only clearly physical uses of "entrada" from normalized text. Shared
 * by intent detection and the last commercial guard so one layer cannot turn a
 * floor-plan answer back into a payment answer after another layer understood it.
 * A financial term or amount beside the access description is never removed.
 */
export function withoutPhysicalEntranceTerms(value: string): string {
  return value
    .replace(/\b(?:qual|que)\s+(?:(?:e|seria|a)\s+){0,3}entrada\b(?=[^.!?;]{0,60}\b(?:usar|utilizar|entrar|entro|entramos|acessar)\b)/g, ' acesso fisico ')
    .replace(/\bentrada\b(?=[^.!?;]{0,35}\b(?:da (?:para|acesso)|abre (?:para|na|no)|fica (?:na|no|pela|pelo)|e (?:pela|pelo)|por onde|por qual)\b)/g, ' acesso fisico ')
    .replace(/\bentrada\b(?=[^.!?;]{0,45}\b(?:leva|conduz|conecta|liga|desemboca|chega)\s+(?:(?:direto|diretamente|primeiro)\s+)?(?:(?:para|pra)\s+)?(?:(?:a|ao|no|na|num|numa|em|o|um|uma)\s+){0,2}(?:sala|living|corredor|hall|cozinha|lavanderia|garagem|lobby|elevador|escada|rua)\b)/g, ' acesso fisico ')
    .replace(/\b(?:hall|porta|portao|rampa|largura|altura|foto|imagem|cobertura)\s+(?:de|da|para a)\s+entrada\b/g, ' acesso fisico ')
    .replace(/\bentrada\s+(?:principal|social|lateral|privativa|independente|de servico|de pedestres|de veiculos)\b/g, ' acesso fisico ')
    .replace(/\bentrada\s+(?:(?:e|esta|sera|tem|possui|vai ter)\s+)?(?:acessivel|coberta|envidracada|rampa|escada|portao|porta|elevador)\b/g, ' acesso fisico ');
}

/** Acesso físico, reforço estrutural e conceito do projeto não são condições comerciais. */
function withoutNonFinancialTerms(value: string): string {
  return withoutPhysicalEntranceTerms(value)
    .replace(/\bentrada\s+(?:do|da|dos|das|de|para|para a|para o|al|del|de la)\s+(?:predio|edificio|empreendimento|torre|garagem|apartamento|apartamentos|apto|aptos|unidade|unidades|casa|casas|imovel|imoveis|planta|plantas|obra|hall|lobby|piscina|academia|salao|rua|cozinha)\b/g, ' acesso fisico ')
    .replace(/\b(?:reforco|reforcos)\s+(?:estrutural|estruturais|do pilar|da viga|das vigas|dos pilares|da estrutura|na estrutura|na fundacao)\b/g, ' estrutura ')
    .replace(/\bproposta\s+(?:arquitetonica|do projeto|de arquitetura|de design|de lazer|paisagistica)\b/g, ' conceito do projeto ')
    .replace(/\bproposta\b(?=[^.!?;]{0,65}\b(?:arquitetura|design|paisagismo|lazer|sustentabilidade|areas? comuns?|conceito)\b)/g, 'conceito')
    .replace(/\bsinal\s+(?:de celular|de internet|de wifi|de wi-fi|de telefone|de tv|de transito|5g|4g|wifi|wi-fi)\b/g, ' conectividade ')
    .replace(/\b(?:por mes|ao mes|mensal|mensais)\b(?=[^.!?;]{0,25}\b(?:condominio|iptu)\b)/g, 'periodico')
    .replace(/\b(?:condominio|iptu)\b([^.!?;]{0,25})\b(?:por mes|ao mes|mensal|mensais)\b/g, 'custo fixo $1 periodico');
}

function hasDirectFinancialTerms(value: string): boolean {
  const affirmative = withoutNegatedFinancialDiscussion(value);
  // "Qual a entrada do apartamento?" asks about payment unless the same
  // question describes physical access. A room in an earlier question must
  // never hide a separate payment question in a mixed message.
  const entryQuestion = affirmative.split(/[.!?;\n]+|\b(?:e|mas|porem)\s+(?=(?:qual|quanto|como)\b)|,\s*(?=(?:e\s+)?(?:qual|quanto|como)\b)/).some((clause) =>
    /\bqual\s+(?:(?:e|seria|a|o|uma|um)\s+){0,3}entrada\s+(?:(?:do|da|de|desse|dessa|deste|desta|para o|para a)\s+)?(?:apartamentos?|aptos?|unidades?|casas?|imovel|imoveis|plantas?)\b/.test(withoutPhysicalEntranceTerms(clause))
    && !/\b(?:por onde|por qual|da para|da acesso|abre|abrir|pela|pelo|fica|localizada|localizado|acesso|porta|portao|corredor|hall|rua|rampa|escada|elevador|usar|utilizar|entrar|entro|entramos|acessar|principal|social|lateral|de servico|de pedestres|de veiculos|largura|altura|acessivel|coberta|iluminad[oa]|ventilad[oa])\b|\b(?:sala|cozinha|lavanderia)\s+ou\b/.test(clause),
  );
  if (entryQuestion) return true;
  // "Valor da entrada do apartamento" é financeiro, mesmo que "entrada do
  // apartamento" isolada também possa significar o acesso físico.
  if (/\b(?:valor|quanto|percentual|porcentagem|dar|dou|pagar|pago)\s+(?:(?:e|seria|da|de|a|o|uma|um|preciso|precisaria|devo|vou)\s+){0,5}entrada\b/.test(affirmative)
    || /\b\d[\d.,]*(?:\s*(?:mil|k|milhao|milhoes|%))?\s+(?:de|para|para a|na)\s+entrada\b/.test(affirmative)
    || /\bentrada\b[^.!?;]{0,35}(?:r\$\s*\d|\b\d[\d.,]*\s*(?:mil|k|milhao|milhoes|%))/.test(affirmative)) return true;
  const text = withoutNonFinancialTerms(affirmative);
  if (/\b(?:entrada|parcelas?|parcelar|parcelamento|parcelad[oa]s?|prestacao|prestacoes|reforcos?|balao|baloes|financiamento|financiar|financiad[oa]s?|descontos?|negociacao|negociar|negociavel|contrapropostas?|propostas?|permuta|juros|cub|ipca|reajuste|cuotas?|anticipo|enganche|financiacion|financiamiento|descuento|propuesta|down payment|deposit|instalments?|installments?|mortgage|financing|discount|counteroffer|negotiate|payment plan|payment terms)\b/.test(text)) return true;
  if (/\b(?:al contado|in cash|cash price|sem correcao|sin correccion|without interest|interest[- ]free)\b/.test(text)) return true;
  // Acentos são removidos na normalização: não confundir pagar "à vista" com
  // admirar "a vista do mar". Só aciona com uma formulação de pagamento.
  if (/^(?:e\s+)?a vista\s*[?!.]*$/.test(text)
    || /\b(?:pagar|pagando|pagamento|pago|pagaria|preco|valor|desconto|oferta|proposta|comprar|compra|dinheiro)\b[^.!?;]{0,35}\ba vista\b/.test(text)
    || /\ba vista\s+(?:(?:tem|e|seria|fica|sai|um|o|mais|menos|melhor|diferente|qual|quanto)\s+){0,5}(?:valor|preco|desconto|barat[oa]|condicao|pagamento|dinheiro|total)\b/.test(text)
    || /\b\d[\d.,]*(?:\s*(?:mil|k|milhao|milhoes))?\s+a vista\b|\ba vista\s+(?:r\$\s*)?\d/.test(text)) return true;
  if (/\b(?:formas?|condicao|condicoes|condicion|condiciones|planos?|planes?|plan|fluxo|termos|prazo)\s+(?:(?:de|do|para o)\s+)?(?:pagamento|pago)\b/.test(text)) return true;
  if (/\b(?:parte\s+(?:do|de|del)\s+(?:pagamento|pago)|pagamento combinado|part(?:ial)? payment|part of (?:the )?payment|trade[- ]in)\b/.test(text)
    || /\b(?:aceitam?|aceitaria(?:m)?|aceitar|aceptan?|aceptarian?)\b[^.!?;]{0,45}\b(?:apartamento|apto|imovel|casa|terreno|carro|veiculo|inmueble|coche)\b/.test(text)) return true;
  if (/\b(?:como|posso|podemos|consigo|poderia|podria|puedo|puede|quero|vou|pretendo|prefiro|pagar|pago|pagarlo)\b.{0,45}\b(?:pagar|pagamento|pago|saldo|diferenca|restante)\b/.test(text)) return true;
  if (/\b(?:valor|quanto|percentual|porcentagem|qual|dar|pagar|pago|precisa|exige|tem)\b.{0,35}\bsinal\b|\bsinal\s+(?:e\s+)?(?:de|em)\s+(?:r\$\s*)?\d/.test(text)) return true;
  if (/\b(?:quanto|valor|saldo|pagar|pago|pagamento|percentual|porcentagem)\b.{0,50}\bchaves\b|\bchaves\b.{0,40}\b(?:quanto|valor|saldo|pagar|pago|pagamento|percentual|porcentagem)\b/.test(text)) return true;
  if (/\b(?:saldo|restante)\s+(?:(?:do|da|de|a)\s+)?(?:imovel|compra|apartamento|pagar|financiar|parcelar)\b/.test(text)) return true;
  if (/\b(?:qual|quanto|valor)\b[^.!?;]{0,30}\b(?:saldo|restante)\b|^(?:e\s+(?:o\s+)?)?saldo\s*[?!.]*$/.test(text)) return true;
  if (/\b(?:quanto|valor|pagar|pago|pagaria|consigo|maximo|limite)\b.{0,35}\b(?:por mes|ao mes|mensal|mensais|monthly|a month)\b/.test(text)) return true;
  if (/\b\d[\d.,]*(?:\s*(?:mil|k))?\s*(?:por mes|ao mes|mensais|monthly|a month)\b/.test(text)) return true;
  if (/\b(?:dar|dou|pago|pagaria|ofereco|ofrecemos|ofrezco|fechar por|fecho por|fechamos por|offer|pay)\s+(?:(?:ate|uns|umas|cerca de|r\$|\$)\s*){0,2}\d/.test(text)) return true;
  if (/\b(?:make|submit|send|prepare|discuss)\s+(?:(?:an?|my|the)\s+)?(?:offer|proposal)\b/.test(text)) return true;
  // "100x" é parcelamento; "100 x 80 cm" é uma medida de projeto.
  return /\b\d{1,3}\s*x\b(?!\s*\d|\s*(?:cm|mm|m)\b)|\bem\s+\d{1,3}\s+vezes\b/.test(text);
}

/**
 * O contato entrou em condições de compra que devem ser tratadas por um humano.
 * Não muda o perfil do contato e NÃO é consentimento para contato: os chamadores
 * devem preservar pós-venda/corretor/fornecedor e respeitar refusesHandoff().
 * Um preço total ou orçamento disponível, sozinho, continua sendo pré-venda.
 */
export function financialNegotiationIntent(text: string, history: readonly ChatMessage[] = []): boolean {
  const value = normalizeSignalText(text);
  if (hasDirectFinancialTerms(value)) return true;

  // Respostas curtas só herdam a pergunta financeira IMEDIATAMENTE anterior.
  // Isso evita que "200" (unidade), "sim" (planta/visita) ou um orçamento solto
  // acionem negociação por causa de uma condição antiga mencionada na conversa.
  let previousIndex = history.length - 1;
  if (history[previousIndex]?.role === 'user'
    && normalizeSignalText(history[previousIndex].content) === value) previousIndex -= 1;
  const previous = history[previousIndex];
  if (previous?.role !== 'assistant') return false;
  const question = normalizeSignalText(finalQuestion(previous.content));
  if (!question || !hasDirectFinancialTerms(question)) return false;
  return /^(?:sim|pode ser|pode|podemos|vamos|quero|isso|exato|ok|claro|si|yes|sure)(?:,?\s+(?:pode ser|pode chamar|pode|vamos|quero))?[.!]*$/.test(value)
    || /^(?:(?:tenho|consigo|posso|seria|unos?|umas?|ate|no maximo|cerca de|tengo|puedo|i have|i can|up to)\s+)*(?:r\$|\$)?\s*\d[\d.,]*(?:\s*(?:mil|k|milhao|milhoes|%|por cento|thousand))?[.!]*$/.test(value)
    || /^(?:(?:tenho|consigo|ate|no maximo|cerca de)\s+)?(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|duzentos|trezentos|quatrocentos|quinhentos)\s+(?:mil|por cento)[.!]*$/.test(value);
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
