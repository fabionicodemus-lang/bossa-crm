import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAiStage, isHumanStage, stageLabel, stagesFor } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

function dueFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para alterar a etapa.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { stage?: unknown; reason?: unknown };
  const stage = String(body.stage ?? '');
  const { data: lead, error: findError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (findError || !lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });

  const kind = lead.kind as LeadKind;
  const valid = stagesFor(kind).some((item) => item.id === stage);
  if (!valid) return NextResponse.json({ error: 'Etapa inválida.' }, { status: 400 });

  const now = new Date().toISOString();
  const previousStage = lead.stage;
  const update: Record<string, unknown> = { stage, updated_at: now };

  if (isAiStage(stage)) {
    update.owner_mode = 'ai';
    update.ai_enabled = !lead.opt_out && !lead.automation_paused;
    if (stage !== 'passagem_pendente') update.owner_id = null;
  } else if (isHumanStage(stage)) {
    update.owner_mode = 'human';
    update.owner_id = lead.owner_id || user.id;
    update.ai_enabled = false;
    update.last_human_activity_at = now;
  } else {
    update.owner_mode = 'none';
    update.ai_enabled = false;
    update.next_action_due_at = null;
  }

  if (stage === 'passagem_pendente') {
    update.handoff_requested_at = now;
    update.next_action = 'Um consultor deve aceitar a passagem e assumir o atendimento.';
    update.next_action_type = 'aceitar_passagem';
    update.next_action_due_at = dueFromNow(30);
  } else if (stage === 'humano_ativo') {
    update.handoff_accepted_at = lead.handoff_accepted_at || now;
    update.next_action = lead.next_action || 'Realizar o primeiro contato humano e registrar o resultado.';
    update.next_action_type = 'contato_humano';
    update.next_action_due_at = lead.next_action_due_at || dueFromNow(24 * 60);
  }

  const { error } = await supabase.from('leads').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: id,
    user_id: user.id,
    type: 'mudanca_estado_hibrido',
    title: `Etapa alterada para ${stageLabel(kind, stage)}`,
    description: String(body.reason ?? '').trim() || `Movido de ${stageLabel(kind, previousStage)} para ${stageLabel(kind, stage)}.`,
    metadata: { previous_stage: previousStage, next_stage: stage, manual: true },
  });

  if (stage === 'passagem_pendente') {
    const { data: existing } = await supabase
      .from('lead_handoffs')
      .select('id')
      .eq('lead_id', id)
      .eq('status', 'pending')
      .maybeSingle();
    const handoff = {
      organization_id: membership.organization_id,
      lead_id: id,
      requested_by: 'human',
      offered_to: lead.owner_id,
      backup_to: lead.backup_owner_id,
      priority_class: lead.priority_class,
      reason: String(body.reason ?? '').trim() || lead.ai_next_action || 'Passagem solicitada manualmente.',
      briefing: { summary: lead.ai_summary, next_action: lead.ai_next_action },
      status: 'pending',
      expires_at: dueFromNow(30),
    };
    if (existing?.id) await supabase.from('lead_handoffs').update(handoff).eq('id', existing.id);
    else await supabase.from('lead_handoffs').insert(handoff);
  }

  return NextResponse.json({ ok: true, stage, owner_mode: update.owner_mode, ai_enabled: update.ai_enabled });
}
