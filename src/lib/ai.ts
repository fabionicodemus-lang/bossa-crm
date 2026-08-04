import { extractNaraPrompt } from './nara-prompt-config';
import { asksProtectedCommercialDetail, isGeneralPriceRangeReply } from './nara-price-levels';
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

export interface AiUsageRecord {
  request_kind: 'summary' | 'response';
  model: string;
  request_id: string | null;
  input_tokens: number;
  cached_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  preflight_input_tokens: number;
  preflight_estimated: boolean;
  estimated_cost_usd: number;
  fallback_used: boolean;
  compacted: boolean;
  long_context: boolean;
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
  usage_records?: AiUsageRecord[];
  model_used?: string;
  compacted?: boolean;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type InputTextBlock = {
  type: 'input_text';
  text: string;
  prompt_cache_breakpoint?: { mode: 'explicit' };
};
type OutputTextBlock = {
  type: 'output_text';
  text: string;
};
type InputMessage = {
  type: 'message';
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: InputTextBlock[] | OutputTextBlock[];
};

type OpenAiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

interface OpenAiResponse {
  id?: string;
  model?: string;
  status?: 'completed' | 'failed' | 'in_progress' | 'cancelled' | 'queued' | 'incomplete';
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: OpenAiUsage;
  error?: { message?: string } | null;
}

type CountResponse = { input_tokens?: number; error?: { message?: string } | null };

type ModelSettings = {
  primary: string;
  fallback: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  verbosity: string;
  timeoutMs: number;
};

type RequestOptions = {
  model: string;
  input: InputMessage[];
  schema?: ReturnType<typeof outputSchema>;
  requestKind: AiUsageRecord['request_kind'];
  compacted: boolean;
  fallbackUsed: boolean;
  promptCacheKey?: string;
  maxOutputTokens?: number;
  reasoningEffort?: string;
  verbosity?: string;
};

type RequestResult = {
  data: OpenAiResponse;
  usage: AiUsageRecord;
  outputText: string;
};

export class OpenAiExhaustedError extends Error {
  readonly causes: string[];

  constructor(causes: string[]) {
    super('A OpenAI e o modelo alternativo não conseguiram concluir o atendimento.');
    this.name = 'OpenAiExhaustedError';
    this.causes = causes;
  }
}

const CLIENT_CLASSIFICATIONS = ['frio', 'morno', 'quente', 'agendamento', 'sem_interesse'] as const;
const CLIENT_STAGES = ['novo', 'ia', 'qualificado', 'agendado', 'negociacao', 'fechado'] as const;
const BROKER_CLASSIFICATIONS = ['cadastrado', 'curioso', 'ativo', 'negociando', 'parceiro'] as const;
const BROKER_STAGES = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;
const LONG_CONTEXT_THRESHOLD = 272_000;
const MAX_HISTORY_BEFORE_COMPACTION = 25;
const RECENT_MESSAGES_TO_KEEP = 10;

const NARA_TRIAGE_DEFAULTS: Record<string, string> = {
  triagem_objetivo: 'Identifique silenciosamente o tipo de contato ao longo da conversa, sem transformar a triagem em uma etapa visível antes de entregar valor.',
  triagem_pergunta_inicial: 'Quando houver ambiguidade real, use uma única pergunta curta e aberta: “Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?”',
  triagem_comprador: 'Sinais de interesse em empreendimento, planta, entrega, pagamento, moradia, veraneio ou investimento permitem seguir naturalmente como possível comprador, sem exigir confirmação formal.',
  triagem_corretor: 'Se for corretor, imobiliária ou parceiro comercial, não conduza como cliente final. Direcione ao Plantão da Bossa e marque transferência para o canal correto.',
  triagem_cliente_atual: 'Se já for cliente, comprador, proprietário ou morador e o assunto for contrato, boleto, obra, assistência, entrega, documentação ou pós-venda, não qualifique. Acolha, registre o assunto e transfira ao setor responsável.',
  triagem_outros: 'Fornecedor, prestador, candidato a vaga, currículo, imprensa, vizinho, cobrança, spam e assuntos institucionais não seguem para condução comercial. Colete somente o mínimo necessário e transfira ou encerre educadamente.',
  triagem_saida: 'A pergunta direta de triagem é exceção: nunca deve abrir a conversa, deve aparecer no máximo uma vez e somente quando houver dúvida real sobre o tipo de atendimento.',
};

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function openAiSettings(): ModelSettings {
  return {
    primary: process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-terra',
    fallback: process.env.OPENAI_MODEL_FALLBACK?.trim() || 'gpt-5.6-luna',
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT?.trim() || 'low',
    maxOutputTokens: envNumber('OPENAI_MAX_OUTPUT_TOKENS', 2400, 128, 128_000),
    verbosity: process.env.OPENAI_VERBOSITY?.trim() || 'low',
    timeoutMs: envNumber('OPENAI_TIMEOUT_MS', 25_000, 3_000, 55_000),
  };
}

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
      attachment_ids: { type: 'array', items: { type: 'string' }, maxItems: 3 },
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
  } as const;
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
  const finalPrompt = extractNaraPrompt(context.config?.knowledge);
  const generalKnowledge = { ...general };
  delete generalKnowledge.prompt_final;
  const knowledge = recordText(generalKnowledge);
  const examples = (context.examples ?? []).slice(0, 40).map((item) => {
    if (item.rating === 'corrected' && item.correction) {
      return `Contato: ${item.user_message}\nResposta que estava errada: ${item.assistant_message}\nResposta ideal obrigatória: ${item.correction}`;
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
    finalPrompt ? `PROMPT FINAL DEFINIDO PELO GESTOR — CAMADA PRINCIPAL DE COMPORTAMENTO:
${finalPrompt}` : '',
    !finalPrompt && persona ? `PERSONALIDADE DEFINIDA PELO GESTOR:
${persona}` : '',
    knowledge ? `BASE DE CONHECIMENTO DEFINIDA PELO GESTOR:\n${knowledge}` : '',
    !finalPrompt && context.config?.first_message ? `PRIMEIRA MENSAGEM PADRÃO:\n${context.config.first_message}` : '',
    examples ? `EXEMPLOS, CORREÇÕES E ORDENS DO GESTOR (TÊM PRIORIDADE SOBRE RESPOSTAS GENÉRICAS):\n${examples}` : '',
  ].filter(Boolean);

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

function triageInstructions(context: AiTrainingContext): string {
  const { triage } = splitKnowledge(context.config?.knowledge);
  const rules = { ...NARA_TRIAGE_DEFAULTS, ...triage };
  const configured = Object.entries(rules)
    .map(([key, value]) => `${key.replace('triagem_', '').replaceAll('_', ' ')}: ${value}`)
    .join('\n');

  return `\n\nPROTEÇÕES DE TRIAGEM E ROTEAMENTO\n${configured}\n\nREGRAS OPERACIONAIS:\n- Na primeira resposta da conversa, cumprimente e apresente-se como Nara, da Bossa. Não diga espontaneamente que é IA.\n- Leia o histórico inteiro e avance a conversa. Nunca repita uma pergunta que o contato já respondeu nem envie a mesma mensagem duas vezes.\n- Faça a leitura do tipo de contato de forma silenciosa ao longo da conversa. Não transforme a triagem em uma etapa visível ou em um checklist obrigatório.\n- Quando a mensagem for compatível com interesse imobiliário, deixe o Prompt final conduzir a conversa naturalmente, sem criar um pedágio antes de entregar valor.\n- Um pedido isolado de preço, valor, tabela, menor apartamento, planta ou disponibilidade não confirma sozinho que o contato é comprador.\n- Se a primeira mensagem pedir preço sem declarar finalidade de compra, moradia ou investimento, não informe valor nesta fase. Use a pergunta de triagem configurada e aguarde. Esta proteção será revista na fase específica de preço.\n- Quando houver ambiguidade real entre possível comprador e outro tipo de atendimento, use a pergunta configurada uma única vez e aguarde, sem iniciar uma sequência fixa de perguntas.\n- Corretor, cliente atual, fornecedor, currículo, pós-venda, financeiro, assistência, reclamação ou assunto institucional não entra na qualificação da Nara. Nesses casos, acolha, resuma o pedido, use handoff=true, mantenha stage=ia e indique o setor ou canal correto em next_action.\n- Para spam ou contato sem relação com a Bossa, use sem_interesse e handoff=true.\n- Nunca use preços lembrados pelo modelo. Um valor só pode ser informado quando estiver explicitamente em uma fonte válida para o turno.\n- A resposta não deve mencionar internamente as palavras “triagem”, “classificação” ou “handoff” para o contato.`;
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

  return `\n\nBIBLIOTECA DE ARQUIVOS DISPONÍVEIS:\n${JSON.stringify(catalog)}\n\nREGRAS PARA ARQUIVOS:\n- Use attachment_ids somente com IDs exatamente presentes na biblioteca acima.\n- Selecione no máximo 3 arquivos e apenas quando o contato pedir material ou quando o envio ajudar diretamente a conversa.\n- Escolha pelo empreendimento, categoria, título, descrição e palavras-chave.\n- Não diga que enviou ou vai enviar um arquivo sem incluir o ID correspondente em attachment_ids.\n- Não repita o mesmo arquivo na mesma resposta.\n- Tabela, condição comercial e disponibilidade podem ficar desatualizadas: envie somente quando solicitado e deixe claro que o comercial confirma a condição vigente.\n- Se não existir material adequado, use attachment_ids vazio e diga que o comercial vai providenciar ou confirmar.\n- Não envie arquivos em uma conversa que já exige handoff imediato, salvo quando for um material público claramente solicitado e seguro.`;
}

/**
 * Retorna somente o prefixo fixo. Dados do lead e histórico são adicionados depois
 * do breakpoint de cache por buildRequestInput().
 */
export function buildAiInstructions(lead: Lead, context: AiTrainingContext): string {
  const shared = 'Você atende pelo WhatsApp da Bossa Empreendimentos. Responda sempre em português brasileiro, de forma humana, natural, calorosa e objetiva. Siga o formato e o limite de tamanho definidos na configuração do agente e faça no máximo uma pergunta por mensagem. Nunca invente preço, disponibilidade, metragem, condição de pagamento, prazo de entrega ou informação que não esteja em uma fonte válida para o turno. Leia o histórico inteiro, reconheça o que já foi respondido e faça a conversa avançar; nunca repita a mesma pergunta ou resposta. Quando faltar uma informação comercial específica, diga que o time da Bossa vai confirmar. Analise toda a conversa, produza a resposta, classifique o contato e selecione arquivos somente quando fizer sentido.';
  const training = trainingInstructions(context);
  const files = fileInstructions(context.files ?? []);

  if (lead.kind === 'cliente') {
    const triage = triageInstructions(context);
    return `${shared}\n\nVocê é Nara, atendente digital dos clientes finais da Bossa. Apresente-se como Nara, da Bossa, na primeira resposta e depois converse naturalmente, sem repetir a apresentação. Os produtos são Flow Aptos e Alma Seahouses. O Prompt final define o ritmo, o tom, a ordem da conversa e o tamanho das mensagens. As regras fixas abaixo existem somente para segurança, roteamento, classificação, arquivos e passagem para humanos; não recrie uma sequência rígida de etapas.${training}${triage}\n\nQUALIFICAÇÃO E CONDUÇÃO COMERCIAL\nUse o contexto e o Prompt final para descobrir naturalmente as informações úteis ao comercial, sem checklist e sem ordem obrigatória. Aproveite tudo o que o contato já informou e escolha a próxima ação que realmente faça a conversa avançar. Pode enviar book, planta, imagem, vídeo de obra ou material institucional quando o comprador pedir ou quando isso ajudar diretamente. Evite despejar vários arquivos sem necessidade.\n\nClassificação e etapas permitidas para clientes:\n- ia: conversa inicial ou ainda coletando informações.\n- qualificado: interesse real e dados suficientes para o comercial agir, especialmente finalidade, faixa de investimento ou capacidade financeira e prazo; também quando pede proposta, disponibilidade ou demonstra intenção concreta.\n- agendado: visita, ligação ou videochamada com data ou compromisso claramente combinado.\n- negociacao e fechado nunca devem ser definidos automaticamente; nesses casos mantenha a etapa atual e sinalize handoff.\nUse somente as classificações frio, morno, quente, agendamento ou sem_interesse. Marque handoff=true quando houver pedido de proposta, negociação, reclamação, questão sensível, contato fora do perfil comprador ou quando o comercial humano deva assumir. Ao qualificar ou agendar, a automação será pausada após esta resposta.${files}`;
  }

  return `${shared}\n\nUse no máximo duas frases curtas e uma pergunta por mensagem. Você é o Plantão institucional dos corretores parceiros da Bossa. Nunca use nome próprio. Seja prático, direto e de igual para igual, como colega de mercado. Identifique imobiliária, CRECI, região, se o corretor tem cliente ativo, qual empreendimento interessa e qual ajuda precisa. O plantão pode enviar materiais públicos disponíveis na biblioteca, como tabela, book, plantas, imagens, vídeos e andamento de obra. Nunca negocie comissão, nunca confirme disponibilidade de apartamento, nunca reserve apartamento e nunca aceite proposta.\n\nClassificação e etapas permitidas para corretores:\n- n1 / cadastrado: contato novo, perfil ainda incompleto ou sem interação comercial.\n- n2 / curioso: pediu material, tabela ou informações, mas ainda não informou cliente ativo.\n- n3 / ativo: possui cliente ativo, apresenta os produtos ou demonstra atuação comercial concreta.\n- n4 / negociando: existe cliente em visita, proposta, reserva, escolha de apartamento ou negociação; marque handoff=true.\n- n5 / parceiro: relacionamento recorrente, histórico de vendas ou parceria consolidada; use somente quando houver evidência clara e marque handoff=true.\nUse classificação cadastrado, curioso, ativo, negociando ou parceiro. Ao chegar em n4 ou n5, o atendimento automático será pausado para o time comercial continuar.${training}${files}`;
}

function dynamicLeadContext(lead: Lead): string {
  return `DADOS DINÂMICOS DESTA CONVERSA:\nContato: ${lead.name}.\nEtapa atual: ${lead.stage}.\nDados atuais: ${JSON.stringify(lead.metadata || {})}.`;
}

function inputMessage(role: InputMessage['role'], text: string, cacheBreakpoint = false): InputMessage {
  if (role === 'assistant') {
    return { type: 'message', role, content: [{ type: 'output_text', text }] };
  }
  const block: InputTextBlock = { type: 'input_text', text };
  if (cacheBreakpoint) block.prompt_cache_breakpoint = { mode: 'explicit' };
  return { type: 'message', role, content: [block] };
}

function buildRequestInput(
  lead: Lead,
  context: AiTrainingContext,
  history: ChatMessage[],
  summary: string,
  supportsExplicitCache: boolean,
): InputMessage[] {
  const latest = history.at(-1);
  const prior = latest?.role === 'user' ? history.slice(0, -1) : history;
  const input: InputMessage[] = [
    inputMessage('system', buildAiInstructions(lead, context), supportsExplicitCache),
    inputMessage('system', `${dynamicLeadContext(lead)}${summary ? `\n\nRESUMO DA CONVERSA ATÉ AQUI:\n${summary}` : ''}`),
    ...prior.map((item) => inputMessage(item.role, item.content)),
  ];
  if (latest) input.push(inputMessage(latest.role, latest.content));
  return input;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

function userText(history: ChatMessage[]): string {
  return history.filter((item) => item.role === 'user').map((item) => item.content).join('\n');
}

function lastUserText(history: ChatMessage[]): string {
  return [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
}

function assistantMessages(history: ChatMessage[]): string[] {
  return history.filter((item) => item.role === 'assistant').map((item) => item.content);
}

type OutsideBuyerDestination = 'plantao' | 'pos_venda' | 'equipe';

function routingText(value: string): string {
  let normalized = normalizeText(value);
  if (/\bnao sou (?:um |uma )?corretor(?:a)?\b/.test(normalized)) {
    normalized = normalized.replace(/\b(corretor|corretora|imobiliaria|creci)\b/g, ' ');
  }
  if (/\bnao sou (?:um |uma )?cliente\b/.test(normalized)) {
    normalized = normalized.replace(/\b(ja comprei|sou cliente|segunda via|boleto)\b/g, ' ');
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

function outsideBuyerDestination(history: ChatMessage[]): OutsideBuyerDestination | null {
  const fullHistory = history
    .filter((item) => item.role === 'user')
    .map((item) => routingText(item.content))
    .join('\n');
  const current = routingText(lastUserText(history));

  if (/\b(corretor|corretora|imobiliaria|creci)\b/.test(fullHistory)) return 'plantao';
  if (/\b(ja comprei|sou cliente|segunda via|boleto)\b/.test(fullHistory)) return 'pos_venda';
  if (/\b(fornecedor|prestador|curriculo|vaga|trabalhar com voces|cobranca|imprensa)\b/.test(fullHistory)) return 'equipe';

  const ambiguousSignal = /\b(entrega|chaves|contrato|pos-venda|assistencia)\b/.test(current);
  const existingClientSignal = /\b(ja comprei|sou cliente|minha unidade|meu apartamento|comprei com voces|minha obra)\b/.test(current);
  return ambiguousSignal && existingClientSignal ? 'pos_venda' : null;
}

function routeOutsideBuyerProfile(history: ChatMessage[]): boolean {
  return outsideBuyerDestination(history) !== null;
}

function outsideBuyerReply(history: ChatMessage[]): string {
  const destination = outsideBuyerDestination(history);
  if (destination === 'plantao') {
    return 'Vou direcionar você para o Plantão da Bossa, que atende corretores parceiros.';
  }
  if (destination === 'pos_venda') {
    return 'Vou encaminhar você para o pós-venda da Bossa; por favor, diga em uma frase qual é o assunto para a equipe continuar.';
  }
  return 'Vou encaminhar você para a equipe responsável da Bossa; por favor, diga em uma frase qual atendimento precisa.';
}

function outsideBuyerSummary(history: ChatMessage[]): string {
  const destination = outsideBuyerDestination(history);
  if (destination === 'plantao') return 'Contato se identificou como corretor ou imobiliária e deve continuar pelo Plantão.';
  if (destination === 'pos_venda') return 'Contato indicou que já é cliente e precisa de atendimento de pós-venda.';
  return 'Contato precisa de atendimento da equipe responsável fora da esteira de compradores.';
}

function outsideBuyerNextAction(history: ChatMessage[]): string {
  const destination = outsideBuyerDestination(history);
  if (destination === 'plantao') return 'Continuar o atendimento pelo Plantão no pipeline de corretores.';
  if (destination === 'pos_venda') return 'Encaminhar para o pós-venda e identificar o assunto informado pelo cliente.';
  return 'Encaminhar para a equipe humana responsável e identificar o assunto solicitado.';
}

function asksCommercialValue(text: string): boolean {
  return /\b(precos?|valores?|quanto custa|a partir de|faixa(?: de (?:preco|valor))?|menor apartamento|menor unidade|tabela|condicao de pagamento|entrada|parcela)\b/.test(normalizeText(text));
}

function configuredTriageQuestion(context: AiTrainingContext): string {
  const { triage } = splitKnowledge(context.config?.knowledge);
  const raw = triage.triagem_pergunta_inicial || NARA_TRIAGE_DEFAULTS.triagem_pergunta_inicial;
  const quoted = raw.match(/[“"]([^”"]+\?)[”"]/);
  if (quoted?.[1]) return quoted[1].trim();
  const trimmed = raw.trim();
  if (trimmed.endsWith('?') && trimmed.length <= 300 && !/^quando\b/i.test(trimmed)) return trimmed;
  return 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?';
}

function alternativeTriageQuestion(): string {
  return 'Só para eu seguir pelo caminho certo: seu interesse é conhecer um imóvel para comprar ou você precisa de outro atendimento da Bossa?';
}

function looksLikeTriageQuestion(text: string, context: AiTrainingContext): boolean {
  const value = normalizeText(text);
  const configured = normalizeText(configuredTriageQuestion(context));
  const alternative = normalizeText(alternativeTriageQuestion());
  return value.includes(configured)
    || value.includes(alternative)
    || (/buscando.*imovel.*comprar/.test(value) && /outro assunto|outro atendimento/.test(value))
    || (/interesse.*comprar/.test(value) && /assunto|outro atendimento/.test(value));
}

function hasTriageQuestionBeenAsked(history: ChatMessage[], context: AiTrainingContext): boolean {
  return assistantMessages(history).some((message) => looksLikeTriageQuestion(message, context));
}

function contextualBuyerReply(history: ChatMessage[], context: AiTrainingContext): boolean {
  let lastTriageIndex = -1;
  history.forEach((message, index) => {
    if (message.role === 'assistant' && looksLikeTriageQuestion(message.content, context)) lastTriageIndex = index;
  });
  if (lastTriageIndex < 0) return false;

  const answer = normalizeText(history.slice(lastTriageIndex + 1)
    .filter((item) => item.role === 'user').map((item) => item.content).join(' '));
  if (!answer) return false;
  if (/\b(nao|outro assunto|nao quero comprar|nao estou procurando|boleto|contrato|fornecedor|curriculo|corretor)\b/.test(answer)) return false;
  return /\b(sim|isso|exatamente|quero saber mais|gostaria de saber mais|vi (?:um )?anuncio|vim pelo anuncio|anuncio.*empreendimento|sobre (?:um |o |a )?empreendimento|quero conhecer|apartamento|imovel|empreendimento|flow|alma|comprar|morar|investir|investimento)\b/.test(answer);
}

function hasExplicitBuyerIntent(lead: Lead, history: ChatMessage[], context: AiTrainingContext): boolean {
  if (lead.metadata?.triage_confirmed === true) return true;
  if (contextualBuyerReply(history, context)) return true;

  const value = normalizeText(userText(history));
  const strongIntent = /\b(para morar|quero morar|pretendo morar|moradia|para investir|quero investir|pretendo investir|investimento|renda com aluguel|para revenda|quero comprar|pretendo comprar|busco (?:um |uma )?(?:apartamento|imovel)|procuro (?:um |uma )?(?:apartamento|imovel)|tenho interesse(?: no| na| em)?|quero conhecer (?:o |a )?(?:flow|alma)|vi (?:um )?anuncio.*(?:flow|alma|apartamento|imovel|empreendimento)|quero saber mais.*empreendimento)\b/.test(value);
  if (!strongIntent) return false;
  const onlyCommercialQuestion = asksCommercialValue(value)
    && !/\b(morar|investir|investimento|comprar|tenho interesse|quero conhecer|vi (?:um )?anuncio)\b/.test(value);
  return !onlyCommercialQuestion;
}

function firstContactOpening(context: AiTrainingContext): string {
  const configuredName = context.config?.persona && typeof context.config.persona.name === 'string'
    ? context.config.persona.name.trim()
    : '';
  return `Olá! Aqui é a ${configuredName || 'Nara'}, da Bossa 😊`;
}

function ensureFirstTurnIntroduction(reply: string, history: ChatMessage[], context: AiTrainingContext): string {
  if (assistantMessages(history).length > 0) return reply.trim();
  const value = normalizeText(reply);
  const hasGreeting = /^(ola|oi|bom dia|boa tarde|boa noite)\b/.test(value);
  const hasIdentity = /\bnara\b/.test(value) && /\bbossa\b/.test(value);
  if (hasGreeting && hasIdentity) return reply.trim();
  return `${firstContactOpening(context)} ${reply.trim()}`.trim();
}

function repeatedReply(reply: string, history: ChatMessage[]): boolean {
  const value = normalizeText(reply);
  return Boolean(value) && assistantMessages(history).slice(-6).some((message) => normalizeText(message) === value);
}

function moneyTokens(value: string): string[] {
  return value.match(/R\$\s*\d[\d.\s]*(?:,\d{1,2})?|\b\d+(?:[.,]\d+)?\s*(?:milh(?:ao|ão|oes|ões)|mil)\b/giu) ?? [];
}

function nextQualificationQuestion(history: ChatMessage[]): string {
  const value = normalizeText(userText(history));
  const hasPurpose = /\b(morar|moradia|investir|investimento|revenda|aluguel)\b/.test(value);
  const hasEnterprise = /\b(flow|alma)\b/.test(value);
  const hasTypology = /\b\d+\s*(?:quartos?|suites?)\b|\b(?:dois|tres|quatro)\s*(?:quartos?|suites?)\b/.test(value);
  const hasBudget = moneyTokens(userText(history)).length > 0;
  const hasDeadline = /\b(agora|essa semana|este mes|proximo mes|ainda este ano|em \d+ meses|sem pressa|prazo)\b/.test(value);
  const hasDecision = /\b(esposa|marido|companheira|companheiro|familia|filhos|decido sozinho|so eu|socio|socia)\b/.test(value);

  if (!hasPurpose) return 'Perfeito, eu te ajudo! Você está buscando um imóvel para morar ou para investir?';
  if (!hasEnterprise) return 'Legal! Você chegou pelo anúncio do Flow Aptos ou do Alma Seahouses?';
  if (!hasTypology) return 'Entendi. Você procura quantos quartos ou suítes?';
  if (!hasBudget) return 'Para eu separar as opções mais adequadas, em qual faixa de investimento você pretende ficar?';
  if (!hasDeadline) return 'Você pensa em comprar em qual prazo?';
  if (!hasDecision) return 'Mais alguém participa dessa decisão com você?';
  return 'Ótimo, já entendi o seu perfil. Prefere conversar por ligação, videochamada ou agendar uma visita?';
}

function exactManagerCorrection(history: ChatMessage[], context: AiTrainingContext): string {
  const lastUser = normalizeText(lastUserText(history));
  if (!lastUser) return '';
  const exact = (context.examples ?? []).find((item) => (
    normalizeText(item.user_message) === lastUser
    && item.rating === 'corrected'
    && Boolean(item.correction?.trim())
  ));
  return exact?.correction?.trim() ?? '';
}

function managerRejectedSameReply(turn: AiTurn, history: ChatMessage[], context: AiTrainingContext): boolean {
  const lastUser = normalizeText(lastUserText(history));
  const reply = normalizeText(turn.reply);
  return (context.examples ?? []).some((item) => (
    item.rating === 'rejected'
    && normalizeText(item.user_message) === lastUser
    && normalizeText(item.assistant_message) === reply
  ));
}

function moneyKey(value: string): string {
  const normalized = normalizeText(value).replace(/r\$\s*/, '').trim();
  const multiplier = /milhao|milhoes/.test(normalized) ? 1_000_000 : /\bmil\b/.test(normalized) ? 1_000 : 1;
  const numericPart = normalized.match(/\d+(?:[.,]\d+)?(?:\.\d{3})*/)?.[0] ?? '';
  if (!numericPart) return '';
  const parsed = multiplier === 1 && numericPart.includes('.')
    ? Number(numericPart.replace(/\./g, '').replace(',', '.'))
    : Number(numericPart.replace(',', '.'));
  return Number.isFinite(parsed) ? String(Math.round(parsed * multiplier)) : '';
}

function hasUngroundedMoney(reply: string, history: ChatMessage[], context: AiTrainingContext): boolean {
  const tokens = moneyTokens(reply);
  if (!tokens.length) return false;
  const corpus = [
    ...history.filter((item) => item.role === 'user').map((item) => item.content),
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
  if (!CLIENT_STAGES.includes(turn.stage as typeof CLIENT_STAGES[number])) turn.stage = 'ia';
  return turn;
}

function enforceNaraTriage(turn: AiTurn, lead: Lead, history: ChatMessage[], context: AiTrainingContext): AiTurn {
  normalizeClientDecision(turn);
  const lastUser = lastUserText(history);
  const routed = routeOutsideBuyerProfile(history);
  const buyerConfirmed = hasExplicitBuyerIntent(lead, history, context);
  const askedBefore = hasTriageQuestionBeenAsked(history, context);
  const triageAttempts = assistantMessages(history)
    .filter((message) => looksLikeTriageQuestion(message, context)).length;
  const canKeepGeneralPriceRange = asksCommercialValue(lastUser)
    && !asksProtectedCommercialDetail(lastUser)
    && isGeneralPriceRangeReply(turn.reply)
    && !hasUngroundedMoney(turn.reply, history, context);

  if (!buyerConfirmed && !routed) {
    if (canKeepGeneralPriceRange) {
      turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
      turn.classification = 'frio';
      turn.score = Math.min(turn.score, 20);
      turn.stage = 'ia';
      turn.summary = 'Contato recebeu somente uma faixa geral de preço; a intenção de compra ainda não foi confirmada.';
      turn.next_action = 'Continuar a conversa sem liberar unidade específica, tabela, disponibilidade ou condição de pagamento até confirmar a intenção.';
      turn.handoff = false;
      turn.attachment_ids = [];
      turn.extracted.budget = '';
      turn.extracted.typology = '';
      turn.extracted.deadline = '';
      turn.extracted.decision_maker = '';
      return turn;
    }
    if (triageAttempts >= 2) {
      turn.reply = ensureFirstTurnIntroduction(
        'Vou encaminhar você para um atendente da Bossa; por favor, diga em uma frase qual é o assunto para o time continuar.',
        history,
        context,
      );
      turn.classification = 'frio';
      turn.score = Math.min(turn.score, 20);
      turn.stage = 'ia';
      turn.summary = 'A intenção de compra não foi confirmada após duas tentativas de triagem.';
      turn.next_action = 'Transferir para atendimento humano e identificar o assunto solicitado.';
      turn.handoff = true;
      turn.attachment_ids = [];
      turn.extracted.budget = '';
      turn.extracted.typology = '';
      turn.extracted.deadline = '';
      turn.extracted.decision_maker = '';
      return turn;
    }

    const learnedCorrection = exactManagerCorrection(history, context);
    const safeLearnedCorrection = learnedCorrection && !moneyTokens(learnedCorrection).length && learnedCorrection.includes('?');
    const question = askedBefore ? alternativeTriageQuestion() : configuredTriageQuestion(context);
    turn.reply = safeLearnedCorrection ? learnedCorrection : askedBefore ? `Entendi. ${question}` : question;
    turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
    turn.classification = 'frio';
    turn.score = Math.min(turn.score, 20);
    turn.stage = 'ia';
    turn.summary = asksCommercialValue(lastUser)
      ? 'Contato pediu informação comercial, mas a intenção de compra ainda não foi confirmada.'
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
    turn.classification = 'frio';
    turn.score = Math.min(turn.score, 20);
    turn.summary = outsideBuyerSummary(history);
    turn.next_action = outsideBuyerNextAction(history);
    turn.reply = ensureFirstTurnIntroduction(outsideBuyerReply(history), history, context);
    return turn;
  }

  const learnedCorrection = exactManagerCorrection(history, context);
  if (learnedCorrection) turn.reply = learnedCorrection;

  if (managerRejectedSameReply(turn, history, context) || repeatedReply(turn.reply, history)) {
    turn.reply = nextQualificationQuestion(history);
    turn.stage = 'ia';
    turn.attachment_ids = [];
    turn.summary = 'Possível comprador identificado; a conversa avançou para a próxima pergunta ainda não respondida.';
    turn.next_action = 'Continuar a qualificação sem repetir perguntas.';
  }

  if (hasUngroundedMoney(turn.reply, history, context)) {
    turn.reply = nextQualificationQuestion(history);
    turn.stage = 'ia';
    turn.handoff = false;
    turn.attachment_ids = [];
    turn.summary = 'Possível comprador identificado, mas não havia preço atual e comprovado na base para informar.';
    turn.next_action = 'Continuar a qualificação e confirmar a informação comercial vigente antes de informar valores.';
  }

  turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
  return turn;
}

function supportsExplicitCaching(model: string): boolean {
  return /^gpt-5\.(?:[6-9]|\d{2,})/.test(model);
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

function pricingFor(model: string) {
  if (model.startsWith('gpt-5.6-luna')) return { input: 1, cached: 0.1, write: 1.25, output: 6 };
  if (model.startsWith('gpt-5.6-terra')) return { input: 2.5, cached: 0.25, write: 3.125, output: 15 };
  if (model.startsWith('gpt-5.6-sol') || model === 'gpt-5.6') return { input: 5, cached: 0.5, write: 6.25, output: 30 };
  if (model.startsWith('gpt-5-mini')) return { input: 0.25, cached: 0.025, write: 0.25, output: 2 };
  return { input: 2.5, cached: 0.25, write: 3.125, output: 15 };
}

function buildUsage(
  data: OpenAiResponse,
  options: RequestOptions,
  preflightInputTokens: number,
  preflightEstimated: boolean,
): AiUsageRecord {
  const inputTokens = Math.max(0, data.usage?.input_tokens ?? preflightInputTokens);
  const cachedTokens = Math.max(0, data.usage?.input_tokens_details?.cached_tokens ?? 0);
  const cacheWriteTokens = Math.max(0, data.usage?.input_tokens_details?.cache_write_tokens ?? 0);
  const outputTokens = Math.max(0, data.usage?.output_tokens ?? 0);
  const reasoningTokens = Math.max(0, data.usage?.output_tokens_details?.reasoning_tokens ?? 0);
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
  const longContext = inputTokens > LONG_CONTEXT_THRESHOLD;
  const pricing = pricingFor(data.model || options.model);
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  const cost = (
    uncachedTokens * pricing.input * inputMultiplier
    + cachedTokens * pricing.cached * inputMultiplier
    + cacheWriteTokens * pricing.write * inputMultiplier
    + outputTokens * pricing.output * outputMultiplier
  ) / 1_000_000;

  return {
    request_kind: options.requestKind,
    model: data.model || options.model,
    request_id: data.id || null,
    input_tokens: inputTokens,
    cached_tokens: cachedTokens,
    cache_write_tokens: cacheWriteTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    preflight_input_tokens: preflightInputTokens,
    preflight_estimated: preflightEstimated,
    estimated_cost_usd: Number(cost.toFixed(8)),
    fallback_used: options.fallbackUsed,
    compacted: options.compacted,
    long_context: longContext,
  };
}

async function fetchJson(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function requestPayload(options: RequestOptions) {
  const settings = openAiSettings();
  const is56 = supportsExplicitCaching(options.model);
  const payload: Record<string, unknown> = {
    model: options.model,
    store: false,
    input: options.input,
    reasoning: { effort: options.reasoningEffort || settings.reasoningEffort },
    max_output_tokens: options.maxOutputTokens || settings.maxOutputTokens,
    text: options.schema
      ? {
          verbosity: options.verbosity || settings.verbosity,
          format: {
            type: 'json_schema',
            name: 'bossa_crm_ai_turn',
            description: 'Resposta de WhatsApp, classificação comercial e arquivos selecionados para o contato.',
            strict: true,
            schema: options.schema,
          },
        }
      : { verbosity: options.verbosity || settings.verbosity },
  };
  if (is56 && options.promptCacheKey) {
    payload.prompt_cache_key = options.promptCacheKey;
    payload.prompt_cache_options = { mode: 'explicit', ttl: '30m' };
  }
  return payload;
}

async function countInputTokens(options: RequestOptions): Promise<{ tokens: number; estimated: boolean }> {
  const payload = requestPayload(options);
  const settings = openAiSettings();
  const countPayload = {
    model: payload.model,
    input: payload.input,
    text: payload.text,
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchJson('https://api.openai.com/v1/responses/input_tokens', countPayload, settings.timeoutMs);
      const data = await response.json() as CountResponse;
      if (!response.ok || !Number.isFinite(data.input_tokens)) {
        throw new Error(data.error?.message || `OpenAI token count HTTP ${response.status}`);
      }
      return { tokens: Math.max(0, Number(data.input_tokens)), estimated: false };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const approximate = Math.max(1, Math.ceil(JSON.stringify(countPayload).length / 4));
  console.warn('[openai token count] usando estimativa local após falha', lastError);
  return { tokens: approximate, estimated: true };
}

async function runRequest(options: RequestOptions): Promise<RequestResult> {
  const settings = openAiSettings();
  const payload = requestPayload(options);
  const preflight = await countInputTokens(options);
  const response = await fetchJson('https://api.openai.com/v1/responses', payload, settings.timeoutMs);
  const data = await response.json() as OpenAiResponse;
  if (!response.ok) throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);
  if (data.status === 'incomplete') {
    const reason = data.incomplete_details?.reason;
    throw new Error(`A OpenAI não concluiu a resposta${reason ? `: ${reason}` : '.'}`);
  }
  if (data.status === 'failed' || data.status === 'cancelled') {
    throw new Error(data.error?.message || 'A OpenAI não conseguiu concluir a resposta.');
  }
  const refusal = extractRefusal(data);
  if (refusal) throw new Error(`A OpenAI recusou esta resposta: ${refusal}`);
  const outputText = extractOutputText(data);
  if (!outputText) throw new Error('A OpenAI respondeu sem texto utilizável.');
  return {
    data,
    outputText,
    usage: buildUsage(data, options, preflight.tokens, preflight.estimated),
  };
}

async function runWithRetryAndFallback(
  buildOptions: (model: string, fallbackUsed: boolean) => RequestOptions,
): Promise<RequestResult> {
  const settings = openAiSettings();
  const errors: string[] = [];
  const primaryOptions = buildOptions(settings.primary, false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runRequest(primaryOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${settings.primary} tentativa ${attempt + 1}: ${message}`);
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  if (settings.fallback && settings.fallback !== settings.primary) {
    try {
      return await runRequest(buildOptions(settings.fallback, true));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${settings.fallback}: ${message}`);
    }
  }

  throw new OpenAiExhaustedError(errors);
}

async function summarizeOldHistory(
  history: ChatMessage[],
): Promise<{ summary: string; recent: ChatMessage[]; usage: AiUsageRecord }> {
  const old = history.slice(0, -RECENT_MESSAGES_TO_KEEP);
  const recent = history.slice(-RECENT_MESSAGES_TO_KEEP);
  const transcript = old.map((item) => `${item.role === 'user' ? 'Contato' : 'Atendimento'}: ${item.content}`).join('\n');
  const result = await runWithRetryAndFallback((model, fallbackUsed) => ({
    model,
    input: [
      inputMessage('system', 'Resuma a conversa de atendimento imobiliário em português brasileiro. Preserve fatos, empreendimento citado, finalidade, tipologia, orçamento, prazo, decisores, objeções, promessas, pendências e o que já foi perguntado ou respondido. Não invente nada. Produza um bloco curto de contexto, sem saudação.'),
      inputMessage('user', transcript),
    ],
    requestKind: 'summary',
    compacted: true,
    fallbackUsed,
    maxOutputTokens: 700,
    reasoningEffort: 'low',
    verbosity: 'low',
  }));
  console.info(`[openai context] compactação aplicada: ${old.length} mensagens resumidas; ${recent.length} mantidas integralmente.`);
  return { summary: result.outputText.trim(), recent, usage: result.usage };
}

export async function generateAiTurn(
  lead: Lead,
  history: ChatMessage[],
  context: AiTrainingContext = {},
): Promise<AiTurn | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (history.length === 0) return null;

  const usageRecords: AiUsageRecord[] = [];
  let compacted = false;
  let summary = '';
  let effectiveHistory = history;

  if (history.length > MAX_HISTORY_BEFORE_COMPACTION) {
    const compact = await summarizeOldHistory(history);
    summary = compact.summary;
    effectiveHistory = compact.recent;
    usageRecords.push(compact.usage);
    compacted = true;
  }

  const result = await runWithRetryAndFallback((model, fallbackUsed) => {
    const explicitCache = supportsExplicitCaching(model);
    return {
      model,
      input: buildRequestInput(lead, context, effectiveHistory, summary, explicitCache),
      schema: outputSchema(lead),
      requestKind: 'response',
      compacted,
      fallbackUsed,
      promptCacheKey: explicitCache ? `bossa:${lead.organization_id}:${lead.kind}:v1` : undefined,
    };
  });
  usageRecords.push(result.usage);

  try {
    const parsed = JSON.parse(result.outputText) as AiTurn;
    const allowedIds = new Set((context.files ?? []).map((file) => file.id));
    parsed.attachment_ids = [...new Set(parsed.attachment_ids ?? [])]
      .filter((id) => allowedIds.has(id))
      .slice(0, 3);
    const finalTurn = lead.kind === 'cliente'
      ? enforceNaraTriage(parsed, lead, effectiveHistory, context)
      : parsed;
    finalTurn.usage_records = usageRecords;
    finalTurn.model_used = result.usage.model;
    finalTurn.compacted = compacted;
    return finalTurn;
  } catch (error) {
    if (error instanceof OpenAiExhaustedError) throw error;
    throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.');
  }
}
