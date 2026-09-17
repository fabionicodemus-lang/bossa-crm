import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const QUIET_MS = 25_000;
const LOOKBACK_MS = 36 * 60 * 60 * 1000;
const MAX_PER_RUN = 3;
const MODEL = 'gpt-5.6-luna';
type Admin = ReturnType<typeof createAdminClient>;
type RecentMessage = {
  id: string; lead_id: string; whatsapp_channel_id: string; created_at: string;
  direction: string; sender_kind: string; body: string;
  raw_payload: Record<string, unknown> | null;
};
type Review = { summary: string; next_action: string; priority: 'A1' | 'A2' | 'B' | 'C'; active_client: boolean };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && (bearer === secret || request.headers.get('x-cron-secret') === secret));
}

function outputText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.flatMap((item) => {
    const entry = item as { content?: Array<{ type?: string; text?: string }> };
    return (entry.content ?? []).filter((part) => part.type === 'output_text').map((part) => part.text ?? '');
  }).join('').trim();
}

async function analyzeConversation(input: {
  leadName: string; stage: string; messages: Array<{ direction: string; body: string }>;
  proposals: Array<{ status: string; proposal_number: number; updated_at: string }>;
}): Promise<Review> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY indisponível.');
  const schema = {
    type: 'object', additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      next_action: { type: 'string' },
      priority: { type: 'string', enum: ['A1', 'A2', 'B', 'C'] },
      active_client: { type: 'boolean' },
    },
    required: ['summary', 'next_action', 'priority', 'active_client'],
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_output_tokens: 900,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: 'broker_human_review', strict: true, schema } },
      input: [
        { role: 'developer', content: 'Você analisa internamente conversas entre corretores e a equipe humana da Bossa. NÃO responda ao WhatsApp. Produza um resumo factual do estado atual e exatamente uma próxima ação para a equipe, em português brasileiro. Ignore figurinhas, reações e placeholders de mídia. Use apenas fatos explícitos: não invente visitas marcadas, proposta aceita ou venda. Se uma proposta constar no CRM, ela pode ser mencionada como registro vinculado ao corretor, mas não presuma que pertence ao cliente comentado na conversa. Não atribua a autoria das mensagens a uma pessoa específica se o registro não identifica o atendente. Priorize informações novas, cliente ativo, empreendimento, negociação e pendências. Seja conciso (resumo até 400 caracteres, próxima ação até 200). Prioridade A1 apenas para negociação ou atendimento urgente explícito; A2 para oportunidade concreta; B para atividade comercial; C para contato sem ação iminente.' },
        { role: 'user', content: JSON.stringify(input) },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${String((payload.error as { message?: string } | undefined)?.message || 'falha')}`);
  const raw = outputText(payload);
  const review = JSON.parse(raw) as Partial<Review>;
  if (typeof review.summary !== 'string' || !review.summary.trim() || typeof review.next_action !== 'string' || !review.next_action.trim()
    || !['A1', 'A2', 'B', 'C'].includes(String(review.priority)) || typeof review.active_client !== 'boolean') {
    throw new Error('Análise retornou dados incompletos.');
  }
  return {
    summary: review.summary.trim().slice(0, 750),
    next_action: review.next_action.trim().slice(0, 400),
    priority: review.priority as Review['priority'],
    active_client: review.active_client,
  };
}

async function run() {
  const admin: Admin = createAdminClient();
  const { data: channels, error: channelsError } = await admin.from('whatsapp_channels').select('id').eq('role', 'corretor');
  if (channelsError) throw channelsError;
  const channelIds = (channels ?? []).map((channel) => channel.id);
  if (!channelIds.length) return { analyzed: 0, skipped: 0, failed: 0 };

  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data: candidates, error: candidatesError } = await admin.from('messages')
    .select('id,lead_id,whatsapp_channel_id,created_at,direction,sender_kind,body,raw_payload')
    .in('whatsapp_channel_id', channelIds)
    .in('sender_kind', ['lead', 'humano'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false }).limit(700);
  if (candidatesError) throw candidatesError;

  const latestByLead = new Map<string, RecentMessage>();
  for (const candidate of (candidates ?? []) as RecentMessage[]) {
    if (!candidate.lead_id || latestByLead.has(candidate.lead_id)) continue;
    if (candidate.raw_payload?.source === 'whatsapp_business_app_history') continue;
    if (!(candidate.direction === 'in' && candidate.sender_kind === 'lead'
      || candidate.direction === 'out' && candidate.sender_kind === 'humano')) continue;
    latestByLead.set(candidate.lead_id, candidate);
  }
  if (!latestByLead.size) return { analyzed: 0, skipped: 0, failed: 0 };

  const ids = [...latestByLead.keys()];
  const [{ data: leadRows, error: leadError }, { data: stateRows, error: stateError }] = await Promise.all([
    admin.from('leads').select('id,organization_id,name,kind,stage,owner_mode,ai_enabled,automation_paused,archived_at,updated_at,priority_class,temperature,next_action,next_action_due_at').in('id', ids),
    admin.from('broker_human_review_state').select('lead_id,last_message_id').in('lead_id', ids),
  ]);
  if (leadError || stateError) throw leadError || stateError;
  const states = new Map((stateRows ?? []).map((state) => [state.lead_id, state.last_message_id]));
  const leads = (leadRows ?? []).filter((lead) => lead.kind === 'corretor' && lead.owner_mode === 'human'
    && !lead.archived_at && !['encerrado', 'fechado_ganho'].includes(lead.stage));
  let analyzed = 0; let skipped = 0; let failed = 0;

  for (const lead of leads) {
    const latest = latestByLead.get(lead.id);
    if (!latest || states.get(lead.id) === latest.id || Date.now() - new Date(latest.created_at).getTime() < QUIET_MS) {
      skipped++; continue;
    }
    if (analyzed + failed >= MAX_PER_RUN) break;
    try {
      const [{ data: history, error: historyError }, { data: proposals, error: proposalError }] = await Promise.all([
        admin.from('messages').select('id,created_at,direction,sender_kind,body')
          .eq('lead_id', lead.id).eq('whatsapp_channel_id', latest.whatsapp_channel_id)
          .neq('direction', 'system').order('created_at', { ascending: false }).limit(28),
        admin.from('proposals').select('status,proposal_number,updated_at').eq('lead_id', lead.id)
          .order('updated_at', { ascending: false }).limit(4),
      ]);
      if (historyError || proposalError) throw historyError || proposalError;
      const messages = [...(history ?? [])].reverse().map((item) => ({
        direction: item.direction === 'in' ? 'corretor' : item.sender_kind === 'humano' ? 'equipe' : 'IA',
        body: String(item.body || '').replace(/^📱 WhatsApp Business:\s*/, '').slice(0, 700),
      }));
      if (!messages.some((item) => item.direction === 'equipe')) { skipped++; continue; }
      const review = await analyzeConversation({ leadName: lead.name, stage: lead.stage, messages,
        proposals: (proposals ?? []) as Array<{ status: string; proposal_number: number; updated_at: string }> });
      const { data: latestNow } = await admin.from('messages').select('id')
        .eq('lead_id', lead.id).eq('whatsapp_channel_id', latest.whatsapp_channel_id)
        .in('sender_kind', ['lead', 'humano']).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (latestNow?.id !== latest.id) { skipped++; continue; }

      const proposalSent = (proposals ?? []).some((proposal) => proposal.status === 'enviada'
        && Date.now() - new Date(proposal.updated_at).getTime() <= 14 * 86_400_000);
      const nextStage = ['novo_triagem', 'qualificacao_ia', 'nutricao_ativa', 'passagem_pendente', 'futuro'].includes(lead.stage)
        ? proposalSent ? 'proposta_negociacao' : 'humano_ativo' : lead.stage;
      const now = new Date().toISOString();
      const { data: changed, error: updateError } = await admin.from('leads').update({
        stage: nextStage,
        ai_summary: review.summary,
        ai_next_action: review.next_action,
        next_action: review.next_action,
        next_action_type: 'followup_humano',
        next_action_due_at: lead.next_action_due_at || new Date(Date.now() + 86_400_000).toISOString(),
        priority_class: lead.priority_class || review.priority,
        temperature: Math.max(Number(lead.temperature) || 0, review.active_client ? 60 : 30),
        ai_last_classified_at: now,
      }).eq('id', lead.id).eq('organization_id', lead.organization_id)
        .eq('kind', 'corretor').eq('owner_mode', 'human').eq('stage', lead.stage)
        .eq('updated_at', lead.updated_at).select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!changed) { skipped++; continue; }
      const { error: stateSaveError } = await admin.from('broker_human_review_state').upsert({
        lead_id: lead.id, organization_id: lead.organization_id,
        last_message_id: latest.id, analyzed_at: now, last_model: MODEL,
      }, { onConflict: 'lead_id' });
      if (stateSaveError) throw stateSaveError;
      const { error: activityError } = await admin.from('activities').insert({
        organization_id: lead.organization_id, lead_id: lead.id,
        type: 'conversa_humana_analisada', title: 'Conversa humana refletida no pipeline',
        description: review.summary,
        metadata: { next_action: review.next_action, source_message_id: latest.id, stage_after: nextStage, model: MODEL,
          source: 'whatsapp_business_app', outbound_sent: false },
      });
      if (activityError) console.error('[broker human review activity]', activityError.message);
      analyzed++;
    } catch (error) {
      failed++;
      console.error('[broker human review]', lead.id, error instanceof Error ? error.message : 'Erro desconhecido');
    }
  }
  return { analyzed, skipped, failed };
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  try { return NextResponse.json(await run()); }
  catch (error) {
    console.error('[broker human review worker]', error);
    return NextResponse.json({ error: 'Falha na análise das conversas humanas.' }, { status: 500 });
  }
}
