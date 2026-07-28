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
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    classification: {
      type: 'string',
      enum: ['frio', 'morno', 'quente', 'agendamento', 'sem_interesse', 'cadastrado', 'curioso', 'ativo', 'negociando', 'parceiro'],
    },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    stage: {
      type: 'string',
      enum: ['novo', 'ia', 'qualificado', 'agendado', 'negociacao', 'fechado', 'n1', 'n2', 'n3', 'n4', 'n5'],
    },
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
} as const;

function recordText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === 'string' && item.trim())
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join('\n');
}

function trainingInstructions(context: AiTrainingContext): string {
  const persona = recordText(context.config?.persona);
  const knowledge = recordText(context.config?.knowledge);
  const examples = (context.examples ?? []).slice(0, 20).map((item) => {
    if (item.rating === 'corrected' && item.correction) {
      return `Contato: ${item.user_message}\nResposta que estava errada: ${item.assistant_message}\nResposta ideal: ${item.correction}`;
    }
    if (item.rating === 'corrected' && item.notes) {
      return `Contato: ${item.user_message}\nResposta avaliada: ${item.assistant_message}\nOrientação do gestor: ${item.notes}`;
    }
    return `Contato: ${item.user_message}\nResposta aprovada: ${item.assistant_message}`;
  }).join('\n\n');

  const parts = [
    persona ? `PERSONALIDADE DEFINIDA PELO GESTOR:\n${persona}` : '',
    knowledge ? `BASE DE CONHECIMENTO DEFINIDA PELO GESTOR:\n${knowledge}` : '',
    context.config?.first_message ? `PRIMEIRA MENSAGEM PADRÃO:\n${context.config.first_message}` : '',
    examples ? `EXEMPLOS E CORREÇÕES DO TREINAMENTO:\n${examples}` : '',
  ].filter(Boolean);
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
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

function personaInstructions(lead: Lead, context: AiTrainingContext): string {
  const shared = `Você atende pelo WhatsApp da Bossa Empreendimentos. Responda sempre em português brasileiro, de forma humana, natural, calorosa e objetiva. Use no máximo duas frases curtas e uma pergunta por mensagem. Nunca invente preço, disponibilidade, metragem, condição de pagamento, prazo de entrega ou informação que não esteja no histórico. Quando faltar uma informação comercial específica, diga que o time da Bossa vai confirmar. Analise toda a conversa, produza a resposta, classifique o contato e selecione arquivos somente quando fizer sentido. Contato: ${lead.name}. Etapa atual: ${lead.stage}. Dados atuais: ${JSON.stringify(lead.metadata || {})}.`;
  const training = trainingInstructions(context);
  const files = fileInstructions(context.files ?? []);

  if (lead.kind === 'cliente') {
    return `${shared}\n\nVocê é Nara, atendente digital dos clientes finais da Bossa. Os produtos são Flow Aptos e Alma Seahouses. Descubra com leveza: finalidade da compra, empreendimento de interesse, tipologia, faixa de investimento, prazo para comprar e quem participa da decisão. Pode enviar book, planta, imagem, vídeo de obra ou material institucional quando o cliente pedir ou quando isso ajudar a avançar. Evite despejar vários arquivos sem necessidade.\n\nClassificação e etapas permitidas para clientes:\n- ia: ainda coletando informações ou interesse inicial.\n- qualificado: interesse real e dados suficientes para o comercial agir, especialmente finalidade, faixa de investimento ou capacidade financeira e prazo; também quando pede proposta, disponibilidade ou demonstra intenção concreta.\n- agendado: visita, ligação ou videochamada com data ou compromisso claramente combinado.\n- negociacao e fechado nunca devem ser definidos automaticamente; nesses casos mantenha a etapa atual e sinalize handoff.\nUse classificação frio, morno, quente, agendamento ou sem_interesse. Marque handoff=true quando houver pedido de proposta, negociação, reclamação, questão sensível ou quando o comercial humano deva assumir. Ao qualificar ou agendar, a automação será pausada após esta resposta.${training}${files}`;
  }

  return `${shared}\n\nVocê é o Plantão institucional dos corretores parceiros da Bossa. Nunca use nome próprio. Seja prático, direto e de igual para igual, como colega de mercado. Identifique imobiliária, CRECI, região, se o corretor tem cliente ativo, qual empreendimento interessa e qual ajuda precisa. O plantão pode enviar materiais públicos disponíveis na biblioteca, como tabela, book, plantas, imagens, vídeos e andamento de obra. Nunca negocie comissão, nunca confirme disponibilidade de unidade, nunca reserve unidade e nunca aceite proposta.\n\nClassificação e etapas permitidas para corretores:\n- n1 / cadastrado: contato novo, perfil ainda incompleto ou sem interação comercial.\n- n2 / curioso: pediu material, tabela ou informações, mas ainda não informou cliente ativo.\n- n3 / ativo: possui cliente ativo, apresenta os produtos ou demonstra atuação comercial concreta.\n- n4 / negociando: existe cliente em visita, proposta, reserva, escolha de unidade ou negociação; marque handoff=true.\n- n5 / parceiro: relacionamento recorrente, histórico de vendas ou parceria consolidada; use somente quando houver evidência clara e marque handoff=true.\nUse classificação cadastrado, curioso, ativo, negociando ou parceiro. Ao chegar em n4 ou n5, o atendimento automático será pausado para o time comercial continuar.${training}${files}`;
}

function extractOutputText(data: OpenAiResponse): string {
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
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
      instructions: personaInstructions(lead, context),
      input,
      max_output_tokens: 900,
      text: {
        format: {
          type: 'json_schema',
          name: 'bossa_crm_ai_turn',
          description: 'Resposta de WhatsApp, classificação comercial e arquivos selecionados para o contato.',
          strict: true,
          schema: OUTPUT_SCHEMA,
        },
      },
    }),
  });

  const data = await response.json() as OpenAiResponse;
  if (!response.ok) throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);

  const outputText = extractOutputText(data);
  if (!outputText) throw new Error('A OpenAI não devolveu conteúdo estruturado.');

  try {
    const parsed = JSON.parse(outputText) as AiTurn;
    const allowedIds = new Set((context.files ?? []).map((file) => file.id));
    parsed.attachment_ids = [...new Set(parsed.attachment_ids ?? [])].filter((id) => allowedIds.has(id)).slice(0, 3);
    return parsed;
  } catch {
    throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.');
  }
}
