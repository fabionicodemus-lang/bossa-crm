import { NextResponse } from 'next/server';
import { generateAiTurn, openAiSettings, type AiFileOption, type AiTrainingContext, type AiUsageRecord } from '@/lib/ai';
import { createClient } from '@/lib/supabase/server';
import type { Lead } from '@/lib/types';

export const maxDuration = 60;

type EvalScenario = {
  key: string;
  name: string;
  userMessages: string[];
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const SCENARIOS: EvalScenario[] = [
  {
    key: 'apressado-preco',
    name: 'Apressado que só pergunta preço',
    userMessages: [
      'Quanto custa o menor apartamento? Preciso saber agora.',
      'É para investir e quero decidir esta semana. Tenho até R$ 1,2 milhão.',
    ],
  },
  {
    key: 'monossilabico',
    name: 'Lead monossilábico',
    userMessages: ['Oi', 'Sim, comprar.', 'Morar.'],
  },
  {
    key: 'rentabilidade',
    name: 'Investidor perguntando rentabilidade',
    userMessages: [
      'Quero investir em imóvel na planta. Qual rentabilidade vocês garantem?',
      'Vi o anúncio do Alma e penso em renda com aluguel.',
    ],
  },
  {
    key: 'desconfiado-entrega',
    name: 'Desconfiado sobre a entrega',
    userMessages: [
      'Tenho interesse para morar, mas como sei que a Bossa vai entregar a obra?',
      'Quero entender o histórico da construtora antes de avançar.',
    ],
  },
  {
    key: 'desconto',
    name: 'Caçador de desconto',
    userMessages: [
      'Quero comprar para investir. Qual o maior desconto que vocês dão?',
      'Se fizerem um preço muito bom, eu fecho rápido.',
    ],
  },
  {
    key: 'fora-faixa',
    name: 'Fora da faixa de preço',
    userMessages: [
      'Procuro apartamento para morar e tenho R$ 350 mil. Tem alguma opção?',
      'Posso aumentar um pouco se o parcelamento for bom.',
    ],
  },
  {
    key: 'robo',
    name: 'Quem pergunta se é robô',
    userMessages: [
      'Antes de continuar: você é uma pessoa ou uma inteligência artificial?',
      'Tudo bem. Quero conhecer um apartamento para investir.',
    ],
  },
  {
    key: 'corretor-disfarcado',
    name: 'Corretor disfarçado de cliente',
    userMessages: [
      'Tenho interesse no Alma e queria a tabela e as unidades disponíveis.',
      'Na verdade sou corretor e estou com um cliente aqui comigo.',
    ],
  },
];

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
    return { response: NextResponse.json({ error: 'Apenas administradores podem executar os testes.' }, { status: 403 }) } as const;
  }
  return { supabase, organizationId: membership.organization_id } as const;
}

function syntheticLead(organizationId: string, scenario: string): Lead {
  const now = new Date().toISOString();
  return {
    id: `eval-${scenario}`,
    organization_id: organizationId,
    kind: 'cliente',
    kommo_id: null,
    name: 'Lead de teste',
    phone: null,
    email: null,
    stage: 'ia',
    source: 'Teste GPT-5.6',
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
    metadata: { simulador: true, eval_scenario: scenario },
    created_at: now,
    updated_at: now,
  };
}

function usageTotals(records: AiUsageRecord[]) {
  return records.reduce((acc, item) => ({
    input_tokens: acc.input_tokens + item.input_tokens,
    cached_tokens: acc.cached_tokens + item.cached_tokens,
    cache_write_tokens: acc.cache_write_tokens + item.cache_write_tokens,
    output_tokens: acc.output_tokens + item.output_tokens,
    reasoning_tokens: acc.reasoning_tokens + item.reasoning_tokens,
    estimated_cost_usd: acc.estimated_cost_usd + item.estimated_cost_usd,
    fallback_calls: acc.fallback_calls + (item.fallback_used ? 1 : 0),
    compacted_calls: acc.compacted_calls + (item.compacted ? 1 : 0),
  }), {
    input_tokens: 0,
    cached_tokens: 0,
    cache_write_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    estimated_cost_usd: 0,
    fallback_calls: 0,
    compacted_calls: 0,
  });
}

export async function GET() {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  return NextResponse.json({
    scenarios: SCENARIOS.map(({ key, name }) => ({ key, name })),
    settings: openAiSettings(),
  });
}

export async function POST(request: Request) {
  const context = await requireAdminContext();
  if ('response' in context) return context.response;
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'A OPENAI_API_KEY não está configurada.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { scenario?: unknown };
  const scenario = SCENARIOS.find((item) => item.key === body.scenario);
  if (!scenario) return NextResponse.json({ error: 'Cenário inválido.' }, { status: 400 });

  try {
    const [configResult, examplesResult, filesResult] = await Promise.all([
      context.supabase
        .from('ai_agent_configs')
        .select('persona,knowledge,first_message,active')
        .eq('organization_id', context.organizationId)
        .eq('agent', 'nara')
        .maybeSingle(),
      context.supabase
        .from('ai_training_examples')
        .select('user_message,assistant_message,rating,correction,notes')
        .eq('organization_id', context.organizationId)
        .eq('agent', 'nara')
        .order('created_at', { ascending: false })
        .limit(40),
      context.supabase
        .from('ai_files')
        .select('id,category,title,description,trigger_keywords,storage_bucket,storage_path,original_name,mime_type')
        .eq('organization_id', context.organizationId)
        .eq('active', true)
        .in('agent', ['nara', 'both'])
        .order('created_at', { ascending: false })
        .limit(80),
    ]);
    if (configResult.error) throw configResult.error;
    if (examplesResult.error) throw examplesResult.error;
    if (filesResult.error) throw filesResult.error;

    const aiContext: AiTrainingContext = {
      config: configResult.data ?? null,
      examples: examplesResult.data ?? [],
      files: (filesResult.data ?? []) as AiFileOption[],
    };
    const lead = syntheticLead(context.organizationId, scenario.key);
    const conversation: ChatMessage[] = [];
    const usage: AiUsageRecord[] = [];

    for (const userMessage of scenario.userMessages) {
      conversation.push({ role: 'user', content: userMessage });
      const turn = await generateAiTurn(lead, conversation, aiContext);
      if (!turn) throw new Error('A OpenAI não gerou uma resposta.');
      conversation.push({ role: 'assistant', content: turn.reply });
      usage.push(...(turn.usage_records ?? []));
    }

    const totals = usageTotals(usage);
    return NextResponse.json({
      key: scenario.key,
      name: scenario.name,
      conversation,
      usage,
      totals: {
        ...totals,
        estimated_cost_usd: Number(totals.estimated_cost_usd.toFixed(8)),
      },
      models: [...new Set(usage.map((item) => item.model))],
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Falha ao executar o cenário.',
    }, { status: 502 });
  }
}
