import type { Lead } from './types';

export interface AiFileOption {
  id: string;
  category: string;
  title: string;
  description: string | null;
  trigger_keywords: string[];
  storage_bucket: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
}

export interface AiTrainingContext {
  config?: {
    persona?: Record<string, unknown> | null;
    knowledge?: Record<string, unknown> | null;
    first_message?: string | null;
    active?: boolean | null;
  } | null;
  examples?: Array<{
    user_message: string;
    assistant_message: string;
    rating: string;
    correction: string | null;
    notes: string | null;
  }>;
  files?: AiFileOption[];
}

export interface AiTurn {
  reply: string;
  classification: string;
  score: number;
  stage: string;
  summary: string;
  next_action: string;
  handoff: boolean;
  attachment_ids: string[];
  extracted: {
    enterprise: string;
    purpose: string;
    typology: string;
    budget: string;
    deadline: string;
    decision_maker: string;
    company: string;
    creci: string;
    region: string;
    client_status: string;
  };
}

interface OpenAiResponse {
  status?: 'completed' | 'failed' | 'in_progress' | 'cancelled' | 'queued' | 'incomplete';
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  error?: { message?: string } | null;
}

const CLIENT_CLASSIFICATIONS = ['frio', 'morno', 'quente', 'agendamento', 'sem_interesse'] as const;
const CLIENT_STAGES = ['novo', 'ia', 'qualificado', 'agendado', 'negociacao', 'fechado'] as const;
const BROKER_CLASSIFICATIONS = ['cadastrado', 'curioso', 'ativo', 'negociando', 'parceiro'] as const;
const BROKER_STAGES = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;

const NARA_TRIAGE_DEFAULTS: Record<string, string> = {
  triagem_objetivo: 'Antes de qualificar, descubra se o contato é realmente um possível comprador de imóvel novo da Bossa ou se pertence a outro tipo de atendimento.',
  triagem_pergunta_inicial: 'Quando a intenção não estiver clara, faça uma pergunta curta e aberta, como: “Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?”',
  triagem_comprador: 'Se o contato demonstra que quer comprar, morar, investir ou conhecer um empreendimento, conclua a triagem e só então comece a qualificação comercial.',
  triagem_corretor: 'Se for corretor, imobiliária ou parceiro comercial, não faça a qualificação de cliente final. Explique que vai direcionar ao Plantão da Bossa e marque transferência para atendimento humano/canal correto.',
  triagem_cliente_atual: 'Se já for cliente, comprador, proprietário ou morador e o assunto for contrato, boleto, obra, assistência, entrega, documentação ou pós-venda, não qualifique. Acolha, registre o assunto e transfira ao setor responsável.',
  triagem_outros: 'Fornecedor, prestador, candidato a vaga, currículo, imprensa, vizinho, cobrança, spam e assuntos institucionais não seguem para qualificação. Colete somente o mínimo necessário e transfira ou encerre educadamente.',
  triagem_saida: 'A qualificação só pode começar quando houver evidência de que o contato é um possível comprador. Se ainda existir dúvida, continue somente a triagem, com uma pergunta por vez.',
};

function outputSchema(lead: Lead) {
  const classifications = lead.kind === 'cliente' ? CLIENT_CLASSIFICATIONS : BROKER_CLASSIFICATIONS;
  const stages = lead.kind === 'cliente' ? CLIENT_STAGES : BROKER_STAGES;

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      classification: { type: 'string', enum: classifications },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      stage: { type: 'string', enum: stages },
      summary: { type: 'string' },
      next_action: { type: 'string' },
      handoff: { type: 'boolean' },
      attachment_ids: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
      },
      extracted: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enterprise: { type: 'string' },
          purpose: { type: 'string' },
          typology: { type: 'string' },
          budget: { type: 'string' },
          deadline: { type: 'string' },
          decision_maker: { type: 'string' },
          company: { type: 'string' },
          creci: { type: 'string' },
          region: { type: 'string' },
          client_status: { type: 'string' },
        },
        required: ['enterprise', 'purpose', 'typology', 'budget', 'deadline', 'decision_maker', 'company', 'creci', 'region', 'client_status'],
      },
    },
    required: ['reply', 'classification', 'score', 'stage', 'summary', 'next_action', 'handoff', 'attachment_ids', 'extracted'],
  };
}

function recordText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === 'string' && item.trim())
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join('\n');
}

function splitKnowledge(value: unknown) {
  const triage: Record<string, string> = {};
  const general: Record<string, string> = {};
  if (!value || typeof value !== 'object') return { triage, general };

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string' || !item.trim()) continue;
    if (key.startsWith('triagem_')) triage[key] = item;
    else general[key] = item;
  }
  return { triage, general };
}

function trainingInstructions(context: AiTrainingContext): string {
  const persona = recordText(context.config?.persona);
  const { general } = splitKnowledge(context.config?.knowledge);
  const knowledge = recordText(general);
  const examples = (context.examples ?? []).slice(0, 30).map((item) => {
    if (item.rating === 'corrected' && item.correction) {
      return `Contato: ${item.user_message}\nResposta que estava errada: ${item.assistant_message}\nResposta ideal: ${item.correction}`;
    }
    if (item.rating === 'rejected' && item.notes) {
      return `Contato: ${item.user_message}\nResposta que precisa melhorar: ${item.assistant_message}\nOrientação obrigatória do gestor: ${item.notes}`;
    }
    if (item.rating === 'corrected' && item.notes) {
      return `Contato: ${item.user_message}\nResposta avaliada: ${item.assistant_message}\nOrientação obrigatória do gestor: ${item.notes}`;
    }
    if (item.rating === 'approved') {
      return `Contato: ${item.user_message}\nResposta aprovada: ${item.assistant_message}`;
    }
    return '';
  }).filter(Boolean).join('\n\n');

  const parts = [
    persona ? `PERSONALIDADE DEFINIDA PELO GESTOR:\n${persona}` : '',
    knowledge ? `BASE DE CONHECIMENTO DEFINIDA PELO GESTOR:\n${knowledge}` : '',
    context.config?.first_message ? `PRIMEIRA MENSAGEM PADRÃO:\n${context.config.first_message}` : '',
    examples ? `EXEMPLOS, CORREÇÕES E ORDENS DO GESTOR (TÊM PRIORIDADE):\n${examples}` : '',
  ].filter(Boolean);

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

function triageInstructions(context: AiTrainingContext): string {
  const { triage } = splitKnowledge(context.config?.knowledge);
  const rules = { ...NARA_TRIAGE_DEFAULTS, ...triage };
  const configured = Object.entries(rules)
    .map(([key, value]) => `${key.replace('triagem_', '').replaceAll('_', ' ')}: ${value}`)
    .join('\n');

  return `\n\nETAPA 1 — TRIAGEM OBRIGATÓRIA (SEMPRE RODA ANTES DA QUALIFICAÇÃO)
${configured}

REGRAS OPERACIONAIS DA TRIAGEM:
- Em toda conversa nova, determine primeiro o tipo de contato e a intenção principal.
- Um pedido isolado de preço, valor, tabela, menor unidade, planta ou disponibilidade NÃO confirma sozinho que o contato é comprador.
- Se a primeira mensagem pedir preço sem declarar finalidade de compra, moradia ou investimento, NÃO informe nenhum valor. Faça somente a pergunta de triagem configurada e aguarde.
- Não pergunte orçamento, tipologia, prazo ou decisor enquanto a triagem não confirmar que é um possível comprador.
- Quando a mensagem declarar claramente que quer comprar, morar, investir ou conhecer um empreendimento para compra, considere a triagem concluída e faça somente a primeira pergunta de qualificação mais natural.
- Quando a intenção estiver ambígua, faça somente uma pergunta de triagem e aguarde a resposta.
- Corretor, cliente atual, fornecedor, currículo, pós-venda, financeiro, assistência, reclamação ou assunto institucional não entra na qualificação da Nara. Nesses casos, acolha, resuma o pedido, use handoff=true, mantenha stage=ia e indique o setor/canal correto em next_action.
- Para spam ou contato sem relação com a Bossa, use sem_interesse e handoff=true.
- Nunca use preços lembrados pelo modelo. Um valor só pode ser informado quando estiver explicitamente na base de conhecimento atual ou no histórico da conversa.
- A resposta não deve mencionar internamente as palavras “triagem”, “classificação” ou “handoff” para o contato.`;
}

function fileInstructions(files: AiFileOption[]): string {
  if (!files.length) {
    return `\n\nBIBLIOTECA DE ARQUIVOS: não há arquivos ativos disponíveis. Sempre devolva attachment_ids como lista vazia.`;
  }

  const catalog = files.slice(0, 60).map((file) => ({
    id: file.id,
    categoria: file.category,
    titulo: file.title,
    descricao: file.description || '',
    palavras_chave: file.trigger_keywords,
    nome_arquivo: file.original_name,
  }));

  return `\n\nBIBLIOTECA DE ARQUIVOS DISPONÍVEIS:
${JSON.stringify(catalog)}

REGRAS PARA ARQUIVOS:
- Use attachment_ids somente com IDs exatamente presentes na biblioteca acima.
- Selecione no máximo 3 arquivos e apenas quando o contato pedir material ou quando o envio ajudar diretamente a conversa.
- Escolha pelo empreendimento, categoria, título, descrição e palavras-chave.
- Não diga que enviou ou vai enviar um arquivo sem incluir o ID correspondente em attachment_ids.
- Não repita o mesmo arquivo na mesma resposta.
- Tabela, condição comercial e disponibilidade podem ficar desatualizadas: envie somente quando solicitado e deixe claro que o comercial confirma a condição vigente.
- Se não existir material adequado, use attachment_ids vazio e diga que o comercial vai providenciar ou confirmar.
- Não envie arquivos em uma conversa que já exige handoff imediato, salvo quando for um material público claramente solicitado e seguro.`;
}

export function buildAiInstructions(lead: Lead, context: AiTrainingContext): string {
  const shared = `Você atende pelo WhatsApp da Bossa Empreendimentos. Responda sempre em português brasileiro, de forma humana, natural, calorosa e objetiva. Use no máximo duas frases curtas e uma pergunta por mensagem. Nunca invente preço, disponibilidade, metragem, condição de pagamento, prazo de entrega ou informação que não esteja na base atual ou no histórico. Quando faltar uma informação comercial específica, diga que o time da Bossa vai confirmar. Analise toda a conversa, produza a resposta, classifique o contato e selecione arquivos somente quando fizer sentido. Contato: ${lead.name}. Etapa atual: ${lead.stage}. Dados atuais: ${JSON.stringify(lead.metadata || {})}.`;
  const training = trainingInstructions(context);
  const files = fileInstructions(context.files ?? []);

  if (lead.kind === 'cliente') {
    const triage = triageInstructions(context);
    return `${shared}

Você é Nara, atendente digital dos clientes finais da Bossa. Os produtos são Flow Aptos e Alma Seahouses. Sua ordem obrigatória é: 1) triagem do tipo de contato; 2) qualificação do possível comprador; 3) agendamento ou transferência. Nunca pule a triagem por causa de uma pergunta de preço.${triage}

ETAPA 2 — QUALIFICAÇÃO (SÓ DEPOIS DA TRIAGEM CONFIRMAR POSSÍVEL COMPRADOR)
Descubra com leveza: finalidade da compra, empreendimento de interesse, tipologia, faixa de investimento, prazo para comprar e quem participa da decisão. Faça uma pergunta por vez e aproveite dados que o contato já informou. Pode enviar book, planta, imagem, vídeo de obra ou material institucional quando o comprador pedir ou quando isso ajudar a avançar. Evite despejar vários arquivos sem necessidade.

Classificação e etapas permitidas para clientes:
- ia: triagem em andamento, intenção inicial ou ainda coletando informações.
- qualificado: interesse real e dados suficientes para o comercial agir, especialmente finalidade, faixa de investimento ou capacidade financeira e prazo; também quando pede proposta, disponibilidade ou demonstra intenção concreta.
- agendado: visita, ligação ou videochamada com data ou compromisso claramente combinado.
- negociacao e fechado nunca devem ser definidos automaticamente; nesses casos mantenha a etapa atual e sinalize handoff.
Use somente as classificações frio, morno, quente, agendamento ou sem_interesse. Marque handoff=true quando houver pedido de proposta, negociação, reclamação, questão sensível, contato fora do perfil comprador ou quando o comercial humano deva assumir. Ao qualificar ou agendar, a automação será pausada após esta resposta.${training}${files}`;
  }

  return `${shared}

Você é o Plantão institucional dos corretores parceiros da Bossa. Nunca use nome próprio. Seja prático, direto e de igual para igual, como colega de mercado. Identifique imobiliária, CRECI, região, se o corretor tem cliente ativo, qual empreendimento interessa e qual ajuda precisa. O plantão pode enviar materiais públicos disponíveis na biblioteca, como tabela, book, plantas, imagens, vídeos e andamento de obra. Nunca negocie comissão, nunca confirme disponibilidade de unidade, nunca reserve unidade e nunca aceite proposta.

Classificação e etapas permitidas para corretores:
- n1 / cadastrado: contato novo, perfil ainda incompleto ou sem interação comercial.
- n2 / curioso: pediu material, tabela ou informações, mas ainda não informou cliente ativo.
- n3 / ativo: possui cliente ativo, apresenta os produtos ou demonstra atuação comercial concreta.
- n4 / negociando: existe cliente em visita, proposta, reserva, escolha de unidade ou negociação; marque handoff=true.
- n5 / parceiro: relacionamento recorrente, histórico de vendas ou parceria consolidada; use somente quando houver evidência clara e marque handoff=true.
Use classificação cadastrado, curioso, ativo, negociando ou parceiro. Ao chegar em n4 ou n5, o atendimento automático será pausado para o time comercial continuar.${training}${files}`;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function lastUserText(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  return [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
}

function hasExplicitBuyerIntent(
  lead: Lead,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  if (lead.metadata?.triage_confirmed === true) return true;

  const userText = normalizeText(
    history
      .filter((item) => item.role === 'user')
      .map((item) => item.content)
      .join('\n'),
  );

  return /\b(para morar|quero morar|pretendo morar|moradia|para investir|quero investir|pretendo investir|investimento|renda com aluguel|para revenda|quero comprar|pretendo comprar|busco (?:um |uma )?(?:apartamento|imovel)|procuro (?:um |uma )?(?:apartamento|imovel)|tenho interesse (?:no|na|em) (?:flow|alma)|quero conhecer (?:o |a )?(?:flow|alma))\b/.test(userText);
}

function routeOutsideBuyerProfile(text: string): boolean {
  const value = normalizeText(text);
  return /\b(corretor|corretora|imobiliaria|creci|ja comprei|sou cliente|segunda via|boleto|contrato|pos-venda|assistencia|entrega|chaves|fornecedor|prestador|curriculo|vaga|trabalhar com voces|cobranca|imprensa)\b/.test(value);
}

function asksCommercialValue(text: string): boolean {
  const value = normalizeText(text);
  return /\b(preco|valor|quanto custa|a partir de|menor apartamento|menor unidade|tabela|condicao de pagamento|entrada|parcela)\b/.test(value);
}

function configuredTriageQuestion(context: AiTrainingContext): string {
  const { triage } = splitKnowledge(context.config?.knowledge);
  const raw = triage.triagem_pergunta_inicial || NARA_TRIAGE_DEFAULTS.triagem_pergunta_inicial;
  const quoted = raw.match(/[“"]([^”"]+\?)[”"]/);
  if (quoted?.[1]) return quoted[1].trim();

  const trimmed = raw.trim();
  if (trimmed.endsWith('?') && trimmed.length <= 300 && !/^quando\b/i.test(trimmed)) {
    return trimmed;
  }

  return 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?';
}

function moneyTokens(value: string): string[] {
  return value.match(/R\$\s*\d[\d.\s]*(?:,\d{1,2})?|\b\d+(?:[.,]\d+)?\s*(?:milh(?:ao|ão|oes|ões)|mil)\b/giu) ?? [];
}

function moneyKey(value: string): string {
  return value.replace(/\D/g, '');
}

function hasUngroundedMoney(
  reply: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: AiTrainingContext,
): boolean {
  const tokens = moneyTokens(reply);
  if (!tokens.length) return false;

  const corpus = [
    ...history.map((item) => item.content),
    recordText(context.config?.knowledge),
  ].join('\n');
  const sourceKeys = new Set(moneyTokens(corpus).map(moneyKey).filter(Boolean));

  return tokens.some((token) => {
    const key = moneyKey(token);
    return key && !sourceKeys.has(key);
  });
}

function normalizeClientDecision(turn: AiTurn): AiTurn {
  if (!CLIENT_CLASSIFICATIONS.includes(turn.classification as typeof CLIENT_CLASSIFICATIONS[number])) {
    turn.classification = turn.score >= 70 ? 'quente' : turn.score >= 30 ? 'morno' : 'frio';
  }
  if (!CLIENT_STAGES.includes(turn.stage as typeof CLIENT_STAGES[number])) {
    turn.stage = 'ia';
  }
  return turn;
}

function enforceNaraTriage(
  turn: AiTurn,
  lead: Lead,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: AiTrainingContext,
): AiTurn {
  normalizeClientDecision(turn);

  const lastUser = lastUserText(history);
  const routed = routeOutsideBuyerProfile(lastUser);
  const buyerConfirmed = hasExplicitBuyerIntent(lead, history);

  if (!buyerConfirmed && !routed) {
    turn.reply = `Claro. ${configuredTriageQuestion(context)}`;
    turn.classification = 'frio';
    turn.score = Math.min(turn.score, 20);
    turn.stage = 'ia';
    turn.summary = asksCommercialValue(lastUser)
      ? 'Contato pediu informação comercial, mas a triagem de intenção ainda não foi concluída.'
      : 'Intenção do contato ainda não confirmada; triagem em andamento.';
    turn.next_action = 'Aguardar o contato confirmar se busca comprar um imóvel ou se precisa de outro atendimento.';
    turn.handoff = false;
    turn.attachment_ids = [];
    turn.extracted.budget = '';
    turn.extracted.typology = '';
    turn.extracted.deadline = '';
    turn.extracted.decision_maker = '';
    return turn;
  }

  if (routed) {
    turn.stage = 'ia';
    turn.handoff = true;
    turn.attachment_ids = [];
    return turn;
  }

  if (hasUngroundedMoney(turn.reply, history, context)) {
    turn.reply = 'Os valores dependem da unidade e da condição vigente, e eu prefiro confirmar a informação atualizada com o comercial. Qual empreendimento te interessou mais, Flow ou Alma?';
    turn.stage = 'ia';
    turn.handoff = false;
    turn.attachment_ids = [];
    turn.summary = 'Possível comprador identificado, mas não havia preço atual e comprovado na base para informar.';
    turn.next_action = 'Confirmar o empreendimento de interesse e obter a informação comercial vigente.';
  }

  return turn;
}

function extractOutputText(data: OpenAiResponse): string {
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

function extractRefusal(data: OpenAiResponse): string {
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'refusal' && content.refusal) return content.refusal;
    }
  }
  return '';
}

export async function generateAiTurn(
  lead: Lead,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: AiTrainingContext = {},
): Promise<AiTurn | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const input = history.slice(-24).map((item) => ({ role: item.role, content: item.content }));
  if (input.length === 0) return null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: buildAiInstructions(lead, context),
      input,
      reasoning: { effort: 'low' },
      max_output_tokens: 2400,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: lead.kind === 'cliente' ? 'bossa_crm_nara_turn' : 'bossa_crm_plantao_turn',
          description: 'Resposta de WhatsApp, classificação comercial e arquivos selecionados para o contato.',
          strict: true,
          schema: outputSchema(lead),
        },
      },
    }),
  });

  const data = await response.json() as OpenAiResponse;
  if (!response.ok) throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);

  if (data.status === 'incomplete') {
    const reason = data.incomplete_details?.reason;
    if (reason === 'max_output_tokens' || reason === 'max_tokens') {
      throw new Error('A OpenAI atingiu o limite de geração antes de concluir a resposta. Tente novamente.');
    }
    throw new Error(`A OpenAI não concluiu a resposta${reason ? `: ${reason}` : '.'}`);
  }

  if (data.status === 'failed' || data.status === 'cancelled') {
    throw new Error(data.error?.message || 'A OpenAI não conseguiu concluir a resposta.');
  }

  const refusal = extractRefusal(data);
  if (refusal) throw new Error(`A OpenAI recusou esta resposta: ${refusal}`);

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error('A OpenAI respondeu sem o bloco estruturado esperado. Tente novamente; se persistir, confira o modelo configurado na Vercel.');
  }

  try {
    const parsed = JSON.parse(outputText) as AiTurn;
    const allowedIds = new Set((context.files ?? []).map((file) => file.id));
    parsed.attachment_ids = [...new Set(parsed.attachment_ids ?? [])]
      .filter((id) => allowedIds.has(id))
      .slice(0, 3);

    return lead.kind === 'cliente'
      ? enforceNaraTriage(parsed, lead, history, context)
      : parsed;
  } catch {
    throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.');
  }
}
