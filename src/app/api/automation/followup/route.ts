import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

const DAY_MS = 86_400_000;
const AI_NO_REPLY_ESCALATION_MS = 3 * DAY_MS;
const AI_ACTIVE_STAGES = new Set(['novo_triagem', 'qualificacao_ia', 'nutricao_ativa']);

type AdminClient = ReturnType<typeof createAdminClient>;
type MembershipProfileRow = {
  user_id: string;
  role: string;
  profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
};

type EscalationOwner = {
  userId: string;
  isCintia: boolean;
};

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret || request.headers.get('x-cron-secret') === secret;
}

function ageMs(value: string | null | undefined, now: number): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : now - time;
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function normalizeName(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function profileName(row: MembershipProfileRow): string {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return profile?.full_name || '';
}

async function resolveEscalationOwner(admin: AdminClient, organizationId: string): Promise<EscalationOwner | null> {
  const { data: memberships, error } = await admin
    .from('memberships')
    .select('user_id,role,profiles(full_name)')
    .eq('organization_id', organizationId);

  if (error) {
    console.error('[followup escalation owner]', error.message);
    return null;
  }

  const eligible = ((memberships ?? []) as MembershipProfileRow[])
    .filter((membership) => membership.role !== 'viewer');
  const cintia = eligible.find((membership) => normalizeName(profileName(membership)).split(/\s+/).includes('cintia'));
  if (cintia) return { userId: cintia.user_id, isCintia: true };

  // Rede de proteção: se Cintia não estiver cadastrada, nunca deixa o lead sem dono.
  const adminMembership = eligible.find((membership) => membership.role === 'admin');
  return adminMembership ? { userId: adminMembership.user_id, isCintia: false } : null;
}

async function runFollowupWorker() {
  const admin = createAdminClient();
  const nowDate = new Date();
  const now = nowDate.getTime();
  const nowIso = nowDate.toISOString();
  const staleAiCutoffIso = new Date(now - AI_NO_REPLY_ESCALATION_MS).toISOString();
  const summary = {
    tasks_overdue: 0,
    handoffs_rescued: 0,
    human_rescued: 0,
    future_reactivated: 0,
    ai_no_reply_escalated: 0,
    escalation_owner_missing: 0,
  };

  const { data: overdueTasks } = await admin.from('lead_tasks').select('id')
    .eq('status', 'pending').not('due_at', 'is', null).lt('due_at', nowIso).limit(1000);
  if (overdueTasks?.length) {
    const ids = overdueTasks.map((task) => task.id);
    await admin.from('lead_tasks').update({ status: 'overdue' }).in('id', ids);
    summary.tasks_overdue = ids.length;
  }

  // A idade da tarefa representa há quanto tempo a ação segue sob responsabilidade da IA.
  const { data: staleAiTasks } = await admin.from('lead_tasks')
    .select('lead_id')
    .eq('assigned_mode', 'ai')
    .is('assigned_to', null)
    .in('status', ['pending', 'overdue'])
    .lte('created_at', staleAiCutoffIso)
    .limit(5000);
  const staleAiLeadIds = new Set((staleAiTasks ?? []).map((task) => task.lead_id));
  const escalationOwnerCache = new Map<string, EscalationOwner | null>();

  const { data: leads } = await admin.from('leads').select('*')
    .not('stage', 'in', '(fechado_ganho,encerrado)').eq('opt_out', false).limit(2000);

  for (const lead of leads ?? []) {
    if (lead.stage === 'futuro' && lead.reactivation_at && new Date(lead.reactivation_at).getTime() <= now) {
      await admin.from('leads').update({
        stage: 'qualificacao_ia',
        owner_mode: 'ai',
        owner_id: null,
        ai_enabled: !lead.automation_paused,
        reactivation_at: null,
        next_action: 'Reativar o lead usando o motivo registrado da pausa.',
        next_action_type: 'reativar',
        next_action_due_at: nowIso,
      }).eq('id', lead.id);
      await admin.from('activities').insert({
        organization_id: lead.organization_id,
        lead_id: lead.id,
        type: 'reativacao_automatica',
        title: 'Lead futuro voltou para qualificação',
        description: 'A data de reativação chegou. A IA foi preparada para retomar quando houver janela válida de contato.',
        metadata: { reactivated_at: nowIso },
      });
      await admin.from('lead_tasks').insert({
        organization_id: lead.organization_id,
        lead_id: lead.id,
        assigned_mode: 'ai',
        type: 'reativar',
        title: 'Reativar lead futuro',
        description: lead.next_action || 'Retomar de onde a conversa parou.',
        priority: 'normal',
        status: 'pending',
        due_at: nowIso,
        created_by_kind: 'system',
        dedupe_key: 'reactivation:due',
        metadata: {},
      });
      summary.future_reactivated += 1;
      continue;
    }

    if (lead.stage === 'passagem_pendente') {
      const elapsed = ageMs(lead.handoff_requested_at || lead.updated_at, now);
      if (elapsed >= 10 * 60_000) {
        const { data: managerTask } = await admin.from('lead_tasks').select('id')
          .eq('lead_id', lead.id).eq('status', 'pending').eq('dedupe_key', 'manager:handoff-overdue').maybeSingle();
        if (!managerTask?.id) {
          await admin.from('lead_tasks').insert({
            organization_id: lead.organization_id,
            lead_id: lead.id,
            assigned_mode: 'manager',
            type: 'sla_passagem',
            title: 'Passagem sem aceite no prazo',
            description: `Lead ${lead.priority_class || 'sem classe'} aguardando aceite do comercial.`,
            priority: lead.priority_class === 'A1' ? 'urgent' : 'high',
            status: 'pending',
            due_at: nowIso,
            created_by_kind: 'system',
            dedupe_key: 'manager:handoff-overdue',
            metadata: { handoff_requested_at: lead.handoff_requested_at },
          });
        }
      }
      if (elapsed >= 60 * 60_000) {
        await admin.from('lead_handoffs').update({ status: 'expired' }).eq('lead_id', lead.id).eq('status', 'pending');
        await admin.from('leads').update({
          stage: 'nutricao_ativa',
          owner_mode: 'ai',
          owner_id: null,
          ai_enabled: !lead.automation_paused,
          next_action: 'A passagem estourou; Nara/Plantão reassumiu para o lead não ficar abandonado.',
          next_action_type: 'resgate_ia',
          next_action_due_at: nowIso,
        }).eq('id', lead.id);
        await admin.from('activities').insert({
          organization_id: lead.organization_id,
          lead_id: lead.id,
          type: 'resgate_sla',
          title: 'IA reassumiu após passagem sem aceite',
          description: 'O SLA de passagem estourou e o lead voltou automaticamente para a rede de proteção.',
          metadata: { elapsed_minutes: Math.round(elapsed / 60_000) },
        });
        summary.handoffs_rescued += 1;
      }
      continue;
    }

    const lastOutboundAt = timestampMs(lead.last_outbound_at);
    const lastInboundAt = timestampMs(lead.last_inbound_at);
    const waitingForCustomerReply = lastOutboundAt !== null
      && (lastInboundAt === null || lastInboundAt < lastOutboundAt);
    const aiUnownedForThreeDays = lead.owner_mode === 'ai'
      && !lead.owner_id
      && AI_ACTIVE_STAGES.has(lead.stage)
      && staleAiLeadIds.has(lead.id);
    const customerSilentForThreeDays = waitingForCustomerReply
      && lastOutboundAt !== null
      && now - lastOutboundAt >= AI_NO_REPLY_ESCALATION_MS;

    if (aiUnownedForThreeDays && customerSilentForThreeDays) {
      let escalationOwner = escalationOwnerCache.get(lead.organization_id);
      if (escalationOwner === undefined) {
        escalationOwner = await resolveEscalationOwner(admin, lead.organization_id);
        escalationOwnerCache.set(lead.organization_id, escalationOwner);
      }

      if (!escalationOwner) {
        summary.escalation_owner_missing += 1;
        console.error(`[followup escalation] Organização ${lead.organization_id} sem Cintia ou administrador elegível.`);
      } else {
        const ownerLabel = escalationOwner.isCintia ? 'Cintia' : 'administrador de contingência';
        const taskDescription = 'A IA fez a última tentativa há mais de 3 dias e o cliente não respondeu. Fazer uma abordagem humana, registrar o resultado e definir a próxima ação.';

        await admin.from('lead_tasks').update({ status: 'cancelled' })
          .eq('lead_id', lead.id)
          .eq('assigned_mode', 'ai')
          .is('assigned_to', null)
          .in('status', ['pending', 'overdue']);

        await admin.from('lead_handoffs').update({ status: 'cancelled', updated_at: nowIso })
          .eq('lead_id', lead.id)
          .eq('status', 'pending');

        await admin.from('leads').update({
          owner_id: escalationOwner.userId,
          owner_mode: 'human',
          stage: 'humano_ativo',
          ai_enabled: false,
          handoff_requested_at: nowIso,
          handoff_accepted_at: nowIso,
          next_action: 'Fazer contato humano após 3 dias sem resposta à IA.',
          next_action_type: 'resgate_sem_resposta_3d',
          next_action_due_at: nowIso,
        }).eq('id', lead.id);

        await admin.from('lead_handoffs').insert({
          organization_id: lead.organization_id,
          lead_id: lead.id,
          requested_by: 'system',
          offered_to: escalationOwner.userId,
          accepted_by: escalationOwner.userId,
          priority_class: lead.priority_class,
          reason: 'Mais de 3 dias sob responsabilidade da IA sem resposta do cliente.',
          briefing: {
            summary: lead.ai_summary,
            next_action: lead.ai_next_action || lead.next_action,
            last_outbound_at: lead.last_outbound_at,
            last_inbound_at: lead.last_inbound_at,
          },
          status: 'accepted',
          accepted_at: nowIso,
          expires_at: nowIso,
        });

        const { data: existingEscalationTask } = await admin.from('lead_tasks').select('id')
          .eq('lead_id', lead.id)
          .eq('status', 'pending')
          .eq('dedupe_key', 'human:cintia:no-response-3d')
          .maybeSingle();
        const escalationTask = {
          organization_id: lead.organization_id,
          lead_id: lead.id,
          assigned_to: escalationOwner.userId,
          assigned_mode: 'human',
          type: 'resgate_sem_resposta_3d',
          title: 'Agir em lead sem resposta há 3 dias',
          description: taskDescription,
          priority: 'high',
          status: 'pending',
          due_at: nowIso,
          created_by_kind: 'system',
          dedupe_key: 'human:cintia:no-response-3d',
          metadata: {
            automatic_escalation: true,
            intended_owner: 'Cintia',
            fallback_owner_used: !escalationOwner.isCintia,
            last_outbound_at: lead.last_outbound_at,
          },
        };
        if (existingEscalationTask?.id) {
          await admin.from('lead_tasks').update(escalationTask).eq('id', existingEscalationTask.id);
        } else {
          await admin.from('lead_tasks').insert(escalationTask);
        }

        await admin.from('activities').insert({
          organization_id: lead.organization_id,
          lead_id: lead.id,
          type: 'resgate_sem_resposta_3d',
          title: `Lead passou da IA para ${ownerLabel}`,
          description: taskDescription,
          metadata: {
            owner_id: escalationOwner.userId,
            intended_owner: 'Cintia',
            fallback_owner_used: !escalationOwner.isCintia,
            last_outbound_at: lead.last_outbound_at,
            escalated_at: nowIso,
          },
        });

        summary.ai_no_reply_escalated += 1;
        continue;
      }
    }

    if (['humano_ativo', 'agendado', 'pos_reuniao', 'proposta_negociacao'].includes(lead.stage)) {
      const reference = lead.last_human_activity_at || lead.handoff_accepted_at || lead.updated_at;
      const inactive = ageMs(reference, now);
      const dueExpired = lead.next_action_due_at && new Date(lead.next_action_due_at).getTime() <= now;
      if (dueExpired) {
        const { data: alert } = await admin.from('lead_tasks').select('id')
          .eq('lead_id', lead.id).eq('status', 'pending').eq('dedupe_key', 'manager:human-overdue').maybeSingle();
        if (!alert?.id) {
          await admin.from('lead_tasks').insert({
            organization_id: lead.organization_id,
            lead_id: lead.id,
            assigned_to: lead.owner_id,
            assigned_mode: 'human',
            type: 'sla_humano',
            title: 'Próxima ação do lead está vencida',
            description: lead.next_action || 'Registrar nova ação e prazo.',
            priority: lead.priority_class === 'A1' ? 'urgent' : 'high',
            status: 'pending',
            due_at: nowIso,
            created_by_kind: 'system',
            dedupe_key: 'manager:human-overdue',
            metadata: { previous_due_at: lead.next_action_due_at },
          });
        }
      }
      const protectedByFutureCommitment = lead.stage === 'agendado' && lead.next_action_due_at && new Date(lead.next_action_due_at).getTime() > now;
      if (!protectedByFutureCommitment && inactive >= 7 * DAY_MS) {
        await admin.from('leads').update({
          stage: 'nutricao_ativa',
          owner_mode: 'ai',
          owner_id: null,
          ai_enabled: !lead.automation_paused,
          next_action: 'Retomar com continuidade após sete dias sem atividade humana.',
          next_action_type: 'resgate_ia',
          next_action_due_at: nowIso,
        }).eq('id', lead.id);
        await admin.from('activities').insert({
          organization_id: lead.organization_id,
          lead_id: lead.id,
          type: 'resgate_automatico',
          title: 'Lead esquecido voltou para a IA',
          description: 'Sete dias sem atividade humana válida. A IA reassumiu sem reiniciar a conversa.',
          metadata: { previous_owner_id: lead.owner_id, inactive_days: Math.floor(inactive / DAY_MS) },
        });
        summary.human_rescued += 1;
      }
    }
  }

  return summary;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runFollowupWorker()) });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runFollowupWorker()) });
}
