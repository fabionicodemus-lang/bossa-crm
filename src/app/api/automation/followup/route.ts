import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

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

async function runFollowupWorker() {
  const admin = createAdminClient();
  const nowDate = new Date();
  const now = nowDate.getTime();
  const nowIso = nowDate.toISOString();
  const summary = { tasks_overdue: 0, handoffs_rescued: 0, human_rescued: 0, future_reactivated: 0 };

  const { data: overdueTasks } = await admin.from('lead_tasks').select('id')
    .eq('status', 'pending').not('due_at', 'is', null).lt('due_at', nowIso).limit(1000);
  if (overdueTasks?.length) {
    const ids = overdueTasks.map((task) => task.id);
    await admin.from('lead_tasks').update({ status: 'overdue' }).in('id', ids);
    summary.tasks_overdue = ids.length;
  }

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
      if (!protectedByFutureCommitment && inactive >= 7 * 86_400_000) {
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
          metadata: { previous_owner_id: lead.owner_id, inactive_days: Math.floor(inactive / 86_400_000) },
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
