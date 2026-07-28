import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Agent = 'nara' | 'plantao';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Persona = {
  name: string;
  role: string;
  tone: string;
  length: string;
  emojis: string;
  identity: string;
};

type AgentConfig = {
  persona: Persona;
  knowledge: Record<string, string>;
  first_message: string;
  active: boolean;
};

type ExampleRow = {
  id: string;
  scenario: string | null;
  user_message: string;
  assistant_message: string;
  rating: 'approved' | 'corrected' | 'rejected';
  correction: string | null;
  notes: string | null;
  created_at: string;
};

function isAgent(value: unknown): value is Agent {
  return value === 'nara' || value === 'plantao';
}

function defaultConfig(agent: Agent): AgentConfig {
  if (agent === 'plantao') {
    return {
      active: true,
      first_message: 'Oi, {{primeiro_nome}}! Aqui é o plantão da Bossa 😊 Em que posso te ajudar?',
      persona: {
        name: 'Plantão da Bossa',
        role: 'atendimento institucional para corretores parceiros fora do horário comercial',
        tone: 'direto, prático e de igual para igual, como colega de mercado',
        length: 'mensagens curtas e resolutivas',
        emojis: 'poucos e discretos',
        identity: 'Nunca usa nome próprio. Identifica-se somente como o plantão da Bossa e nunca finge ser uma pessoa específica.',
      },
      knowledge: {
        papel: 'Atende corretores parceiros, não clientes finais. O objetivo é destravar a venda com informação correta e rapidez.',
        materiais: 'Pode orientar sobre tabela, book, plantas, imagens, andamento de obra e informações públicas dos empreendimentos. Nunca inventa arquivo ou disponibilidade.',
        parceria: 'Recebe corretor novo, coleta nome, imobiliária, CRECI e necessidade. Encaminha cadastro e questões de comissão ao comercial.',
        limites: 'Não negocia comissão, não reserva unidade, não aceita proposta e não promete retorno em horário exato.',
        escalonamento: 'Escala imediatamente propostas, pedidos de reserva, exceções comerciais, reclamações, cliente aguardando e qualquer informação não confirmada.',
      },
    };
  }
  return {
    active: true,
    first_message: 'Oi, {{primeiro_nome}}! Aqui é a Nara, da Bossa 😊 Vi seu interesse no {{empreendimento}} — posso te ajudar a entender as opções?',
    persona: {
      name: 'Nara',
      role: 'consultora de relacionamento da Bossa Empreendimentos',
      tone: 'caloroso, próximo e objetivo, sem formalidade exagerada e sem gírias forçadas',
      length: 'no máximo duas frases e uma pergunta por mensagem',
      emojis: 'poucos e discretos',
      identity: 'Apresenta-se como Nara, da Bossa. Se perguntarem se é robô ou IA, não mente e oferece passar para um consultor humano.',
    },
    knowledge: {
      missao: 'Entender finalidade, tipologia, orçamento, decisor e prazo sem transformar a conversa em interrogatório.',
      empreendimentos: 'Flow Aptos e Alma Seahouses. Use somente informações confirmadas pela Bossa e nunca invente preços, disponibilidade, prazo ou condição comercial.',
      qualificacao: 'Identifique se é para morar ou investir, número de quartos, faixa de investimento, quem decide e quando pretende comprar.',
      agendamento: 'Quando houver interesse real, proponha visita ou videochamada e sinalize que o comercial dará continuidade.',
      escalonamento: 'Transfira quando houver proposta, pedido de reserva, negociação, reclamação, urgência, pergunta não confirmada ou preferência por atendimento humano.',
    },
  };
}

function normalizeConfig(agent: Agent, value: unknown): AgentConfig {
  const fallback = defaultConfig(agent);
  if (!value || typeof value !== 'object') return fallback;
  const input = value as Partial<AgentConfig>;
  const personaInput = input.persona && typeof input.persona === 'object' ? input.persona as Partial<Persona> : {};
  const knowledgeInput = input.knowledge && typeof input.knowledge === 'object' ? input.knowledge as Record<string, unknown> : {};
  const persona: Persona = {
    name: String(personaInput.name ?? fallback.persona.name).slice(0, 120),
    role: String(personaInput.role ?? fallback.persona.role).slice(0, 2000),
    tone: String(personaInput.tone ?? fallback.persona.tone).slice(0, 2000),
    length: String(personaInput.length ?? fallback.persona.length).slice(0, 500),
    emojis: String(personaInput.emojis ?? fallback.persona.emojis).slice(0, 500),
    identity: String(personaInput.identity ?? fallback.persona.identity).slice(0, 3000),
  };
  const knowledge = Object.fromEntries(Object.entries(knowledgeInput).slice(0, 30).map(([key, item]) => [key.slice(0, 80), String(item ?? '').slice(0, 10000)]));
  return {
    persona,
    knowledge: Object.keys(knowledge).length ? knowledge : fallback.knowledge,
    first_message: String(input.first_message ?? fallback.first_message).slice(0, 3000),
    active: input.active !== false,
  };
}

async function requireAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 }) } as const;
  const { data: membership } = await supabase.from('memberships').select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== 'admin') return { response: NextResponse.json({ error: 'Apenas administradores podem treinar os agentes.' }, { status: 403 }) } as const;
  return { supabase, user, organizationId: membership.organization_id } as const;
}

function databaseError(message: string) {
  const missing = message.includes('ai_agent_configs') || message.includes('ai_training_examples') || message.includes('schema cache');
  return NextResponse.json({ error: missing ? 'Execute o arquivo SQL 002_treinamento_nara_plantao.sql no Supabase antes de abrir esta tela.' : message }, { status: missing ? 503 : 400 });
}

async function loadConfig(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string, agent: Agent) {
  const { data, error } = await supabase.from('ai_agent_configs').select('persona,knowledge,first_message,active').eq('organization_id', organizationId).eq('agent', agent).maybeSingle();
  if (error) throw error;
  if (!data) return defaultConfig(agent);
  return normalizeConfig(agent, data);
}

async function loadExamples(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string, agent: Agent) {
  const { data, error } = await supabase.from('ai_training_examples').select('id,scenario,user_message,assistant_message,rating,correction,notes,created_at').eq('organization_id', organizationId).eq('agent', agent).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as ExampleRow[];
}

function buildPrompt(agent: Agent, config: AgentConfig, examples: ExampleRow[]) {
  const base = Object.entries(config.knowledge).map(([key, value]) => `## ${key.toUpperCase()}\n${value}`).join('\n\n');
  const approved = examples.filter((item) => item.rating !== 'rejected').slice(0, 20).map((item) => {
    const ideal = item.rating === 'corrected' && item.correction ? item.correction : item.assistant_message;
    return `Contato: ${item.user_message}\nResposta ideal: ${ideal}`;
  }).join('\n\n');
  const operation = agent === 'nara'
    ? 'Você atende clientes finais interessados em comprar imóveis da Bossa. Sua missão é qualificar com naturalidade e encaminhar para visita ou atendimento humano.'
    : 'Você atende corretores parceiros fora do horário comercial. Nunca use nome próprio. Você é somente o plantão da Bossa e deve escalar propostas, reservas e exceções.';
  return `${operation}\n\n# PERSONA\nIdentificação: ${config.persona.name}\nPapel: ${config.persona.role}\nTom: ${config.persona.tone}\nTamanho: ${config.persona.length}\nEmojis: ${config.persona.emojis}\nIdentidade: ${config.persona.identity}\n\n# ABERTURA\n${config.first_message}\n\n# BASE DE CONHECIMENTO\n${base}${approved ? `\n\n# EXEMPLOS DE TREINAMENTO\n${approved}` : ''}\n\nFale em português brasileiro. Nunca invente preços, disponibilidade, documentos, condições ou prazos. Quando não tiver certeza, diga que o comercial confirmará.`;
}

function fallbackReply(agent: Agent, text: string, config: AgentConfig) {
  const lower = text.toLocaleLowerCase('pt-BR');
  if (agent === 'plantao') {
    if (/proposta|entrada|topam|aceita|fechar/.test(lower)) return 'Recebi a proposta. Para não te passar uma confirmação errada, vou deixar sinalizado para o comercial assumir com prioridade. Me manda o nome do cliente e a unidade para eu adiantar?';
    if (/segurar|reservar|reserva|bloquear/.test(lower)) return 'Reserva ou bloqueio de unidade precisa da confirmação do comercial. Me manda o nome do cliente e a unidade que eu deixo o pedido completo para o time assumir.';
    if (/comiss/.test(lower)) return 'Comissão e qualquer exceção comercial precisam ser confirmadas pelo time. Posso registrar seu pedido e deixar para o comercial retornar com a condição correta.';
    if (/book|tabela|planta|material|foto|vídeo|video/.test(lower)) return 'Consigo adiantar o pedido de material. Me diz qual empreendimento e qual arquivo você precisa para eu direcionar corretamente.';
    if (/nome|robô|robo| ia |bot|pessoa/.test(` ${lower} `)) return config.persona.identity.includes('plantão') ? 'Aqui é o plantão da Bossa, que cobre o fora do horário comercial 😊 Pela manhã o time assume. Pode falar comigo que eu adianto o que der.' : config.persona.identity;
    return 'Aqui é o plantão da Bossa 😊 Posso ajudar com material, informações de obra ou deixar uma proposta e um pedido encaminhados para o comercial. O que você precisa?';
  }
  if (/preço|preco|valor|quanto custa/.test(lower)) return 'Os valores variam conforme unidade e condição de pagamento, e eu não quero te passar uma informação desatualizada. Você procura para morar ou investir?';
  if (/arrisc|quebrar|segurança|seguranca/.test(lower)) return 'Entendo a preocupação. A Bossa trabalha com patrimônio de afetação, disciplina financeira e histórico de entregas, e o comercial pode detalhar os documentos. Sua busca é mais para morar ou investir?';
  if (/robô|robo| ia |bot|pessoa/.test(` ${lower} `)) return 'Eu cuido do primeiro atendimento aqui da Bossa 😊 Se preferir falar direto com um dos nossos consultores, posso chamar agora. Quer que eu encaminhe?';
  if (/urgente|essa semana|rápido|rapido/.test(lower)) return 'Entendi, vou tratar como prioridade para não perder seu tempo. Você já tem preferência entre Flow Aptos e Alma Seahouses, ou quer que eu compare os dois?';
  return 'Oi! Sou a Nara, da Bossa 😊 Posso te ajudar a entender as opções. Você está buscando um imóvel para morar ou para investir?';
}

export async function GET(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  const agentRaw = new URL(request.url).searchParams.get('agent');
  if (!isAgent(agentRaw)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400 });
  try {
    const [config, examples] = await Promise.all([
      loadConfig(context.supabase, context.organizationId, agentRaw),
      loadExamples(context.supabase, context.organizationId, agentRaw),
    ]);
    return NextResponse.json({ config, examples });
  } catch (error) {
    return databaseError(error instanceof Error ? error.message : 'Erro ao carregar treinamento.');
  }
}

export async function PUT(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  const body = await request.json().catch(() => ({})) as { agent?: unknown; config?: unknown };
  if (!isAgent(body.agent)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400 });
  const config = normalizeConfig(body.agent, body.config);
  try {
    const { error } = await context.supabase.from('ai_agent_configs').upsert({
      organization_id: context.organizationId,
      agent: body.agent,
      persona: config.persona,
      knowledge: config.knowledge,
      first_message: config.first_message,
      active: config.active,
      updated_by: context.user.id,
    }, { onConflict: 'organization_id,agent' });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return databaseError(error instanceof Error ? error.message : 'Erro ao salvar treinamento.');
  }
}

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!isAgent(body.agent)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400 });
  try {
    if (body.action === 'example') {
      const rating = body.rating === 'approved' || body.rating === 'corrected' || body.rating === 'rejected' ? body.rating : null;
      const userMessage = String(body.user_message ?? '').trim().slice(0, 10000);
      const assistantMessage = String(body.assistant_message ?? '').trim().slice(0, 10000);
      const correction = body.correction ? String(body.correction).trim().slice(0, 10000) : null;
      if (!rating || !userMessage || !assistantMessage) return NextResponse.json({ error: 'Exemplo incompleto.' }, { status: 400 });
      if (rating === 'corrected' && !correction) return NextResponse.json({ error: 'Informe a resposta corrigida.' }, { status: 400 });
      const { data, error } = await context.supabase.from('ai_training_examples').insert({
        organization_id: context.organizationId,
        agent: body.agent,
        scenario: body.scenario ? String(body.scenario).slice(0, 120) : null,
        user_message: userMessage,
        assistant_message: assistantMessage,
        rating,
        correction,
        notes: body.notes ? String(body.notes).slice(0, 3000) : null,
        created_by: context.user.id,
      }).select('id,scenario,user_message,assistant_message,rating,correction,notes,created_at').single();
      if (error) throw error;
      return NextResponse.json({ example: data });
    }

    if (body.action !== 'simulate') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatMessage[] = rawMessages.slice(-20).flatMap((item): ChatMessage[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { role?: unknown; content?: unknown };
      if (row.role !== 'user' && row.role !== 'assistant') return [];
      const content = String(row.content ?? '').trim().slice(0, 10000);
      return content ? [{ role: row.role, content }] : [];
    });
    if (!messages.length || messages.at(-1)?.role !== 'user') return NextResponse.json({ error: 'Envie uma mensagem do contato para simular.' }, { status: 400 });
    const [config, examples] = await Promise.all([
      loadConfig(context.supabase, context.organizationId, body.agent),
      loadExamples(context.supabase, context.organizationId, body.agent),
    ]);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: fallbackReply(body.agent, messages.at(-1)?.content ?? '', config), source: 'local' });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 450,
        system: buildPrompt(body.agent, config, examples),
        messages,
      }),
    });
    const data = await response.json() as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: data.error?.message || `Anthropic HTTP ${response.status}` }, { status: 502 });
    const reply = data.content?.filter((item) => item.type === 'text').map((item) => item.text || '').join('').trim();
    if (!reply) return NextResponse.json({ error: 'A IA não devolveu uma resposta.' }, { status: 502 });
    return NextResponse.json({ reply, source: 'anthropic' });
  } catch (error) {
    return databaseError(error instanceof Error ? error.message : 'Erro no treinamento.');
  }
}

export async function DELETE(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Registro não informado.' }, { status: 400 });
  try {
    const { error } = await context.supabase.from('ai_training_examples').delete().eq('organization_id', context.organizationId).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return databaseError(error instanceof Error ? error.message : 'Erro ao excluir exemplo.');
  }
}
