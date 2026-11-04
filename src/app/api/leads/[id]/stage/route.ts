import { manualPilot } from '@/lib/homologation/manual-pilot';
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
  if (!membership || !['admin','comercial'].includes(membership.role)) {
    return NextResponse.json({ error: 'Você não possui permissão para alterar a etapa.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { stage?: unknown; reason?: unknown; proposalId?: unknown };
  const stage = String(body.stage ?? '');
  if (manualPilot() && ['qualificacao_ia','passagem_pendente'].includes(stage)) return NextResponse.json({error:'Etapa indisponível no piloto manual.'},{status:400});
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

  if (manualPilot()) {
    if (lead.automation_paused !== true || lead.ai_enabled !== false || !['human','none'].includes(lead.owner_mode)) return NextResponse.json({error:'Contato fora do estado manual seguro. Nenhuma alteração realizada.'},{status:409});
    if (body.proposalId !== undefined) {
      if (stage!=='proposta_negociacao'||typeof body.proposalId!=='string'||! /^[0-9a-f-]{36}$/i.test(body.proposalId)) return NextResponse.json({error:'Movimentação de proposta inválida.'},{status:400});
      const {data:proposal,error:proposalError} = await supabase.from('proposals').select('id,lead_id,status,snapshot')
        .eq('id',body.proposalId).eq('organization_id',membership.organization_id).eq('lead_id',id).maybeSingle();
      if (proposalError) return NextResponse.json({error:'Não foi possível conferir a proposta salva.'},{status:503});
      if (!proposal) return NextResponse.json({error:'Proposta não encontrada para este contato.'},{status:404});
      const workflow = proposal.snapshot?.workflow_status ?? proposal.status;
      if (['recusada','expirada','convertida','cancelada','fechado_ganho','encerrado'].includes(workflow)
        || ['fechado_ganho','encerrado'].includes(lead.stage)) return NextResponse.json({ok:true,stage:lead.stage,skipped:true});
    }
    // H2.2 permits human stage columns, not UPDATE automation_paused. The existing
    // leads_log_stage_change trigger writes the actor/from/to history in this PATCH
    // transaction; a trigger failure rolls back the lead too. No second INSERT.
    if (lead.stage === stage) return NextResponse.json({ok:true,stage,owner_mode:lead.owner_mode,ai_enabled:false});
    const terminal = ['fechado_ganho','encerrado'].includes(stage);
    let query = supabase.from('leads').update({stage,ai_enabled:false,owner_mode:terminal?'none':'human',
      ...(terminal ? {next_action:null,next_action_type:null,next_action_due_at:null} : {owner_id:lead.owner_id||user.id})})
      .eq('id',id).eq('organization_id',membership.organization_id).eq('stage',lead.stage)
      .eq('automation_paused',true).eq('ai_enabled',false);
    if (lead.updated_at) query = query.eq('updated_at',lead.updated_at);
    const {data:changed,error:changeError} = await query.select('id,stage,owner_mode,ai_enabled').maybeSingle();
    if (changeError) return NextResponse.json({error:'Não foi possível registrar a etapa e seu histórico com a sua sessão.'},{status:changeError.code==='42501'?403:500});
    if (!changed) return NextResponse.json({error:'O contato mudou. Atualize o pipeline antes de tentar novamente.'},{status:409});
    return NextResponse.json({ok:true,stage:changed.stage,owner_mode:changed.owner_mode,ai_enabled:changed.ai_enabled});
  }

  const now = new Date().toISOString();
  const previousStage = lead.stage;
  const update: Record<string, unknown> = { stage, updated_at: now };
  if (kind === 'geral') {
    update.owner_mode = stage === 'encerrado' ? 'none' : 'human';
    update.ai_enabled = false;
    update.automation_paused = true;
    if (stage !== 'encerrado') update.owner_id = lead.owner_id || user.id;
    if (stage === 'humano_ativo') update.last_human_activity_at = now;
    if (stage === 'encerrado') {
      update.next_action = null;
      update.next_action_type = null;
      update.next_action_due_at = null;
    }
  } else if (isAiStage(stage)) {
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

  if (!manualPilot() && kind !== 'geral' && stage === 'passagem_pendente') {
    update.handoff_requested_at = now;
    update.next_action = 'Um consultor deve aceitar a passagem e assumir o atendimento.';
    update.next_action_type = 'aceitar_passagem';
    update.next_action_due_at = dueFromNow(30);
  } else if (kind !== 'geral' && stage === 'humano_ativo') {
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
    type: kind === 'geral' ? 'mudanca_etapa_geral' : 'mudanca_estado_hibrido',
    title: `Etapa alterada para ${stageLabel(kind, stage)}`,
    description: String(body.reason ?? '').trim() || `Movido de ${stageLabel(kind, previousStage)} para ${stageLabel(kind, stage)}.`,
    metadata: { previous_stage: previousStage, next_stage: stage, manual: true },
  });

  if (!manualPilot() && kind !== 'geral' && stage === 'passagem_pendente') {
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
