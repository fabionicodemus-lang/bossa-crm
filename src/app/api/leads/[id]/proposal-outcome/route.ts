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
    return NextResponse.json({ error: 'Você não possui permissão para alterar o resultado da proposta.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    reason?: unknown;
    proposal_id?: unknown;
    outcome?: unknown;
  };
  const reason = String(body.reason ?? '').trim();
  const proposalId = String(body.proposal_id ?? '').trim();
  const outcome = body.outcome === 'won' ? 'won' : 'lost';

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
    .limit(100);

  if (proposalsError) {
    return NextResponse.json({ error: proposalsError.message }, { status: 400 });
  }

  const selectedProposal = proposalId
    ? (proposalRows ?? []).find((proposal) => proposal.id === proposalId) ?? null
    : (proposalRows ?? []).find(
        (proposal) => !CLOSED_WORKFLOWS.has(workflowStatusOf(proposal)),
      ) ?? null;

  if (!selectedProposal) {
    return NextResponse.json({ error: 'Proposta não encontrada para este lead.' }, { status: 404 });
  }

  const previousWorkflow = workflowStatusOf(selectedProposal);
  const now = new Date().toISOString();
  const nextWorkflow = outcome === 'won' ? 'convertida' : 'recusada';
  const snapshot = {
    ...(selectedProposal.snapshot ?? {}),
    workflow_status: nextWorkflow,
    outcome,
    outcome_at: now,
    outcome_reason: reason || null,
    ...(outcome === 'won'
      ? { closed_won_at: now }
      : { not_closed_at: now, not_closed_reason: reason || null }),
  };

  const { error: proposalError } = await supabase
    .from('proposals')
    .update({
      status: outcome === 'won' ? 'aprovada' : 'recusada',
      snapshot,
      version: Number(selectedProposal.version || 1) + 1,
      updated_by: user.id,
    })
    .eq('id', selectedProposal.id)
    .eq('organization_id', membership.organization_id);

  if (proposalError) {
    return NextResponse.json({ error: proposalError.message }, { status: 400 });
  }

  const rank = String(lead.priority_class ?? '').toUpperCase();
  const brokerReturnStage = rank === 'A1' || rank === 'A2'
    ? 'humano_ativo'
    : 'nutricao_ativa';
  const returnStage = lead.kind === 'corretor'
    ? brokerReturnStage
    : outcome === 'won'
      ? 'fechado_ganho'
      : 'humano_ativo';

  const update: Record<string, unknown> = {
    stage: returnStage,
    updated_at: now,
  };

  if (lead.kind !== 'corretor' && outcome === 'won') {
    update.owner_mode = 'none';
    update.ai_enabled = false;
    update.automation_paused = true;
    update.next_action = null;
    update.next_action_type = null;
    update.next_action_due_at = null;
  } else if (returnStage === 'humano_ativo') {
    update.owner_mode = 'human';
    update.owner_id = lead.owner_id || user.id;
    update.ai_enabled = false;
    update.last_human_activity_at = now;
    update.next_action = lead.kind === 'corretor'
      ? outcome === 'won'
        ? 'Manter o relacionamento comercial após a venda fechada e buscar a próxima oportunidade.'
        : 'Retomar o contato comercial com o corretor após a proposta não evoluir.'
      : 'Retomar o atendimento do cliente após a proposta não evoluir.';
    update.next_action_type = 'followup_humano';
    update.next_action_due_at = dueFromNow(1);
  } else {
    update.owner_mode = 'ai';
    update.owner_id = null;
    update.ai_enabled = !lead.opt_out && !lead.automation_paused;
    update.next_action = outcome === 'won'
      ? 'Manter relacionamento com o corretor após a venda fechada e buscar uma nova oportunidade.'
      : 'Manter o relacionamento com o corretor e aguardar uma nova oportunidade.';
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

  const won = outcome === 'won';
  await supabase.from('activities').insert({
    organization_id: membership.organization_id,
    lead_id: id,
    user_id: user.id,
    type: won ? 'proposta_fechou' : 'proposta_nao_fechou',
    title: won
      ? `Proposta #${selectedProposal.proposal_number} fechou`
      : `Proposta #${selectedProposal.proposal_number} não fechou`,
    description: reason || (
      won
        ? lead.kind === 'corretor'
          ? `Venda fechada com cliente deste corretor. Corretor retornou para ${returnStage === 'humano_ativo' ? 'Comercial ativo' : 'Relacionamento ativo'}.`
          : 'Proposta convertida em venda.'
        : lead.kind === 'corretor'
          ? `Negociação não fechou. Corretor retornou para ${returnStage === 'humano_ativo' ? 'Comercial ativo' : 'Relacionamento ativo'} conforme o ranking ${rank || 'não informado'}.`
          : 'Negociação não fechou. Cliente retornou para atendimento humano.'
    ),
    metadata: {
      proposal_id: selectedProposal.id,
      proposal_number: selectedProposal.proposal_number,
      previous_workflow: previousWorkflow,
      workflow_status: nextWorkflow,
      previous_stage: lead.stage,
      next_stage: returnStage,
      broker_rank: lead.kind === 'corretor' ? rank || null : null,
      outcome,
    },
  });

  return NextResponse.json({
    ok: true,
    outcome,
    workflow_status: nextWorkflow,
    stage: returnStage,
    owner_mode: update.owner_mode,
    owner_id: update.owner_id ?? null,
    ai_enabled: update.ai_enabled,
    next_action: update.next_action ?? null,
    next_action_due_at: update.next_action_due_at ?? null,
    proposal_number: selectedProposal.proposal_number,
    proposal_id: selectedProposal.id,
  });
}
