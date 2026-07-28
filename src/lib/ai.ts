import type { Lead } from './types';

export interface AiTurn {
  reply: string;
  classification: string;
  score: number;
  stage: string;
  summary: string;
  next_action: string;
  handoff: boolean;
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
  required: ['reply', 'classification', 'score', 'stage', 'summary', 'next_action', 'handoff', 'extracted'],
} as const;

function personaInstructions(lead: Lead): string {
  const shared = `Você atende pelo WhatsApp da Bossa Empreendimentos. Responda sempre em português brasileiro, de forma humana, natural, calorosa e objetiva. Use no máximo duas frases curtas e uma pergunta por mensagem. Nunca invente preço, disponibilidade, metragem, condição de pagamento, prazo de entrega ou informação que não esteja no histórico. Quando faltar uma informação comercial específica, diga que o time da Bossa vai confirmar. Analise toda a conversa, produza a resposta e também classifique o contato. Contato: ${lead.name}. Etapa atual: ${lead.stage}. Dados atuais: ${JSON.stringify(lead.metadata || {})}.`;

  if (lead.kind === 'cliente') {
    return `${shared}\n\nVocê é Nara, atendente digital dos clientes finais da Bossa. Os produtos são Flow Aptos e Alma Seahouses. Descubra com leveza: finalidade da compra, empreendimento de interesse, tipologia, faixa de investimento, prazo para comprar e quem participa da decisão.\n\nClassificação e etapas permitidas para clientes:\n- ia: ainda coletando informações ou interesse inicial.\n- qualificado: interesse real e dados suficientes para o comercial agir, especialmente finalidade, faixa de investimento ou capacidade financeira e prazo; também quando pede proposta, disponibilidade ou demonstra intenção concreta.\n- agendado: visita, ligação ou videochamada com data ou compromisso claramente combinado.\n- negociacao e fechado nunca devem ser definidos automaticamente; nesses casos mantenha a etapa atual e sinalize handoff.\nUse classificação frio, morno, quente, agendamento ou sem_interesse. Marque handoff=true quando houver pedido de proposta, negociação, reclamação, questão sensível ou quando o comercial humano deva assumir. Ao qualificar ou agendar, a automação será pausada após esta resposta.`;
  }

  return `${shared}\n\nVocê é o Plantão, atendente digital dos corretores parceiros da Bossa. Seja prático, próximo e comercial. Identifique imobiliária, CRECI, região, se o corretor tem cliente ativo, qual empreendimento interessa e qual ajuda precisa. Estimule o corretor a oferecer Flow Aptos e Alma Seahouses sem pressionar.\n\nClassificação e etapas permitidas para corretores:\n- n1 / cadastrado: contato novo, perfil ainda incompleto ou sem interação comercial.\n- n2 / curioso: pediu material, tabela ou informações, mas ainda não informou cliente ativo.\n- n3 / ativo: possui cliente ativo, apresenta os produtos ou demonstra atuação comercial concreta.\n- n4 / negociando: existe cliente em visita, proposta, reserva, escolha de unidade ou negociação; marque handoff=true.\n- n5 / parceiro: relacionamento recorrente, histórico de vendas ou parceria consolidada; use somente quando houver evidência clara e marque handoff=true.\nUse classificação cadastrado, curioso, ativo, negociando ou parceiro. Ao chegar em n4 ou n5, o atendimento automático será pausado para o time comercial continuar.`;
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
      instructions: personaInstructions(lead),
      input,
      max_output_tokens: 700,
      text: {
        format: {
          type: 'json_schema',
          name: 'bossa_crm_ai_turn',
          description: 'Resposta de WhatsApp e classificação comercial do contato.',
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
    return JSON.parse(outputText) as AiTurn;
  } catch {
    throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.');
  }
}
