import { getCurrentContext } from '@/lib/auth';
import { recordNaraFunnelEvent } from '@/lib/nara-funnel-events';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

/** Records an action already performed by a person. Never sends or changes proposal workflow. */
export async function POST(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return fail('Não autenticado.', 401);
  if (!['admin', 'comercial'].includes(context.role)) return fail('Sem permissão para registrar resultados.', 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('Origem da solicitação inválida.', 403);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Dados inválidos.');
  const input = body as Record<string, unknown>;
  if (typeof input.proposal_id !== 'string' || !uuid.test(input.proposal_id)) return fail('Proposta inválida.');
  if (input.outcome !== 'proposta_enviada' && input.outcome !== 'proposta_apresentada') return fail('Resultado inválido.');
  if (input.confirmed !== true) return fail('Confirme que essa ação já foi realizada.');
  if (typeof input.expected_version !== 'number' || !Number.isSafeInteger(input.expected_version) || input.expected_version < 1) {
    return fail('Informe a versão da proposta exibida.');
  }
  const happenedAt = typeof input.occurred_at === 'string' ? new Date(input.occurred_at) : new Date(NaN);
  if (!Number.isFinite(happenedAt.getTime()) || happenedAt.getTime() > Date.now() + 5000) {
    return fail('Informe quando a ação ocorreu, sem data futura.');
  }

  const supabase = await createClient();
  const { data: proposal, error: proposalError } = await supabase.from('proposals')
    .select('id,organization_id,lead_id,version,created_at,snapshot')
    .eq('id', input.proposal_id).eq('organization_id', context.organization.id).maybeSingle();
  if (proposalError) return fail('Não foi possível conferir a proposta.', 503);
  if (!proposal) return fail('Proposta não encontrada nesta empresa.', 404);
  if (Number(proposal.version) !== input.expected_version) return fail('A proposta mudou. Atualize a tela e confira a versão antes de registrar.', 409);
  if (!proposal.lead_id) return fail('Vincule a proposta ao contato antes de registrar o resultado.');
  const createdAt = new Date(proposal.created_at).getTime();
  if (!Number.isFinite(createdAt) || happenedAt.getTime() < createdAt) return fail('A ação não pode anteceder a criação da proposta.');
  const { data: lead, error: leadError } = await supabase.from('leads')
    .select('id,kind,enterprise,source,owner_id')
    .eq('id', proposal.lead_id).eq('organization_id', context.organization.id).maybeSingle();
  if (leadError) return fail('Não foi possível conferir o contato da proposta.', 503);
  if (!lead) return fail('Contato da proposta não encontrado nesta empresa.', 404);

  const snapshot = proposal.snapshot && typeof proposal.snapshot === 'object' && !Array.isArray(proposal.snapshot)
    ? proposal.snapshot as Record<string, unknown> : {};
  try {
    const result = await recordNaraFunnelEvent(supabase, {
      organizationId: context.organization.id, leadId: lead.id,
      event: input.outcome, source: 'human_proposal_confirmation', actorId: context.userId,
      occurredAt: happenedAt.toISOString(), evidence: { proposal_id: proposal.id },
      dedupeKey: `proposal-version:${input.expected_version}`,
      dimensions: {
        contact_kind: lead.kind === 'cliente' || lead.kind === 'corretor' ? lead.kind : undefined,
        origin: typeof lead.source === 'string' ? lead.source : undefined,
        development: typeof snapshot.development_name === 'string' ? snapshot.development_name
          : typeof lead.enterprise === 'string' ? lead.enterprise : undefined,
        unit: typeof snapshot.unit_code === 'string' ? snapshot.unit_code : undefined,
        responsible_id: context.userId, proposal_version: input.expected_version,
      },
    });
    return Response.json({
      recorded: result.recorded, already_recorded: !result.recorded, activity_id: result.id,
      proposal_id: proposal.id, proposal_version: input.expected_version, outcome: input.outcome,
      no_message_sent: true, workflow_unchanged: true,
    }, { status: result.recorded ? 201 : 200, headers });
  } catch {
    return fail('O resultado não foi registrado. Tente novamente; nenhum envio será realizado por esta ação.', 503);
  }
}
