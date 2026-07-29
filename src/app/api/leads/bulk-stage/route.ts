import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAiStage, isHumanStage, stageLabel, stagesFor } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

type BulkLead = {
  id: string;
  name: string;
  owner_id: string | null;
  opt_out: boolean | null;
  automation_paused: boolean | null;
};

const CHUNK_SIZE = 400;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'Você não possui permissão para movimentar leads em massa.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    kind?: unknown;
    fromStage?: unknown;
    toStage?: unknown;
  };
  const kind = String(body.kind ?? '') as LeadKind;
  const fromStage = String(body.fromStage ?? '');
  const toStage = String(body.toStage ?? '');

  if (!['cliente', 'corretor'].includes(kind)) {
    return NextResponse.json({ error: 'Pipeline inválida.' }, { status: 400 });
  }
  const validStages = stagesFor(kind);
  if (!validStages.some((stage) => stage.id === fromStage) || !validStages.some((stage) => stage.id === toStage)) {
    return NextResponse.json({ error: 'Etapa de origem ou destino inválida.' }, { status: 400 });
  }
  if (fromStage === toStage) {
    return NextResponse.json({ error: 'Escolha etapas diferentes.' }, { status: 400 });
  }
  if (toStage === 'passagem_pendente') {
    return NextResponse.json({ error: 'A passagem ao comercial exige tratamento individual e não pode ser feita em massa.' }, { status: 400 });
  }

  const { data, error: findError } = await supabase
    .from('leads')
    .select('id,name,owner_id,opt_out,automation_paused')
    .eq('organization_id', membership.organization_id)
    .eq('kind', kind)
    .eq('stage', fromStage)
    .is('archived_at', null)
    .limit(5000);

  if (findError) return NextResponse.json({ error: findError.message }, { status: 400 });
  const leads = (data ?? []) as BulkLead[];
  if (!leads.length) return NextResponse.json({ updated: 0 });

  const now = new Date().toISOString();
  const aiStage = isAiStage(toStage);
  const humanStage = isHumanStage(toStage);
  const terminalStage = ['fechado_ganho', 'encerrado'].includes(toStage);

  for (const batch of chunks(leads, CHUNK_SIZE)) {
    const updates = batch.map((lead) => {
      const update: Record<string, unknown> = {
        id: lead.id,
        stage: toStage,
        owner_mode: aiStage ? 'ai' : humanStage ? 'human' : 'none',
        ai_enabled: aiStage && !lead.opt_out && !lead.automation_paused,
        updated_at: now,
      };

      if (aiStage) update.owner_id = null;
      if (humanStage) {
        update.owner_id = lead.owner_id || user.id;
        update.last_human_activity_at = now;
      }
      if (terminalStage) {
        update.next_action = null;
        update.next_action_type = null;
        update.next_action_due_at = null;
      } else if (toStage === 'futuro') {
        update.next_action = 'Aguardar inclusão em campanha de reativação comercial.';
        update.next_action_type = 'campanha_reativacao';
        update.next_action_due_at = null;
      }
      return update;
    });

    const { error: updateError } = await supabase.from('leads').upsert(updates, { onConflict: 'id' });
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    const activities = batch.map((lead) => ({
      organization_id: membership.organization_id,
      lead_id: lead.id,
      user_id: user.id,
      type: 'movimentacao_em_massa',
      title: `Movido para ${stageLabel(kind, toStage)}`,
      description: `Movimentação em massa de ${stageLabel(kind, fromStage)} para ${stageLabel(kind, toStage)}.`,
      metadata: { previous_stage: fromStage, next_stage: toStage, bulk: true },
    }));
    const { error: activityError } = await supabase.from('activities').insert(activities);
    if (activityError) return NextResponse.json({ error: activityError.message }, { status: 400 });
  }

  return NextResponse.json({
    updated: leads.length,
    fromStage,
    toStage,
    message: `${leads.length} ${leads.length === 1 ? 'lead foi movido' : 'leads foram movidos'} para ${stageLabel(kind, toStage)}.`,
  });
}
