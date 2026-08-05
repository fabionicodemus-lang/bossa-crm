import { NextResponse } from 'next/server';
import { buildAiInstructions, generateAiTurn, type AiFileOption, type AiTrainingContext } from '@/lib/ai';
import { loadNaraDynamicTurnContext, loadNaraRuntimeVariables, saveNaraRuntimeVariables } from '@/lib/nara-dynamic-context';
import { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';
import {
  naraKnowledgeForEditor,
  normalizeNaraKnowledge,
} from '@/lib/nara-prompt-config';
import { createClient } from '@/lib/supabase/server';
import type { Lead } from '@/lib/types';

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
  const knowledge = agent === 'nara'
    ? normalizeNaraKnowledge(knowledgeInput)
    : Object.fromEntries(
        Object.entries(knowledgeInput)
          .slice(0, 30)
          .map(([key, item]) => [key.slice(0, 80), String(item ?? '').slice(0, 10000)]),
      );
  return {
    persona,
    knowledge: Object.keys(knowledge).length ? knowledge : fallback.knowledge,
    first_message: String(input.first_message ?? fallback.first_message).slice(0, 3000),
    active: input.active !== false,
  };
}

function configForEditor(agent: Agent, config: AgentConfig): AgentConfig {
  if (agent !== 'nara') return config;
  return {
    ...config,
    knowledge: naraKnowledgeForEditor(config.knowledge),
  };
}

async function requireAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 }) } as const;
  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Apenas administradores podem treinar os agentes.' }, { status: 403 }) } as const;
  }
  return { supabase, user, organizationId: membership.organization_id } as const;
}

function databaseError(message: string) {
  const missing = message.includes('ai_agent_configs')
    || message.includes('ai_training_examples')
    || message.includes('ai_files')
    || message.includes('nara_runtime_variables')
    || message.includes('nara_offer_logs')
    || message.includes('schema cache');
  return NextResponse.json({
    error: missing
      ? 'As tabelas de treinamento ou arquivos da IA ainda não estão disponíveis no Supabase.'
      : message,
  }, { status: missing ? 503 : 400 });
}

async function loadConfig(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string, agent: Agent) {
  const { data, error } = await supabase
    .from('ai_agent_configs')
    .select('persona,knowledge,first_message,active')
    .eq('organization_id', organizationId)
    .eq('agent', agent)
    .maybeSingle();
  if (error) throw error;
  if (!data) return defaultConfig(agent);
  return normalizeConfig(agent, data);
}

async function loadExamples(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string, agent: Agent) {
  const { data, error } = await supabase
    .from('ai_training_examples')
    .select('id,scenario,user_message,assistant_message,rating,correction,notes,created_at')
    .eq('organization_id', organizationId)
    .eq('agent', agent)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ExampleRow[];
}

async function loadFiles(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string, agent: Agent) {
  const { data, error } = await supabase
    .from('ai_files')
    .select('id,category,title,description,trigger_keywords,storage_bucket,storage_path,original_name,mime_type')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .in('agent', [agent, 'both'])
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as AiFileOption[];
}

function syntheticLead(agent: Agent, organizationId: string, scenario = ''): Lead {
  const now = new Date().toISOString();
  return {
    id: 'simulador-treinamento',
    organization_id: organizationId,
    kind: agent === 'nara' ? 'cliente' : 'corretor',
    kommo_id: null,
    name: agent === 'nara' ? 'Cliente de teste' : 'Corretor de teste',
    phone: null,
    email: null,
    stage: agent === 'nara' ? 'ia' : 'n1',
    source: 'Simulador',
    enterprise: null,
    company: null,
    group_name: null,
    creci: null,
    temperature: 0,
    ai_enabled: true,
    ai_classification: null,
    ai_summary: null,
    ai_next_action: null,
    ai_last_classified_at: null,
    owner_id: null,
    metadata: { simulador: true, scenario },
    created_at: now,
    updated_at: now,
  };
}

function makeAiContext(config: AgentConfig, examples: ExampleRow[], files: AiFileOption[]): AiTrainingContext {
  return {
    config: {
      persona: config.persona as unknown as Record<string, unknown>,
      knowledge: config.knowledge,
      first_message: config.first_message,
      active: config.active,
    },
    examples,
    files,
  };
}

function aiStatus(filesCount: number) {
  return {
    provider: 'openai' as const,
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    files_count: filesCount,
    simulator_mode: 'mesmo_motor_do_whatsapp' as const,
  };
}

export async function GET(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  const agentRaw = new URL(request.url).searchParams.get('agent');
  if (!isAgent(agentRaw)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400 });
  try {
    const [config, examples, files, runtimeVariables] = await Promise.all([
      loadConfig(context.supabase, context.organizationId, agentRaw),
      loadExamples(context.supabase, context.organizationId, agentRaw),
      loadFiles(context.supabase, context.organizationId, agentRaw),
      agentRaw === 'nara'
        ? loadNaraRuntimeVariables(context.supabase, context.organizationId)
        : Promise.resolve(null),
    ]);
    const lead = syntheticLead(agentRaw, context.organizationId);
    const aiContext = makeAiContext(config, examples, files);
    return NextResponse.json({
      config: configForEditor(agentRaw, config),
      examples,
      prompt: buildAiInstructions(lead, aiContext),
      ai: aiStatus(files.length),
      runtime_variables: runtimeVariables,
    });
  } catch (error) {
    return databaseError(error instanceof Error ? error.message : 'Erro ao carregar treinamento.');
  }
}

export async function PUT(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  const body = await request.json().catch(() => ({})) as { agent?: unknown; config?: unknown; action?: unknown; variables?: unknown };
  if (!isAgent(body.agent)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400 });
  try {
    if (body.action === 'variables') {
      if (body.agent !== 'nara') return NextResponse.json({ error: 'Variáveis operacionais existem somente para a Nara.' }, { status: 400 });
      const runtimeVariables = await saveNaraRuntimeVariables(context.supabase, {
        organizationId: context.organizationId,
        userId: context.user.id,
        values: body.variables,
      });
      return NextResponse.json({ ok: true, runtime_variables: runtimeVariables });
    }

    const config = normalizeConfig(body.agent, body.config);
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
      const rating = body.rating === 'approved' || body.rating === 'corrected' || body.rating === 'rejected'
        ? body.rating
        : null;
      const userMessage = String(body.user_message ?? '').trim().slice(0, 10000);
      const assistantMessage = String(body.assistant_message ?? '').trim().slice(0, 10000);
      const correction = body.correction ? String(body.correction).trim().slice(0, 10000) : null;
      const notes = body.notes ? String(body.notes).trim().slice(0, 3000) : null;
      if (!rating || !userMessage || !assistantMessage) {
        return NextResponse.json({ error: 'Exemplo incompleto.' }, { status: 400 });
      }
      if (rating === 'corrected' && !correction) {
        return NextResponse.json({ error: 'Informe a resposta corrigida.' }, { status: 400 });
      }
      if (rating === 'rejected' && !notes) {
        return NextResponse.json({ error: 'Explique o que deve mudar na resposta.' }, { status: 400 });
      }
      const { data, error } = await context.supabase.from('ai_training_examples').insert({
        organization_id: context.organizationId,
        agent: body.agent,
        scenario: body.scenario ? String(body.scenario).slice(0, 120) : null,
        user_message: userMessage,
        assistant_message: assistantMessage,
        rating,
        correction,
        notes,
        created_by: context.user.id,
      }).select('id,scenario,user_message,assistant_message,rating,correction,notes,created_at').single();
      if (error) throw error;
      return NextResponse.json({ example: data });
    }

    if (body.action !== 'simulate') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        error: 'A OPENAI_API_KEY ainda não está configurada na Vercel. O simulador não usa mais respostas locais: ele agora utiliza exatamente o mesmo motor do WhatsApp.',
        code: 'OPENAI_NOT_CONFIGURED',
      }, { status: 503 });
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatMessage[] = rawMessages.slice(-24).flatMap((item): ChatMessage[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { role?: unknown; content?: unknown };
      if (row.role !== 'user' && row.role !== 'assistant') return [];
      const content = String(row.content ?? '').trim().slice(0, 10000);
      return content ? [{ role: row.role, content }] : [];
    });
    if (!messages.length || messages.at(-1)?.role !== 'user') {
      return NextResponse.json({ error: 'Envie uma mensagem do contato para simular.' }, { status: 400 });
    }

    const [savedConfig, examples, files] = await Promise.all([
      loadConfig(context.supabase, context.organizationId, body.agent),
      loadExamples(context.supabase, context.organizationId, body.agent),
      loadFiles(context.supabase, context.organizationId, body.agent),
    ]);
    const config = body.config ? normalizeConfig(body.agent, body.config) : savedConfig;
    const lead = syntheticLead(body.agent, context.organizationId, String(body.scenario ?? ''));
    const aiContext = makeAiContext(config, examples, files);
    if (body.agent === 'nara') {
      const [commercial, dynamic] = await Promise.all([
        loadNaraCommercialTurnContext(
          context.supabase,
          context.organizationId,
          lead,
          messages,
        ),
        loadNaraDynamicTurnContext(
          context.supabase,
          context.organizationId,
          null,
        ),
      ]);
      aiContext.commercial = commercial;
      aiContext.dynamic = dynamic;
    }
    const turn = await generateAiTurn(lead, messages, aiContext);
    if (!turn) {
      return NextResponse.json({ error: 'A OpenAI não gerou uma resposta.' }, { status: 502 });
    }
    const attachments = turn.attachment_ids
      .map((id) => files.find((file) => file.id === id))
      .filter((file): file is AiFileOption => Boolean(file))
      .map((file) => ({ id: file.id, title: file.title, category: file.category, original_name: file.original_name }));

    return NextResponse.json({
      reply: turn.reply,
      source: 'openai',
      model: turn.model_used || process.env.OPENAI_MODEL || 'gpt-5-mini',
      classification: turn.classification,
      score: turn.score,
      stage: turn.stage,
      handoff: turn.handoff,
      attachments,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro no treinamento.';
    const details = error
      && typeof error === 'object'
      && 'causes' in error
      && Array.isArray(error.causes)
      ? error.causes.map(String)
      : [];

    console.error('[ai-training simulate]', {
      message,
      details,
      error,
    });

    const status = message.toLowerCase().includes('openai') ? 502 : 400;
    return NextResponse.json({ error: message, details }, { status });
  }
}

export async function DELETE(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Registro não informado.' }, { status: 400 });
  try {
    const { error } = await context.supabase
      .from('ai_training_examples')
      .delete()
      .eq('organization_id', context.organizationId)
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return databaseError(error instanceof Error ? error.message : 'Erro ao excluir exemplo.');
  }
}
