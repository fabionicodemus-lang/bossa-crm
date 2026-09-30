import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CLOSED_WORKFLOWS = new Set(['recusada', 'expirada', 'convertida']);

function dueFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function workflowStatusOf(proposal: {
  status: string;
  snapshot: Record<string, unknown> | null;
}) {
  const workflow = proposal.snapshot?.workflow_status;
  return typeof workflow === 'string' ? workflow : proposal.status;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    return NextResponse.json({ error: 'Você não possui permissão para encerrar a proposta.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { reason?: unknown };
  const reason = String(body.reason ?? '').trim();

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id,name,kind,stage,priority_class,owner_id,opt_out,automation_paused')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
  }

  const { data: proposalRows, error: proposalsError } = await supabase
    .from('proposals')
    .select('id,proposal_number,status,snapshot,version,updated_at')
    .eq('organization_id', membership.organization_id)
    .eq('lead_id', id)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (proposalsError) {
    return NextResponse.json({ error: proposalsError.message }, { status: 400 });
  }

  const activeProposal = (proposalRows ?? []).find(
    (proposal) => !CLOSED_WORKFLOWS.has(workflowStatusOf(proposal)),
  ) ?? null;

  if (activeProposal) {
    const snapshot = {
      ...(activeProposal.snapshot ?? {}),
      workflow_status: 'recusada',
      not_closed_at: new Date().toISOString(),
      not_closed_reason: reason || null,
    };

    const { error: proposalError } = await supabase
      .from('proposals')
      .update({
        status: 'recusada',
        snapshot,
        version: Number(activeProposal.version || 1) + 1,
        updated_by: user.id,
      })
      .eq('id', activeProposal.id)
      .eq('organization_id', membership.organization_id);

    if (proposalError) {
      return NextResponse.json({ error: proposalError.message }, { status: 400 });
    }
  }

  const rank = String(lead.priority_class ?? '').toUpperCase();
  const returnStage = lead.kind === 'corretor'
    ? (rank === 'A1' || rank === 'A2' ? 'humano_ativo' : 'nutricao_ativa')
    : 'humano_ativo';
  const now = new Date().toISOString();

  const update: Record<string, unknown> = {
    stage: returnStage,
    updated_at: now,
  };

  if (returnStage === 'humano_ativo') {
    update.owner_mode = 'human';
    update.owner_id = lead.owner_id || user.id;
    update.ai_enabled = false;
    update.last_human_activity_at = now;
    update.next_action = lead.kind === 'corretor'
      ? 'Retomar o contato comercial com o corretor após a proposta não evoluir.'
      : 'Retomar o atendimento do cliente após a proposta não evoluir.';
    update.next_action_type = 'followup_humano';
    update.next_action_due_at = dueFromNow(1);
  } else {
    update.owner_mode = 'ai';
    update.owner_id = null;
    update.ai_enabled = !lead.opt_out && !lead.automation_paused;
    update.next_action = 'Manter o relacionamento com o corretor e aguardar uma nova oportunidade.';
    update.next_action_type = 'relacionamento_corretor';
    update.next_action_due_at = dueFromNow(7);
  }

  const { error: updateLeadError } = await supabase
    .from('leads')
    .update(update)
    .eq('id', id)
    .eq('organization_id', membership.organization_id);

  if (updateLeadError) {
    return NextResponse.json({ error: updateLeadError.message }, { status: 400 });
  }

  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: id,
    user_id: user.id,
    type: 'proposta_nao_fechou',
    title: activeProposal
      ? `Proposta #${activeProposal.proposal_number} não fechou`
      : 'Proposta não fechou',
    description: reason || (
      lead.kind === 'corretor'
        ? `Corretor retornou para ${returnStage === 'humano_ativo' ? 'Comercial ativo' : 'Relacionamento ativo'} conforme o ranking ${rank || 'não informado'}.`
        : 'Cliente retornou para atendimento humano.'
    ),
    metadata: {
      proposal_id: activeProposal?.id ?? null,
      proposal_number: activeProposal?.proposal_number ?? null,
      previous_stage: lead.stage,
      next_stage: returnStage,
      broker_rank: lead.kind === 'corretor' ? rank || null : null,
      outcome: 'not_closed',
    },
  });

  return NextResponse.json({
    ok: true,
    stage: returnStage,
    owner_mode: update.owner_mode,
    owner_id: update.owner_id ?? null,
    ai_enabled: update.ai_enabled,
    next_action: update.next_action,
    next_action_due_at: update.next_action_due_at,
    proposal_number: activeProposal?.proposal_number ?? null,
    proposal_id: activeProposal?.id ?? null,
  });
}
