import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAiStage, isHumanStage } from '@/lib/stages';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para assumir ou reativar o atendimento.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { enabled?: unknown };
  const enabled = Boolean(body.enabled);
  const { data: lead } = await supabase.from('leads').select('*')
    .eq('id', id).eq('organization_id', membership.organization_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
  if (enabled && lead.opt_out) return NextResponse.json({ error: 'Este contato pediu opt-out e não pode receber automações.' }, { status: 400 });
  if (enabled && ['fechado_ganho', 'encerrado'].includes(lead.stage)) {
    return NextResponse.json({ error: 'Reabra o lead em uma etapa ativa antes de reativar a IA.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const persona = lead.kind === 'cliente' ? 'Nara' : 'Plantão';
  const update = enabled ? {
    ai_enabled: true,
    automation_paused: false,
    owner_mode: 'ai',
    owner_id: null,
    stage: isAiStage(lead.stage) ? lead.stage : 'nutricao_ativa',
    next_action: `${persona} reassumiu o atendimento e deve retomar de onde a conversa parou.`,
    next_action_type: 'resgate_ia',
    next_action_due_at: now,
    updated_at: now,
  } : {
    ai_enabled: false,
    automation_paused: false,
    owner_mode: 'human',
    owner_id: lead.owner_id || user.id,
    stage: isHumanStage(lead.stage) ? lead.stage : 'humano_ativo',
    last_human_activity_at: now,
    next_action: 'O consultor deve continuar o atendimento e registrar a próxima ação.',
    next_action_type: 'followup_humano',
    updated_at: now,
  };

  const { error } = await supabase.from('leads').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from('activities').insert({
    organization_id: lead.organization_id,
    lead_id: id,
    user_id: user.id,
    type: 'controle_hibrido',
    title: enabled ? `${persona} reassumiu o contato` : 'Conversa assumida pelo comercial',
    description: enabled
      ? `${persona} voltou a responder, mantendo o histórico e a continuidade.`
      : 'A IA foi silenciada para evitar mensagens duplicadas, mas continua analisando a conversa.',
    metadata: { enabled, owner_mode: enabled ? 'ai' : 'human' },
  });
  return NextResponse.json({ ok: true, ...update });
}
