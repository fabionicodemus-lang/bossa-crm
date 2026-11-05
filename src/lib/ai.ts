import { extractNaraPrompt } from './nara-prompt-config';
import { buildNaraConversationInstructions, NARA_CONVERSATION_POLICY, NARA_COMMERCIAL_SAFETY_POLICY } from './nara-conversation-policy';
import { protectNaraCommercialReply, naraReplyNeedsCommercialProtection } from './nara-commercial-guard';
import { applyNaraFinancialHandoff } from './nara-sales-handoff';
import { agendaActionFromText, shouldHandleAgendaTurn } from './nara-agenda-intent';
import { collapseRepeatedNaraIntroductions, hasNaraIntroduction, naraConversationLanguage, naraLanguageSwitchReply, removeRepeatedNaraIntroduction, requestedNaraLanguage } from './nara-language';
import { aiModelRoutingSettings, pricingFor, selectAiModels, supportsExplicitCaching, type AiWorkload } from './openai-model-routing';
import { isAssistedSaleSignal, isBrokerRoutingSignal, isPostSaleRoutingSignal, isSupplierRoutingSignal } from './nara-contact-routing';
import type { NaraDynamicTurnContext } from './nara-dynamic-context';
import type { NaraForeignContext } from './nara-exterior';
import type { NaraOperationalContext } from './nara-operations';
import { asksProtectedCommercialDetail, isGeneralPriceRangeReply } from './nara-price-levels';
import type { NaraCommercialTurnContext } from './nara-unit-queries';
import { adDevelopment, adOriginInstruction } from './nara-first-message';
import type { Lead } from './types';
import { declaredFirstName, declinedTopics, enterpriseInFocus, explicitHumanRequest, purchaseIntent, refusesHandoff, qualificationPaused } from './nara-conversation-signals';

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
  commercial?: NaraCommercialTurnContext | null;
  dynamic?: NaraDynamicTurnContext | null;
  foreign?: NaraForeignContext | null;
  operational?: NaraOperationalContext | null;
  supervisor_instruction?: string | null;
  /** Allowed only by the authenticated training simulator; never set by WhatsApp. */
  model_override?: 'gpt-6.1-sol' | 'gpt-6.1-terra';
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
  /** Runtime only: set by the agenda service after a successful appointment write. Never supplied by the model. */
  agenda_confirmed?: boolean;
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
  light: string;
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

export class NaraReplyGuardrailError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`A resposta da Nara não passou pelos guardrails: ${violations.join(', ')}.`);
    this.name = 'NaraReplyGuardrailError';
    this.violations = violations;
  }
}

const CLIENT_CLASSIFICATIONS = ['frio', 'morno', 'quente', 'agendamento', 'sem_interesse'] as const;
const CLIENT_STAGES = ['novo', 'ia', 'qualificado', 'agendado', 'negociacao', 'fechado'] as const;
const BROKER_CLASSIFICATIONS = ['cadastrado', 'curioso', 'ativo', 'negociando', 'parceiro'] as const;
const BROKER_STAGES = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;
const LONG_CONTEXT_THRESHOLD = 272_000;
const MAX_HISTORY_BEFORE_COMPACTION = 25;
const RECENT_MESSAGES_TO_KEEP = 10;
// Legacy utility limit only; live replies are never truncated to a word count.
const LEGACY_REPLY_WORD_LIMIT = 45;

const NARA_TRIAGE_DEFAULTS: Record<string, string> = {
  triagem_objetivo: 'Identifique silenciosamente o tipo de contato ao longo da conversa, sem transformar a triagem em uma etapa visível antes de entregar valor.',
  triagem_pergunta_inicial: 'Não pergunte se o contato quer comprar ou tratar de outro assunto. Presuma que todo contato é um possível comprador e já comece entregando valor.',
  triagem_comprador: 'Sinais de interesse em empreendimento, planta, entrega, pagamento, moradia, veraneio ou investimento permitem seguir naturalmente como possível comprador, sem exigir confirmação formal.',
  triagem_corretor: 'Se for corretor, imobiliária ou parceiro comercial, não conduza como cliente final. Direcione ao Plantão da Bossa e marque transferência para o canal correto.',
  triagem_cliente_atual: 'Se já for cliente, comprador, proprietário ou morador e o assunto for contrato, boleto, obra, assistência, entrega, documentação ou pós-venda, não qualifique. Acolha, registre o assunto e transfira ao setor responsável.',
  triagem_outros: 'Fornecedor, prestador, candidato a vaga, currículo, imprensa, vizinho, cobrança, spam e assuntos institucionais não seguem para condução comercial. Colete somente o mínimo necessário e transfira ou encerre educadamente.',
  triagem_saida: 'Só mude o atendimento quando o próprio contato disser que é corretor, imobiliária, fornecedor, já cliente ou que não quer comprar. Nunca faça pergunta de triagem.',
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
    ...aiModelRoutingSettings(),
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT?.trim() || 'medium',
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

function trainingInstructions(context: AiTrainingContext, customer = true): string {
  const persona = recordText(context.config?.persona);
  const { general } = splitKnowledge(context.config?.knowledge);
  const savedPrompt = extractNaraPrompt(context.config?.knowledge);
  const finalPrompt = customer ? buildNaraConversationInstructions(savedPrompt) : savedPrompt;
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
  // Todo contato é tratado como possível comprador (decisão do Fábio, 20/10/2026):
  // a pergunta de triagem configurada não é mais oferecida ao modelo.
  const rules = {
    ...NARA_TRIAGE_DEFAULTS,
    ...triage,
    triagem_pergunta_inicial: NARA_TRIAGE_DEFAULTS.triagem_pergunta_inicial,
    triagem_saida: NARA_TRIAGE_DEFAULTS.triagem_saida,
  };
  const configured = Object.entries(rules)
    .map(([key, value]) => `${key.replace('triagem_', '').replaceAll('_', ' ')}: ${value}`)
    .join('\n');

  return `\n\nPROTEÇÕES DE TRIAGEM E ROTEAMENTO\n${configured}\n\nREGRAS OPERACIONAIS:\n- Na primeira resposta da conversa, cumprimente e apresente-se como Nara, da Bossa. Não diga espontaneamente que é IA.\n- Leia o histórico inteiro e avance a conversa. Nunca repita uma pergunta que o contato já respondeu nem envie a mesma mensagem duas vezes.
- Se o contato disser que viu anúncio, demonstrou interesse, citou Flow/Alma/Soul ou fizer perguntas comerciais compatíveis com esses empreendimentos, trate a conversa como imobiliária e não pergunte “comprar ou outro assunto?”. Isso NÃO significa passar para humano: preço, tabela, fotos, vídeo, folder, localização e planta são atendidos pela Nara enquanto não houver entrada, parcelas, condições de pagamento, proposta/negociação ou pedido de atendimento humano. Visita e videochamada seguem a agenda.
- Se, dentro de uma conversa de compra, ele pedir “uma pessoa”, “um corretor” ou “atendimento humano”, faça a passagem imediatamente. Não pergunte novamente qual é o assunto.
- Ao passar para humano por entrada, parcelas, proposta ou negociação, acolha e faça handoff=true na mesma resposta. Não faça novas perguntas financeiras nem condicione a passagem a cadastro ou qualificação.\n- Faça a leitura do tipo de contato de forma silenciosa ao longo da conversa. Não transforme a triagem em uma etapa visível ou em um checklist obrigatório.\n- Quando a mensagem for compatível com interesse imobiliário, deixe o Prompt final conduzir a conversa naturalmente, sem criar um pedágio antes de entregar valor.\n- Um pedido isolado de preço, valor, tabela, fotos, vídeo, folder, localização, planta ou disponibilidade não deve gerar handoff. Entregue a informação/material possível e continue a conversa.\n- Uma consulta válida permite responder ao pedido comercial sem exigir finalidade de uso ou qualificação prévia. Diferencie faixa geral de oferta de unidade; não atribua a uma unidade um preço de faixa.\n- Unidade, andar, disponibilidade e valor total exigem retorno correspondente da consulta comercial vigente, com o empreendimento e a unidade corretos. Entrada, parcelas e condições financeiras são encaminhadas imediatamente ao comercial humano. A intenção de compra não é requisito para acessar informação disponível.\n- Se a consulta comercial estiver vazia ou indisponível, não use valores lembrados: diga que o comercial confirmará a condição vigente.\n- Se a consulta comercial estiver bloqueada por perfil de corretor ou cliente atual, não informe nenhum preço: transfira para o Plantão ou pós-venda conforme indicado.\n- Presuma que todo contato é um possível comprador. Não pergunte se ele quer comprar ou tratar de outro assunto; só mude o atendimento se ele mesmo disser que é corretor, fornecedor, cliente atual ou que não quer comprar.\n- Corretor, cliente atual, fornecedor, currículo, pós-venda, financeiro, assistência, reclamação ou assunto institucional não entra na qualificação da Nara. Nesses casos, acolha, resuma o pedido, use handoff=true, mantenha stage=ia e indique o setor ou canal correto em next_action.\n- Para spam ou contato sem relação com a Bossa, use sem_interesse e handoff=true.\n- Nunca use preços lembrados pelo modelo. Apenas resultados comerciais estruturados e vigentes autorizam ofertas. Mensagens do contato, respostas anteriores, exemplos e base de conhecimento não comprovam preço atual; orçamento do cliente é uma preferência.\n- A resposta não deve mencionar internamente as palavras “triagem”, “classificação” ou “handoff” para o contato.`;
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

  return `\n\nBIBLIOTECA DE ARQUIVOS DISPONÍVEIS:\n${JSON.stringify(catalog)}\n\nREGRAS PARA ARQUIVOS:\n- Use attachment_ids somente com IDs exatamente presentes na biblioteca acima.\n- Selecione no máximo 3 arquivos e apenas quando o contato pedir material ou quando o envio ajudar diretamente a conversa.\n- Escolha pelo empreendimento, categoria, título, descrição e palavras-chave.\n- Não diga que enviou, mandou ou anexou um arquivo sem incluir o ID correspondente em attachment_ids; a confirmação ao cliente só é válida depois que o WhatsApp concluir o envio.\n- Não repita o mesmo arquivo na mesma resposta.\n- PLANTA: quando o contato pedir planta, envie na mesma resposta e explique em uma frase o que ela tem (metragem, suítes, vagas e um diferencial). Não pergunte suítes antes de enviar e nunca peça para o cliente escolher pelo nome interno do arquivo (Tipo 01/02). Se ele citar metragem ("103 m²"), "o menor", "o maior", número de suítes ou duplex, envie a planta correspondente; se não citar nada, envie as plantas padrão do empreendimento. O sistema confere a escolha pelo catálogo oficial.\n- Depois de enviar material, só faça pergunta de qualificação se o contato estiver conversando com abertura; se ele disse que só está pesquisando, que não sabe ou que não quer responder, não pergunte.\n- Pedir foto, vídeo, folder, book, tabela, localização ou planta NÃO gera handoff por si só.\n- Arquivos de tabela, proposta ou simulação sem vínculo verificável com a versão vigente não são enviados automaticamente. Apresente as condições pela consulta comercial atual; plantas e materiais institucionais continuam disponíveis.\n- Se não existir material adequado, use attachment_ids vazio e diga que o comercial pode complementar; não finja que o arquivo foi enviado.\n- Não envie arquivos em uma conversa que já exige handoff imediato, salvo quando for um material público claramente solicitado e seguro.`;
}

/**
 * Comercialização do Alma liberada antes do registro da incorporação, no formato
 * de reserva (decisão do Fábio, 04/11/2026). Fica depois do Prompt final para
 * substituir qualquer restrição antiga salva no CRM.
 */
const NARA_ALMA_COMMERCIAL_RULES = `\n\nALMA SEAHOUSES — COMERCIALIZAÇÃO LIBERADA (FORMATO RESERVA). ESTA REGRA SUBSTITUI QUALQUER INSTRUÇÃO ANTERIOR, NO PROMPT FINAL, NA BASE DE CONHECIMENTO OU NAS CORREÇÕES, QUE PROÍBA OU LIMITE A VENDA, OS PREÇOS OU AS CONDIÇÕES DO ALMA:
- O Alma está liberado para atendimento comercial completo, igual ao Flow e ao Soul: apresente o projeto, o valor total vigente e unidades disponíveis a partir das consultas do sistema. Pedidos sobre entrada, parcelas, anuais, chaves financeiras e demais condições de pagamento seguem imediatamente para a equipe comercial, como nos demais empreendimentos.
- Quando o cliente quiser avançar com uma unidade do Alma, fale em "pedido de reserva" e encaminhe para a equipe comercial. Não trate o pedido como reserva concluída, compra fechada, unidade bloqueada ou contrato assinado.
- Explique que preço, validade da condição e efeitos da eventual reserva dependem da tabela vigente e dos termos formalmente confirmados pela equipe. Não prometa unilateralmente que a reserva garante preço, unidade ou condição por prazo indefinido.
- Não antecipe prazos de cartório nem afirme registro concluído ou "sairá nas próximas semanas". Se perguntarem pelo registro da incorporação, o comercial deverá confirmar e apresentar a situação documental atual, sem suposições; a Nara não substitui essa verificação.
- Pedido de reserva, escolha de unidade específica ou proposta segue para a equipe comercial com handoff=true, como nos demais empreendimentos.
- Distância oficial do Alma ao mar: 300 m, conforme confirmado por Fábio. Se alguma informação antiga disser 350 m, use 300 m. Não prometa tempo exato de caminhada.`;

/**
 * Conversa humana (rodada 3 de testes, 04/11/2026): responder a pergunta concreta, não pedir
 * permissão para responder, não interrogar quem só pesquisa, respeitar recusa de encaminhamento
 * e manter o empreendimento em discussão.
 */
/**
 * Fatos fixos dos empreendimentos (site oficial e decisões do Fábio). A base de conhecimento
 * salva no CRM pode estar vazia; sem isto a Nara dizia não saber a entrega do Flow ou as metragens do Alma.
 */
const NARA_PRODUCT_FACTS = `\n\nFATOS CONFIRMADOS DOS EMPREENDIMENTOS (USE COM SEGURANÇA; PREÇO E DISPONIBILIDADE VÊM DA CONSULTA COMERCIAL):
- Soul Residence: em Itapema, pronto para morar (entregue em dezembro de 2023, no prazo); apartamentos de 2 suítes com cerca de 70 m².
- Flow Aptos: em Balneário Perequê, Porto Belo, a 800 m do mar; 57 apartamentos; entrega prevista para novembro de 2027. Apartamentos de 2 suítes com 62 m² (Tipos 2 e 3) e 73 m² (Tipo 1, com lavabo); duplex de 3 suítes com 93 m² e 117,7 m², living com pé-direito duplo; lazer em dois pavimentos e rooftop. Parcelamento direto pode chegar a 60 vezes.
- Alma Seahouses: em Balneário Perequê, Porto Belo, a 300 m do mar (não é frente mar); 30 andares, só 2 apartamentos por andar; entrega prevista para julho de 2030. Apartamentos de 3 suítes com 103 m² (Tipo 02) e 114 m² (Tipo 01), com living integrado à cozinha, lavabo e churrasqueira a carvão; duplex de 4 suítes com 145 m² e 168 m²; todas as plantas com 2 vagas. Parcelamento direto pode chegar a 100 vezes.
- A Bossa atua desde 2017 e já entregou Jazz (2019, antes do prazo) e Soul (dezembro de 2023, no prazo). Flow e Alma ainda não foram entregues: estão em desenvolvimento, com entregas previstas para 2027 e 2030. Não diga que todos os projetos lançados já foram entregues.
- Se perguntarem algo que não está aqui nem nas consultas (ex.: vagas do Soul, trajeto plano), diga com naturalidade que vai confirmar com o time, sem inventar.`;

const NARA_HUMAN_CONVERSATION_RULES = `\n\nCONVERSA HUMANA — REGRAS FIXAS (VALEM ACIMA DO PROMPT FINAL QUANDO HOUVER CONFLITO):
- Responda primeiro, de forma direta, a pergunta concreta da última mensagem (trajeto, ladeira, foto, fachada, metragem, valor total). Só depois, se fizer sentido, acrescente algo.
- Nunca peça permissão para responder ("Posso verificar...?", "Quer que eu veja...?"): responda direto. Se a informação não estiver na sua base, diga isso uma vez, com naturalidade, junto com o que você sabe.
- Se o contato disser que só está pesquisando, que não sabe, que não decidiu ou que não quer responder, não faça pergunta de qualificação (suítes, finalidade, prazo, faixa) nesta resposta: entregue o que ele pediu e pare.
- Nunca repita uma pergunta que o contato recusou ou disse não saber.
- Não peça desculpas repetidamente. Se errou, corrija em uma frase, sem se justificar.
- Ao surgir entrada, parcela, condição de pagamento, proposta ou negociação, chame o comercial na mesma resposta. Sem esses sinais ou pedido de pessoa, não transfira só por curiosidade. Se ele disser "não encaminha", "sem corretor", "volto depois" ou "não precisa me chamar", use handoff=false e respeite.
- Pedido de uma pessoa só para confirmar uma informação não é intenção de compra: encaminhe, mas não classifique como quente.
- Mantenha o empreendimento em discussão: se a conversa passou para o Soul, responda sobre o Soul, não volte ao Alma.
- Só chame o contato pelo nome se ele disser claramente como se chama. Palavras como "robô", "pessoa" ou o nome de uma cidade nunca são nome.
- Se perguntarem se você é robô ou IA: diga de forma leve que é a Nara, assistente virtual da Bossa, e siga respondendo a dúvida.
- Se houver objeção sobre risco de comprar na planta, acolha a preocupação e explique fatos verificáveis: entregas do Jazz e Soul, andamento do Flow e do Alma e patrimônio de afetação quando aplicável. Histórico não elimina riscos nem garante entrega futura; nunca responda com um aviso de preço.
- Quando o cliente perguntar por entrada física do apartamento (porta, hall, circulação, sala), não trate como entrada financeira. Se ele pedir condições alternativas de pagamento, responda que precisam de análise; não troque isso por uma lista de unidades.
- Ao apresentar plantas do Flow, diga que existem dois tipos com 62 m² (tipos 2 e 3); evite repetir a mesma metragem de forma confusa.
- Apresente somente o valor total validado solicitado. Não ofereça plano financeiro espontaneamente. Entrada, mensais, reforços, saldo nas chaves, índices, juros e condições personalizadas são tratados pelo comercial humano, com passagem imediata, sem simulação ou aprovação pela Nara.`;

/**
 * Retorna somente o prefixo fixo. Dados do lead e histórico são adicionados depois
 * do breakpoint de cache por buildRequestInput().
 */
export function buildAiInstructions(lead: Lead, context: AiTrainingContext): string {
  const shared = 'Você atende pelo WhatsApp da Bossa Empreendimentos. Responda integralmente no idioma predominante usado pelo contato: português em português, espanhol em espanhol. Nunca misture os dois idiomas na mesma resposta, salvo nomes próprios. Seja humano, natural, caloroso e objetivo. Na primeira resposta, apresente-se como Nara, da Bossa, no mesmo idioma do contato. Prefira mensagens curtas, com o espaço necessário para responder todas as dúvidas; faça perguntas somente quando úteis. Nunca invente preço, disponibilidade, metragem, condição de pagamento, prazo de entrega ou informação que não esteja em uma fonte válida para o turno. Leia o histórico inteiro, reconheça o que já foi respondido e faça a conversa avançar; nunca repita a mesma pergunta ou resposta. Quando faltar uma informação comercial específica, diga que o time da Bossa pode complementar. Analise toda a conversa, produza a resposta, classifique o contato e selecione arquivos somente quando fizer sentido.';
  const training = trainingInstructions(context, lead.kind === 'cliente');
  const files = fileInstructions(context.files ?? []);

  if (lead.kind === 'cliente') {
    const triage = triageInstructions(context);
    return `${shared}\n\nVocê é Nara, atendente digital dos clientes finais da Bossa. Apresente-se como Nara, da Bossa, na primeira resposta e depois converse naturalmente, sem repetir a apresentação. Os produtos ativos são Soul, Flow Aptos e Alma Seahouses. O Prompt final define o ritmo, o tom, a ordem da conversa e o tamanho das mensagens. As regras fixas abaixo existem somente para segurança, roteamento, classificação, arquivos e passagem para humanos; não recrie uma sequência rígida de etapas.${training}${triage}${NARA_PRODUCT_FACTS}${NARA_ALMA_COMMERCIAL_RULES}${NARA_HUMAN_CONVERSATION_RULES}\n\nQUALIFICAÇÃO E CONDUÇÃO COMERCIAL\nUse o contexto e o Prompt final para descobrir naturalmente as informações úteis ao comercial, sem checklist e sem ordem obrigatória. Aproveite tudo o que o contato já informou e escolha a próxima ação que realmente faça a conversa avançar. Pode enviar book, planta, imagem, vídeo de obra ou material institucional quando o comprador pedir ou quando isso ajudar diretamente. Evite despejar vários arquivos sem necessidade.\n\nClassificação e etapas permitidas para clientes:\n- ia: conversa inicial ou ainda coletando informações.\n- qualificado: interesse real e dados suficientes para o comercial agir, especialmente finalidade, faixa de investimento ou capacidade financeira e prazo; também quando pede proposta ou demonstra intenção concreta de avançar. Um pedido isolado de informação não encerra a conversa nem pausa a automação.\n- agendado: somente após confirmação da gravação na agenda pelo sistema; sugerir ou aceitar um horário ainda não confirma agendamento.\n- negociacao e fechado nunca devem ser definidos automaticamente; nesses casos mantenha a etapa atual e sinalize handoff.\nUse somente as classificações frio, morno, quente, agendamento ou sem_interesse. Marque handoff=true quando houver pedido explícito de atendimento humano, entrada, parcelas, condições de pagamento, proposta, negociação, reclamação, questão sensível ou contato fora do perfil comprador. Não marque handoff apenas por preço, tabela, fotos, vídeo, folder, localização, planta ou disponibilidade. Visita e videochamada seguem a agenda: não transfira só porque o contato escolheu uma modalidade; o sistema confirma a gravação ou encaminha uma pendência. A passagem financeira independe de completar a qualificação.${files}\n\n${NARA_CONVERSATION_POLICY}\n\n${NARA_COMMERCIAL_SAFETY_POLICY}`;
  }

  return `${shared}\n\nVocê é o Plantão da Bossa e atende os corretores parceiros, que vendem nossos empreendimentos: cada corretor é um parceiro valioso. Converse como um colega de mercado simpático, empático e ágil, que gosta de ajudar e quer que o corretor venda. Apresente-se como o Plantão da Bossa (nunca como Nara), sem inventar nome de pessoa. As regras abaixo valem acima do Prompt final. Mensagens curtas de WhatsApp e no máximo uma pergunta por mensagem.\n\nABERTURA DA CONVERSA:\n- Corretor NÃO cadastrado (ver "Corretor cadastrado: não" nos dados dinâmicos): cumprimente, apresente-se como o Plantão da Bossa e pergunte apenas como pode ajudar. Não pergunte de qual empreendimento ele quer material.\n- Corretor cadastrado: cumprimente pelo primeiro nome informado nos dados dinâmicos e, se ele ainda não disse o que precisa, pergunte como pode ajudar. Se ele já disse, vá direto ao pedido.\n\nO PLANTÃO RESOLVE SOZINHO: entregue tudo o que o corretor pedir e estiver disponível — tabela de preços, unidades disponíveis, valores, entrada, parcelas e formas de pagamento (pelas consultas comerciais do sistema), book, plantas, imagens, vídeos, andamento de obra, diferenciais e informações dos empreendimentos. Use a biblioteca de arquivos, a base de conhecimento e as consultas comerciais deste turno; nunca invente arquivo, preço, unidade ou disponibilidade.\n- Comissão padrão: 5% sobre o valor da venda. Pode informar sempre que perguntarem.\n- Condição diferente da tabela: diga que sim, a gente negocia, e explique que conseguimos desconto quando a entrada é maior que a da tabela ou quando o parcelamento é mais curto que o da tabela. Não prometa percentual de desconto; o valor final é fechado com a Taís quando houver cliente/proposta.\n\nQUANDO PASSAR PARA A TAÍS (somente nestes casos): (1) o corretor tem um cliente concreto (cliente interessado, visita, reserva, escolha de unidade para o cliente); (2) proposta ou negociação de um cliente; (3) pedido de comissão diferente dos 5%. Nesses casos, diga com simpatia que vai chamar a Taís agora para cuidar disso com ele e marque handoff=true na mesma resposta; se tiver material que ajude, pode enviar junto. Em qualquer outro assunto, não passe para a Taís: o Plantão dá conta. Nunca reserve apartamento, nunca aceite proposta e nunca combine comissão diferente de 5%.\n\nClassificação e etapas permitidas para corretores:\n- n1 / cadastrado: contato novo, perfil ainda incompleto ou sem interação comercial.\n- n2 / curioso: pediu material, tabela, valores, condições ou informações, mas ainda não falou de cliente.\n- n3 / ativo: falou de cliente ativo ou demonstra atuação comercial concreta; marque handoff=true para a Taís.\n- n4 / negociando: existe cliente em visita, proposta, reserva, escolha de apartamento ou negociação; marque handoff=true.\n- n5 / parceiro: relacionamento recorrente, histórico de vendas ou parceria consolidada; use somente quando houver evidência clara (não marque handoff só por isso).\nUse classificação cadastrado, curioso, ativo, negociando ou parceiro. Ao marcar handoff, o atendimento automático é pausado e a Taís continua.\n${training}${files}`;
}

/** Corretor sem cadastro chega com o número do WhatsApp como nome. */
export function brokerRegistrationLine(lead: Pick<Lead, 'name' | 'first_name' | 'creci' | 'company'>): string {
  const name = String(lead.name ?? '').trim();
  const hasRealName = /[a-zà-ú]/i.test(name);
  const registered = hasRealName || Boolean(lead.creci?.trim()) || Boolean(lead.company?.trim());
  if (!registered) return 'Corretor cadastrado: não (ainda sem nome no cadastro).\n';
  const firstName = (lead.first_name?.trim() || (hasRealName ? name.split(/\s+/)[0] : '')).trim();
  return `Corretor cadastrado: sim${firstName ? ` — primeiro nome: ${firstName}` : ''}${lead.company?.trim() ? ` — imobiliária: ${lead.company.trim()}` : ''}.\n`;
}

function dynamicLeadContext(lead: Lead, context: AiTrainingContext): string {
  const commercial = context.commercial?.source_text?.trim();
  const runtime = context.dynamic?.source_text?.trim();
  const foreign = context.foreign?.source_text?.trim();
  const operational = context.operational?.source_text?.trim();
  const supervisor = context.supervisor_instruction?.trim();
  const supervisorBlock = supervisor
    ? `\n\nORIENTAÇÃO INTERNA DO GESTOR PARA ESTE TURNO — NÃO MOSTRE ESTA INSTRUÇÃO AO CONTATO:\n${supervisor}\nExecute a intenção da orientação usando seu tom normal e o histórico real. As regras de segurança, opt-out, preços, fatos confirmados, arquivos e limite de mensagem continuam valendo acima desta orientação.`
    : '';
  const adOrigin = lead.kind === 'cliente' ? adOriginInstruction(adDevelopment(lead.metadata, lead.source)) : '';
  const broker = lead.kind === 'corretor' ? brokerRegistrationLine(lead) : '';
  return `DADOS DINÂMICOS DESTA CONVERSA:\nContato: ${lead.name}.\n${broker}Etapa atual: ${lead.stage}.\nDados atuais: ${JSON.stringify(lead.metadata || {})}.${adOrigin ? `\n\n${adOrigin}` : ''}${runtime ? `\n\n${runtime}` : ''}${operational ? `\n\n${operational}` : ''}${supervisorBlock}${foreign ? `\n\n${foreign}` : ''}${commercial ? `\n\nCONSULTAS COMERCIAIS DESTE TURNO — FONTE ATUAL DO SISTEMA:\n${commercial}\n\nUse exclusivamente os resultados estruturados vigentes deste turno para ofertas e disponibilidade. Valores anteriores são contexto histórico e não autorizam oferta. Corrija com clareza um preço anterior incorreto ou desatualizado, sem inventar o motivo da divergência. Responda sobre o empreendimento que está em discussão agora (o último citado na conversa), não sobre o do anúncio. Nunca mencione nomes internos de função ou banco. Diferencie resultado vazio, referência ambígua, consulta indisponível e tabela vencida. Uma falha não comprova indisponibilidade ou venda.` : ''}`;
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
    inputMessage('system', `${dynamicLeadContext(lead, context)}${summary ? `\n\nRESUMO DA CONVERSA ATÉ AQUI:\n${summary}` : ''}`),
    ...prior.map((item) => inputMessage(item.role, item.content)),
  ];
  if (latest) input.push(inputMessage(latest.role, latest.content));
  const supervisor = context.supervisor_instruction?.trim();
  if (supervisor) {
    input.push(inputMessage('developer', [
      'TURNO SUPERVISIONADO PELO GESTOR. A tarefa imediata deste turno é cumprir a orientação abaixo.',
      'Não faça a pergunta padrão de triagem, não retome um fluxo anterior e não trate a orientação como fala do contato.',
      'Responda ao contato de forma natural, coerente com o histórico, executando a orientação agora.',
      'Se a orientação pedir imagens, fotos, folder, plantas ou outro material disponível, selecione os attachment_ids correspondentes.',
      'Mantenha os guardrails de opt-out, fatos confirmados, preços, disponibilidade, segurança e limite de mensagem.',
      `ORIENTAÇÃO: ${supervisor}`,
    ].join('\n')));
  }
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

type OutsideBuyerDestination = 'plantao' | 'pos_venda' | 'suprimentos' | 'equipe' | 'venda_assistida';

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

function isEmploymentInquiry(text: string): boolean {
  // A parking space ("uma vaga") is a normal buyer preference, not a job inquiry.
  return /\b(?:curriculo|emprego|estagio|processo seletivo|recursos humanos|trabalhar (?:com|para) voces|trabalhar na bossa|candidat[oa] a (?:uma )?vaga|vagas? (?:de|para) (?:emprego|trabalho|pedreiro|engenheir[oa]|servente|estagio|assistente))\b/.test(text);
}

function outsideBuyerDestination(history: ChatMessage[]): OutsideBuyerDestination | null {
  const userMessages = history
    .filter((item) => item.role === 'user')
    .map((item) => item.content);
  const current = routingText(lastUserText(history));
  if (/\b(nao sou (?:um |uma )?cliente|nao comprei|quero comprar)\b/.test(current)) return null;
  const fullHistory = userMessages.map(routingText).join('\n');

  if (userMessages.some(isAssistedSaleSignal)) return 'venda_assistida';
  if (userMessages.some(isBrokerRoutingSignal)) return 'plantao';
  if (userMessages.some(isPostSaleRoutingSignal)) return 'pos_venda';
  if (userMessages.some(isSupplierRoutingSignal)) return 'suprimentos';
  if (/\b(fornecedor|prestador|cobranca|imprensa)\b/.test(fullHistory) || isEmploymentInquiry(fullHistory)) return 'equipe';

  return null;
}

function routeOutsideBuyerProfile(history: ChatMessage[]): boolean {
  return outsideBuyerDestination(history) !== null;
}

function runtimeVariable(context: AiTrainingContext, key: keyof NonNullable<AiTrainingContext['dynamic']>['values']): string {
  return context.dynamic?.values[key]?.trim() ?? '';
}

function outsideBuyerReply(history: ChatMessage[], context: AiTrainingContext): string {
  const destination = outsideBuyerDestination(history);
  const current = routingText(lastUserText(history));
  const consultant = runtimeVariable(context, 'consultant_on_duty_name');
  if (destination === 'venda_assistida') {
    return 'Como você veio indicado por um corretor, vou registrar a parceria e passar seu atendimento ao comercial. Qual é o nome do corretor e da imobiliária?';
  }
  if (destination === 'plantao') {
    const phone = runtimeVariable(context, 'partners_on_call_phone');
    if (phone) return `O Plantão da Bossa atende pelo ${phone}. Vou direcionar você${consultant ? ` para ${consultant}` : ''} continuar.`;
    return 'Vou direcionar você para o Plantão da Bossa, que atende corretores parceiros.';
  }
  if (destination === 'pos_venda') {
    const requests = history.filter((item) => item.role === 'user').map((item) => normalizeText(item.content)).join(' ');
    const unit = requests.match(/\b(?:unidade|apto|apartamento)\s*(?:n(?:umero)?\s*)?(\d{2,4})\b/)?.[1] ?? '';
    const boleto = /\b(?:boleto|segunda via|emitir|vencimento)\b/.test(requests);
    const topic = boleto ? 'segunda via do boleto' : /\b(?:garantia|infiltracao|vazamento|assistencia tecnica)\b/.test(requests)
      ? 'assistência técnica' : '';
    const answer = boleto ? 'Eu não consigo emitir o boleto diretamente por aqui. ' : '';
    if (topic && unit) return answer + 'O pedido de ' + topic + ' da unidade ' + unit + ' será direcionado à Cíntia, do pós-venda.';
    if (topic) return answer + 'Vou direcionar seu pedido de ' + topic + ' à Cíntia, do pós-venda. Qual é o número da sua unidade?';
    if (unit) return 'Vou direcionar seu pedido à Cíntia, do pós-venda, para a unidade ' + unit + '. Qual assunto você precisa resolver?';
    return 'Vou direcionar você à Cíntia, do pós-venda. Qual é o assunto e o número da sua unidade?';
  }
  if (destination === 'suprimentos') {
    const phone = runtimeVariable(context, 'supplies_phone');
    return phone
      ? 'Esse assunto é do setor de suprimentos da Bossa, que atende pelo ' + phone + '. Vou direcionar sua apresentação para o setor responsável.'
      : 'Esse assunto é do setor de suprimentos da Bossa. Vou direcionar seu contato para a equipe responsável; pode enviar o nome da empresa e a apresentação por aqui.';
  }
  const phone = /\b(fornecedor|prestador|suprimento)\b/.test(current)
    ? runtimeVariable(context, 'supplies_phone')
    : isEmploymentInquiry(current)
      ? runtimeVariable(context, 'hr_phone')
      : /\b(imprensa|marketing|midia)\b/.test(current)
        ? runtimeVariable(context, 'marketing_phone')
        : runtimeVariable(context, 'administration_phone');
  if (phone) return `A equipe responsável atende pelo ${phone}. Vou encaminhar seu pedido para o setor correto.`;
  return 'Vou encaminhar você para a equipe responsável da Bossa; por favor, diga em uma frase qual atendimento precisa.';
}

function outsideBuyerSummary(history: ChatMessage[]): string {
  const destination = outsideBuyerDestination(history);
  if (destination === 'plantao') return 'Contato se identificou como corretor ou imobiliária e deve continuar pelo Plantão.';
  if (destination === 'venda_assistida') return 'Possível comprador informou que veio indicado por corretor ou imobiliária; a venda deve preservar a parceria.';
  if (destination === 'pos_venda') return 'Contato indicou que já é cliente e precisa de atendimento de pós-venda.';
  if (destination === 'suprimentos') return 'Fornecedor deseja apresentar serviços ou produtos ao setor de suprimentos.';
  return 'Contato precisa de atendimento da equipe responsável fora da esteira de compradores.';
}

function outsideBuyerNextAction(history: ChatMessage[]): string {
  const destination = outsideBuyerDestination(history);
  if (destination === 'plantao') return 'Continuar o atendimento pelo Plantão no pipeline de corretores.';
  if (destination === 'venda_assistida') return 'Registrar o corretor e a imobiliária de origem e encaminhar ao comercial sem conduzir venda direta.';
  if (destination === 'pos_venda') return 'Encaminhar para o pós-venda e identificar o assunto informado pelo cliente.';
  if (destination === 'suprimentos') return 'Encaminhar ao setor de suprimentos e preservar a apresentação fornecida.';
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
    || (/interesse.*comprar/.test(value) && /assunto|outro atendimento/.test(value))
    || (/buscas.*(?:departamento|apartamento).*comprar/.test(value) && /otro asunto/.test(value))
    || (/looking to buy.*apartment/.test(value) && /another.*matter/.test(value));
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

function hasConsentedAgendaInterest(history: ChatMessage[]): boolean {
  const latest = lastUserText(history);
  if (agendaActionFromText(latest) === 'cancel') return false;
  if (refusesHandoff(latest) && !explicitHumanRequest(latest)) return false;
  // A real request or an answer to the immediately preceding agenda offer is
  // engagement. Questions about a video, moving dates and refusals are not.
  return shouldHandleAgendaTurn(history, latest);
}

function hasExplicitBuyerIntent(lead: Lead, history: ChatMessage[], context: AiTrainingContext): boolean {
  if (lead.metadata?.triage_confirmed === true) return true;
  if (contextualBuyerReply(history, context)) return true;

  const value = normalizeText(userText(history));
  // Todo contato é tratado como possível comprador (Fábio, 20/10/2026): citar um empreendimento
  // junto de qualquer assunto comercial já confirma a conversa de compra.
  const projectConversation = /\b(flow|alma|soul)\b/.test(value)
    && /\b(vi|anuncio|interesse|gostei|gostamos|interessad[oa]|conhecer|distribuicao|ambientes|lazer|areas comuns|foto|fotos|imagem|video|planta|plantas|tabela|preco|valor|valores|pagamento|localizacao|obra|entrega|entrada|parcelas?|quanto|menor|maior|total|metragem|m2|suites?|fachada|reserva|condicao|me interesa|vi el|vi la|imagenes|plano|tabla|precio|pago|ubicacion|cuanto)\b/.test(value);
  if (projectConversation) return true;

  const strongIntent = /\b(para morar|quero morar|pretendo morar|moradia|para investir|quero investir|pretendo investir|investimento|renda com aluguel|para revenda|quero comprar|pretendo comprar|busco (?:um |uma )?(?:apartamento|imovel)|procuro (?:um |uma )?(?:apartamento|imovel)|tenho interesse(?: no| na| em)?|quero conhecer (?:o |a )?(?:flow|alma)|vi (?:um )?anuncio.*(?:flow|alma|apartamento|imovel|empreendimento)|vi (?:um )?anuncio(?: de voces| da bossa)?|quero saber mais.*empreendimento|quiero comprar|busco (?:un )?(?:departamento|apartamento|inmueble)|me interesa|quiero conocer (?:el )?(?:flow|alma)|vi (?:un )?anuncio|para vivir|para invertir|inversion)\b/.test(value);
  if (!strongIntent) return false;
  const onlyCommercialQuestion = asksCommercialValue(value)
    && !/\b(morar|investir|investimento|comprar|tenho interesse|quero conhecer|vi (?:um )?anuncio|vivir|invertir|inversion|quiero comprar|me interesa|quiero conocer|vi (?:un )?anuncio)\b/.test(value);
  return !onlyCommercialQuestion;
}

function isSpanishConversation(history: ChatMessage[]): boolean {
  return naraConversationLanguage(history) === 'es';
}

function isEnglishConversation(history: ChatMessage[]): boolean {
  return naraConversationLanguage(history) === 'en';
}

function declaredContactFirstName(text: string): string {
  return declaredFirstName(text);
}

function firstContactOpening(context: AiTrainingContext, history: ChatMessage[]): string {
  const configuredName = context.config?.persona && typeof context.config.persona.name === 'string'
    ? context.config.persona.name.trim()
    : '';
  const agentName = configuredName || 'Nara';
  const name = declaredContactFirstName(userText(history));
  return isEnglishConversation(history)
    ? `Hi${name ? `, ${name}` : ''}! I'm ${agentName} from Bossa.`
    : isSpanishConversation(history)
    ? `¡Hola${name ? `, ${name}` : ''}! Soy ${agentName}, de Bossa 😊`
    : `Oi${name ? `, ${name}` : ''}! Aqui é a ${agentName}, da Bossa 😊`;
}

export function ensureFirstTurnIntroduction(reply: string, history: ChatMessage[], context: AiTrainingContext): string {
  const clean = collapseRepeatedNaraIntroductions(reply);
  if (assistantMessages(history).length > 0) {
    // Uma conversa iniciada nunca deve apresentar novamente a Nara.
    const withoutIntro = removeRepeatedNaraIntroduction(clean);
    return withoutIntro || clean;
  }
  if (hasNaraIntroduction(clean)) {
    const firstName = declaredContactFirstName(userText(history));
    const opening = clean.slice(0, 130);
    if (firstName && !normalizeText(opening).includes(normalizeText(firstName))) {
      // Nome explicitamente informado: personalize a saudação existente,
      // sem anexar novamente "Aqui é a Nara".
      const language = naraConversationLanguage(history);
      const localizedGreeting = language === 'es' ? `¡Hola, ${firstName}!`
        : language === 'en' ? `Hi, ${firstName}!` : `Oi, ${firstName}!`;
      return clean.replace(/^\s*[¡!]?\s*(?:hola|oi|olá|ola|hi|hello)\b[!,.;]?\s*/iu, `${localizedGreeting} `);
    }
    return clean;
  }
  return collapseRepeatedNaraIntroductions(`${firstContactOpening(context, history)} ${clean}`);
}

function repeatedReply(reply: string, history: ChatMessage[]): boolean {
  const value = normalizeText(reply);
  return Boolean(value) && assistantMessages(history).slice(-6).some((message) => normalizeText(message) === value);
}

function nextQualificationQuestion(history: ChatMessage[]): string {
  const value = normalizeText(userText(history));
  const spanish = isSpanishConversation(history);
  // Cliente só pesquisando, ou que recusou responder, não recebe interrogatório.
  if (qualificationPaused(history)) {
    return spanish ? 'Perfecto, sin compromiso. Si quieres algo más, te respondo por aquí.' : 'Combinado, sem compromisso. Se quiser saber mais alguma coisa, te respondo por aqui.';
  }
  const declined = declinedTopics(history);
  const hasPurpose = /\b(morar|moradia|investir|investimento|revenda|aluguel|vivir|invertir|inversion|reventa|alquiler)\b/.test(value);
  const hasEnterprise = /\b(soul|flow|alma)\b/.test(value);
  const hasTypology = /\b\d+\s*(?:quartos?|suites?|habitaciones?)\b|\b(?:dois|tres|quatro|dos|tres|cuatro)\s*(?:quartos?|suites?|habitaciones?)\b/.test(value);
  const alreadyInvited = assistantMessages(history).some((reply) => /\b(?:videochamada|videollamada|visita presencial|conhecer pessoalmente)\b/.test(normalizeText(reply)));
  // A useful presentation is not gated by completing a financial questionnaire.
  if (hasEnterprise && (hasPurpose || hasTypology) && !alreadyInvited && !refusesHandoff(lastUserText(history))) {
    return spanish
      ? 'Podemos presentarte las plantas y la trayectoria de Bossa por videollamada. ¿Te gustaría conocerlo así?'
      : 'Podemos te apresentar as plantas e a trajetória da Bossa em uma videochamada. Faz sentido conhecer assim?';
  }
  if (!hasPurpose && !declined.has('finalidade')) return spanish ? '¿Lo buscas para vivir o para invertir?' : 'Você está buscando um imóvel para morar ou para investir?';
  if (!hasEnterprise) return spanish ? '¿Cuál te llamó más la atención: Soul, Flow o Alma?' : 'Legal! Qual te chamou mais atenção: o Soul, o Flow ou o Alma?';
  if (!hasTypology && !declined.has('suites')) return spanish ? '¿Cuántas habitaciones o suites buscas?' : 'Entendi. Você procura quantos quartos ou suítes?';
  return spanish ? 'Podemos seguir por aquí. ¿Qué aspecto del proyecto quieres comparar mejor?' : 'Podemos seguir por aqui. Qual ponto do projeto você quer comparar melhor?';
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

export function naraReplyWordCount(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function naraReplyQuestionCount(value: string): number {
  return value.match(/\?/g)?.length ?? 0;
}

export function truncateNaraReplyToWordLimit(value: string, limit = LEGACY_REPLY_WORD_LIMIT): string {
  const trimmed = value.trim();
  if (!trimmed || naraReplyWordCount(trimmed) <= limit) return trimmed;

  const completeSentences = [...trimmed.matchAll(/[^.!?]+[.!?]+(?:["'”’\)\]]*)/g)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  const finalQuestion = /\?\s*$/.test(trimmed) ? completeSentences.at(-1) : undefined;

  if (finalQuestion && naraReplyWordCount(finalQuestion) <= limit) {
    const kept: string[] = [];
    for (const sentence of completeSentences.slice(0, -1)) {
      const candidate = [...kept, sentence, finalQuestion].join(' ');
      if (naraReplyWordCount(candidate) > limit) break;
      kept.push(sentence);
    }
    return [...kept, finalQuestion].join(' ').trim();
  }

  const kept: string[] = [];
  for (const sentence of completeSentences) {
    const candidate = [...kept, sentence].join(' ');
    if (naraReplyWordCount(candidate) > limit) break;
    kept.push(sentence);
  }
  if (kept.length) return kept.join(' ').trim();

  const words = [...trimmed.matchAll(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)];
  const cutoffWord = words[Math.max(0, limit - 1)];
  if (!cutoffWord?.index && cutoffWord?.index !== 0) return trimmed;
  const end = cutoffWord.index + cutoffWord[0].length;
  const cut = trimmed.slice(0, end).replace(/[,:;\s]+$/g, '');
  return /[.!?]$/.test(cut) ? cut : `${cut}.`;
}

export function hasForbiddenScarcityClaim(value: string): boolean {
  const normalized = normalizeText(value);
  return /\b(acabou de ser (?:vendid[oa]|reservad[oa]|bloquead[oa])|acabou de (?:vender|reservar|bloquear)|foi (?:vendid[oa]|reservad[oa]) (?:agora|hoje|ha pouco))\b/.test(normalized);
}

export function naraReplyGuardrailViolations(value: string): string[] {
  const violations: string[] = [];
  if (!value.trim()) violations.push('resposta_vazia');
  if (hasForbiddenScarcityClaim(value)) violations.push('escassez_fabricada');
  return violations;
}

/** Archived commercial documents have no live quote/version binding in this catalog. */
export function isUnverifiedCommercialFile(file: AiFileOption): boolean {
  const labelText = (value: string) => normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const commercial = /\b(tabelas?|propostas?|simulac(?:ao|oes)|precos?|condic(?:ao|oes) comercia(?:l|is)|planos? de pagamento|valores? (?:das? |dos? )?(?:unidades|apartamentos)|price lists?|pricing|payment plans?|listas? de precios|cotizacion(?:es)?)\b/;
  const withoutNeutralReferences = (value: string) => labelText(value)
    // Technical tables and an explicit absence of prices do not turn a floor
    // plan into a commercial document. A separate positive price cue still wins.
    .replace(/\btabelas? (?:de )?(?:areas|medidas|metragens|ambientes|acabamentos)\b/g, ' ')
    .replace(/\b(?:sem|nao (?:contem|inclui|informa|apresenta)|without) (?:precos?|valores?|condic(?:ao|oes) comercia(?:l|is)|prices?|pricing)\b/g, ' ')
    .replace(/\b(?:consulte|consultar|solicite|solicitar|confira|verifique|consult|see)\b.*$/, ' ')
    .trim();
  // Evaluate fields separately: a neutral reference in the title must never
  // consume an independently commercial filename (or category).
  const labels = [file.category, file.title, file.original_name].map(withoutNeutralReferences);
  if (labels.some((label) => commercial.test(label))) return true;

  const institutional = /\b(plantas?|fachadas?|imagem|imagens|fotos?|videos?|folders?|books?|institucional|localizacao|memorial|floor plans?|brochures?)\b/.test(labels.join(' '));
  const describesCommercialContent = (value: string) => {
    const normalized = withoutNeutralReferences(value);
    if (!commercial.test(normalized)) return false;
    if (!institutional) return true;
    // Descriptions/keywords often say "consulte a tabela" or just "preço" for
    // retrieval. For an institutional asset, require evidence that the asset
    // itself contains commercial content, rather than any neutral reference.
    return /\b(?:com|contem|inclui|apresenta|exibe|mostra|traz|contendo|contains|includes|including|with)\b/.test(normalized)
      || /^(?:tabelas?|propostas?|simulac(?:ao|oes)|precos?|condic(?:ao|oes) comercia(?:l|is)|price lists?|pricing|payment plans?)\b/.test(normalized);
  };
  if ((file.description ?? '').split(/[.!?;,\n]+/).some(describesCommercialContent)) return true;
  const keywords = Array.isArray(file.trigger_keywords) ? file.trigger_keywords : [];
  return keywords.some((keyword) => {
    if (!institutional) return describesCommercialContent(keyword);
    const normalized = withoutNeutralReferences(keyword);
    return /\b(?:com|contem|inclui|contains|includes|with)\b/.test(normalized) && commercial.test(normalized);
  });
}

/** Validate commercial data without rewriting, shortening or truncating natural prose. */
export async function enforceNaraReplyGuardrails(
  turn: AiTurn,
  lead: Lead,
  history: ChatMessage[],
  context: AiTrainingContext,
): Promise<AiTurn> {
  const blockedIds = new Set((context.files ?? []).filter(isUnverifiedCommercialFile).map((file) => file.id));
  const blockedAttachment = turn.attachment_ids.some((id) => blockedIds.has(id));
  turn.attachment_ids = turn.attachment_ids.filter((id) => !blockedIds.has(id));
  if (blockedAttachment && !naraReplyNeedsCommercialProtection(turn.reply, history)) {
    const language = naraConversationLanguage(history);
    turn.reply = language === 'es' ? 'Los precios deben confirmarse en la consulta vigente.'
      : language === 'en' ? 'Prices need confirmation from the current quote.'
        : 'Os preços precisam ser confirmados pela consulta vigente.';
  }
  const protectedReply = protectNaraCommercialReply(turn.reply, history, context.commercial, { enterprise: lead.enterprise });
  turn.reply = protectedReply.reply;
  const lastQuestion = [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
  const normalizedQuestion = lastQuestion.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const requestedPrice = /\b(?:preco|valor|quanto custa|quanto fica|tabela|mensal|parcelas?|entrada|juros|desconto|pagamento|financiamento)\b/.test(normalizedQuestion);
  // Um trecho financeiro inseguro não pode transformar uma pergunta sobre
  // entrega/lazer em "não consegui confirmar o preço". Recupere somente os
  // fatos institucionais verificados, sem reaproveitar o valor descartado.
  if (lead.kind === 'cliente' && protectedReply.source === 'unconfirmed' && !requestedPrice
    && enterpriseInFocus(history) === 'flow') {
    const asksDelivery = /\b(?:quando (?:fica pronto|entrega|sera entregue)|prazo de entrega|previsao de entrega|entrega prevista)\b/.test(normalizedQuestion);
    const asksLeisure = /\b(?:lazer|areas comuns|rooftop)\b/.test(normalizedQuestion);
    if (asksDelivery || asksLeisure) {
      turn.reply = [
        asksDelivery ? 'O Flow tem entrega prevista para novembro de 2027.' : '',
        asksLeisure ? 'O projeto tem áreas de lazer em dois pavimentos e rooftop.' : '',
      ].filter(Boolean).join(' ');
    }
  }
  // Pedidos de reserva do Alma podem seguir para avaliação, porém nunca são
  // promessa de unidade/preço bloqueados nem de registro em prazo estimado.
  const asksAlmaReservationGuarantee = enterpriseInFocus(history) === 'alma'
    && /\b(?:quero reservar|gostaria de reservar|pedido de reserva|fazer (?:uma )?reserva)\b/.test(normalizedQuestion)
    && /\b(?:garant\w*|registro|incorporacao|prazo documental)\b/.test(normalizedQuestion);
  if (lead.kind === 'cliente' && asksAlmaReservationGuarantee) {
    const refused = refusesHandoff(lastQuestion) && !explicitHumanRequest(lastQuestion);
    turn.reply = 'Você pode solicitar uma reserva do Alma, mas não consigo garantir o preço de hoje, uma unidade reservada ou que o registro saia nas próximas semanas. '
      + (refused ? 'Podemos continuar por aqui, sem te encaminhar agora. Uma eventual reserva depende da confirmação documental e das condições pela equipe comercial.'
        : 'Vou chamar nossa equipe comercial para verificar a situação documental e as condições atuais antes de qualquer compromisso.');
    turn.handoff = !refused;
    turn.stage = refused ? 'ia' : 'qualificado';
    turn.classification = refused ? 'morno' : 'quente';
    turn.score = refused ? Math.min(59, turn.score) : Math.max(60, turn.score);
    turn.summary = 'Contato pediu reserva do Alma e garantias de preço ou registro; nenhuma reserva, condição ou prazo documental foi confirmado.'
      + (refused ? ' Recusou encaminhamento humano neste momento.' : '');
    turn.next_action = refused ? 'Respeitar a recusa de encaminhamento; responder apenas informações gerais, sem confirmar reserva, preço ou prazo documental.'
      : 'Equipe comercial deve verificar situação documental e condições atuais do pedido de reserva antes de qualquer compromisso.';
  }
  // Em uma pergunta dupla ("onde fica e quanto custa?"), a substituição
  // financeira segura não deve apagar a localização solicitada.
  const asksLocation = /\b(?:onde fica|localizacao|endereco|no mapa|donde queda|ubicacion|direccion|where is|location)\b/.test(normalizedQuestion);
  const locationFocus = enterpriseInFocus(history);
  if (lead.kind === 'cliente' && protectedReply.changed && asksLocation && locationFocus) {
    const locations = {
      flow: { intro: 'O Flow fica em Balneário Perequê, Porto Belo, a 800 m do mar.', map: 'Flow%20Aptos%20Porto%20Belo%20SC' },
      alma: { intro: 'O Alma fica em Balneário Perequê, Porto Belo, a 300 m do mar; não é frente-mar.', map: 'Alma%20Seahouses%20Porto%20Belo%20SC' },
      soul: { intro: 'O Soul fica em Itapema, a 500 m do mar.', map: 'Soul%20Residence%20Itapema%20SC' },
    };
    const location = locations[locationFocus];
    turn.reply = `${turn.reply.trim()}\n\n${location.intro} Você pode conferir no mapa: https://www.google.com/maps/search/?api=1&query=${location.map}`;
  }
  // A blindagem comercial pode substituir uma resposta que incluía o próximo
  // passo. Preserve o encaminhamento pedido por quem realmente quer fechar.
  const alreadyAcknowledgedHandoff = /\b(?:chamando|chamar|chama-la|acionando|acionar|encaminh\w*|direcion\w*|passando|conectar|contato com o comercial|contactando|llamando|llamar|connecting|ask (?:tais|our sales team))\b/.test(normalizeText(turn.reply));
  if (lead.kind === 'cliente' && turn.handoff && purchaseIntent(lastQuestion)
    && !refusesHandoff(lastQuestion) && !alreadyAcknowledgedHandoff) {
    const language = naraConversationLanguage(history);
    const focus = enterpriseInFocus(history);
    const action = language === 'es'
      ? `Voy a llamar a nuestro equipo comercial para confirmar la disponibilidad y avanzar contigo.${focus ? '' : ' ¿Cuál de los proyectos te interesa más?'}`
      : language === 'en'
        ? `I'll ask our sales team to confirm availability and help with the next steps.${focus ? '' : ' Which development interests you most?'}`
        : `Vou chamar nossa equipe comercial para confirmar a disponibilidade e avançar com você.${focus ? '' : ' Qual empreendimento te interessou mais?'}`;
    turn.reply = `${turn.reply.trim()}\n\n${action}`;
  }
  // Never fabricate a recent sale/reservation, even when the quoted price is valid.
  if (hasForbiddenScarcityClaim(turn.reply)) {
    const language = naraConversationLanguage(history);
    turn.reply = language === 'es'
      ? 'La disponibilidad necesita confirmación actual. Puedo ayudarte con la información del proyecto.'
      : language === 'en'
        ? 'Availability needs a current confirmation. I can help with the project information.'
        : 'A disponibilidade precisa de confirmação atual. Posso te ajudar com as informações do empreendimento.';
  }
  // A model cannot turn two delivered projects into a claim that every launch is finished.
  turn.reply = turn.reply.replace(
    /\b(?:entregou|concluiu)\s+todos\s+os\s+(?:projetos|empreendimentos)\s+que\s+lan[cç]ou\s*:?/giu,
    'já entregou Jazz e Soul; Flow e Alma seguem em andamento.',
  );
  // Both 62 m² Flow types are real; repeating the number as if it were an unfinished sentence is not.
  turn.reply = turn.reply.replace(
    /\bA de 62 m² e 62 m² não está comigo agora/giu,
    'As plantas dos tipos 2 e 3, ambas de 62 m², não estão comigo agora',
  );
  // The model can suggest an appointment, but only the agenda service can
  // confirm it. In the simulator no calendar write is performed at all.
  const appointmentText = normalizeText(turn.reply);
  const claimsAppointment = appointmentText.split(/[.!?\n]+/).some((sentence) =>
    /\b(?:visitas?|videochamada|ligacao|reuniao|horarios?|appointments?|meetings?|video call|call|videollamada|citas?|reunion|llamada)\b/.test(sentence)
    && /\b(?:agendad[oa]|marcad[oa]|confirmad[oa]|scheduled|booked|confirmed)\b/.test(sentence)
    && !/\b(?:nao|not|no esta|no ha sido|no se ha|isn't|isn’t|hasn't|hasn’t|without|sin)\b.{0,60}\b(?:agendad[oa]|marcad[oa]|confirmad[oa]|scheduled|booked|confirmed)\b/.test(sentence),
  );
  if (lead.kind === 'cliente' && lead.stage !== 'agendado' && turn.agenda_confirmed !== true
    && (turn.stage === 'agendado' || turn.classification === 'agendamento' || claimsAppointment)) {
    turn.stage = 'ia';
    if (turn.classification === 'agendamento') turn.classification = 'quente';
    if (claimsAppointment) {
      const language = naraConversationLanguage(history);
      turn.reply = language === 'es' ? 'Voy a verificar la disponibilidad para el horario que elegiste. La cita todavía no está confirmada.'
        : language === 'en' ? "I'll check availability for your preferred time. The appointment is not confirmed yet."
          : 'Vou verificar a disponibilidade para o horário que você escolheu. O agendamento ainda não está confirmado.';
    }
    turn.next_action = 'Verificar a agenda para o formato, dia e horário pedidos; confirmar somente após gravação bem-sucedida.';
  }
  if (lead.kind === 'cliente' && !routeOutsideBuyerProfile(history) && !asksAlmaReservationGuarantee) {
    const financialHandoff = applyNaraFinancialHandoff(turn, history);
    if (!financialHandoff && !lead.opt_out && turn.classification !== 'sem_interesse'
      && turn.agenda_confirmed !== true && hasConsentedAgendaInterest(history)) {
      // Wanting a presentation/visit is concrete engagement even without a
      // budget or buying deadline. It is not a confirmed calendar operation.
      turn.classification = 'quente';
      turn.score = Math.max(60, Number.isFinite(turn.score) ? turn.score : 60);
      if (!explicitHumanRequest(lastQuestion) && !purchaseIntent(lastQuestion)) turn.handoff = false;
    }
  }
  if (!turn.reply.trim()) throw new NaraReplyGuardrailError(['resposta_vazia']);
  if (lead.kind === 'cliente') {
    // A classificação e o score precisam concordar para a fila comercial:
    // frio 0–20, morno 21–59, quente 60–100, agendamento 80–100.
    turn.score = Number.isFinite(turn.score) ? Math.max(0, Math.min(100, Math.round(turn.score))) : 0;
    if (turn.classification === 'sem_interesse') turn.score = 0;
    if (turn.classification === 'frio') turn.score = Math.min(turn.score, 20);
    if (turn.classification === 'morno') turn.score = Math.max(21, Math.min(turn.score, 59));
    if (turn.classification === 'quente') turn.score = Math.max(60, turn.score);
    if (turn.classification === 'agendamento') turn.score = Math.max(80, turn.score);
    turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
  }
  return turn;
}

function normalizeClientDecision(turn: AiTurn): AiTurn {
  if (!CLIENT_CLASSIFICATIONS.includes(turn.classification as typeof CLIENT_CLASSIFICATIONS[number])) {
    turn.classification = turn.score >= 70 ? 'quente' : turn.score >= 30 ? 'morno' : 'frio';
  }
  if (!CLIENT_STAGES.includes(turn.stage as typeof CLIENT_STAGES[number])) turn.stage = 'ia';
  return turn;
}

export function enforceNaraTriage(turn: AiTurn, lead: Lead, history: ChatMessage[], context: AiTrainingContext): AiTurn {
  normalizeClientDecision(turn);
  const lastUser = lastUserText(history);
  // Mudança de idioma é uma solicitação legítima, não uma segunda falha de triagem.
  const requestedLanguage = requestedNaraLanguage(lastUser);
  if (requestedLanguage) {
    turn.reply = naraLanguageSwitchReply(requestedLanguage);
    turn.handoff = false;
    turn.stage = 'ia';
    turn.next_action = 'Responder à solicitação de idioma e continuar a conversa, sem encaminhamento humano.';
    turn.summary = 'Contato solicitou atendimento em outro idioma.';
    return turn;
  }
  const routed = routeOutsideBuyerProfile(history);
  if (!routed && applyNaraFinancialHandoff(turn, history)) {
    turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
    return turn;
  }
  const agendaInterest = hasConsentedAgendaInterest(history);
  const buyerConfirmed = agendaInterest || hasExplicitBuyerIntent(lead, history, context);
  const canKeepGeneralPriceRange = asksCommercialValue(lastUser)
    && !asksProtectedCommercialDetail(lastUser)
    && isGeneralPriceRangeReply(turn.reply)
    && Boolean(context.commercial?.calls.some((call) => call.result));

  if (canKeepGeneralPriceRange && !routed && !agendaInterest && !/\b(quero comprar|pretendo comprar|quero investir|quero morar|proposta|reserva)\b/.test(normalizeText(userText(history)))) {
    turn.classification = 'frio';
    turn.score = Math.min(turn.score, 20);
    turn.stage = 'ia';
    turn.handoff = false;
    turn.attachment_ids = [];
    turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
    return turn;
  }

  if (!buyerConfirmed && !routed) {
    if (canKeepGeneralPriceRange) {
      turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
      turn.classification = 'frio';
      turn.score = Math.min(turn.score, 20);
      turn.stage = 'ia';
      turn.summary = 'Contato recebeu somente uma faixa geral de preço; a intenção de compra ainda não foi confirmada.';
      turn.next_action = 'Continuar a conversa respondendo a dúvidas e consultando ofertas vigentes quando solicitado, sem qualificação obrigatória.';
      turn.handoff = false;
      turn.attachment_ids = [];
      turn.extracted.budget = '';
      turn.extracted.typology = '';
      turn.extracted.deadline = '';
      turn.extracted.decision_maker = '';
      return turn;
    }
    // Qualification affects classification only; it never blocks a requested quote.
    if (looksLikeTriageQuestion(turn.reply, context)) {
      turn.reply = nextQualificationQuestion(history);
      turn.attachment_ids = [];
    }
    turn.classification = 'frio'; turn.score = Math.min(turn.score, 20);
    turn.stage = 'ia'; turn.handoff = false;
    turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
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
    turn.reply = ensureFirstTurnIntroduction(outsideBuyerReply(history, context), history, context);
    return turn;
  }

  if (looksLikeTriageQuestion(turn.reply, context)) {
    turn.reply = nextQualificationQuestion(history);
    turn.handoff = false;
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

  // Valor sem fonte não troca mais a resposta inteira por uma pergunta de qualificação:
  // a revisão de guardrails remove só o número e preserva o restante da resposta.

  turn.reply = ensureFirstTurnIntroduction(turn.reply, history, context);
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
  const cacheSupported = supportsExplicitCaching(options.model);
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
  if (cacheSupported && options.promptCacheKey) {
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
  workload: AiWorkload = 'conversation',
  modelOverride?: AiTrainingContext['model_override'],
): Promise<RequestResult> {
  const configured = selectAiModels(openAiSettings(), workload);
  const primary = modelOverride || configured.primary;
  // Model comparisons must never silently fall back to Luna (or to the other
  // candidate), otherwise an apparently successful A/B run is not reproducible.
  const fallback = modelOverride ? null : configured.fallback;
  const errors: string[] = [];
  const primaryOptions = buildOptions(primary, false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runRequest(primaryOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${primary} tentativa ${attempt + 1}: ${message}`);
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  if (fallback) {
    try {
      return await runRequest(buildOptions(fallback, true));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${fallback}: ${message}`);
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
      inputMessage('system', 'Resuma a conversa de atendimento imobiliário em português brasileiro. Separe: (1) preferências e orçamento declarados pelo contato; (2) empreendimento e unidade em foco, respeitando mudanças; (3) dúvidas, recusas e perguntas já respondidas; (4) informações comerciais históricas, identificadas como não autorizadas para nova oferta; (5) ações efetivamente confirmadas e pendências. Uma alegação de desconto não é aprovação. Nunca transforme orçamento em preço, simulação em proposta aprovada ou promessa em ação executada. Não invente nada. Produza um bloco curto de contexto, sem saudação.'),
      inputMessage('user', transcript),
    ],
    requestKind: 'summary',
    compacted: true,
    fallbackUsed,
    maxOutputTokens: 700,
    reasoningEffort: 'low',
    verbosity: 'low',
  }), 'background');
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
  }, 'conversation', context.model_override);
  usageRecords.push(result.usage);

  try {
    const parsed = JSON.parse(result.outputText) as AiTurn;
    parsed.agenda_confirmed = false;
    const allowedIds = new Set((context.files ?? []).map((file) => file.id));
    parsed.attachment_ids = [...new Set(parsed.attachment_ids ?? [])]
      .filter((id) => allowedIds.has(id))
      .slice(0, 3);
    const finalTurn = lead.kind === 'cliente' && !context.supervisor_instruction?.trim()
      ? enforceNaraTriage(parsed, lead, effectiveHistory, context)
      : parsed;
    finalTurn.usage_records = usageRecords;
    finalTurn.model_used = result.usage.model;
    finalTurn.compacted = compacted;
    return lead.kind === 'cliente'
      ? await enforceNaraReplyGuardrails(finalTurn, lead, history, context)
      : finalTurn;
  } catch (error) {
    if (error instanceof OpenAiExhaustedError || error instanceof NaraReplyGuardrailError) throw error;
    throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.');
  }
}
