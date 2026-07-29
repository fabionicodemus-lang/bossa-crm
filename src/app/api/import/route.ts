import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stagesFor } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

interface ImportRecord {
  kind: LeadKind;
  kommo_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  source: string | null;
  enterprise: string | null;
  company: string | null;
  group_name: string | null;
  creci: string | null;
  temperature: number;
  metadata: Record<string, unknown>;
}

const LEGACY_STAGE_MAP: Record<LeadKind, Record<string, string>> = {
  cliente: {
    novo: 'novo_triagem',
    ia: 'qualificacao_ia',
    qualificado: 'passagem_pendente',
    agendado: 'agendado',
    negociacao: 'proposta_negociacao',
    fechado: 'fechado_ganho',
  },
  corretor: {
    n1: 'novo_triagem',
    n2: 'qualificacao_ia',
    n3: 'nutricao_ativa',
    n4: 'proposta_negociacao',
    n5: 'nutricao_ativa',
  },
};

function normalizeImportedStage(kind: LeadKind, stage: string): string {
  const mapped = LEGACY_STAGE_MAP[kind][stage] || stage;
  return stagesFor(kind).some((item) => item.id === mapped) ? mapped : 'novo_triagem';
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
    return NextResponse.json({ error: 'Você não possui permissão para importar.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const records = Array.isArray(body.records) ? body.records as ImportRecord[] : [];
  const strategy = body.strategy === 'ignore' ? 'ignore' : 'update';
  if (records.length === 0 || records.length > 500) {
    return NextResponse.json({ error: 'Lote de importação inválido.' }, { status: 400 });
  }

  if (body.reset) {
    const rawKinds: unknown[] = Array.isArray(body.resetKinds) ? body.resetKinds : [];
    const resetKinds = rawKinds.filter((kind): kind is LeadKind => kind === 'cliente' || kind === 'corretor');
    if (resetKinds.length) {
      const { error: deleteError } = await supabase
        .from('leads')
        .delete()
        .eq('organization_id', membership.organization_id)
        .in('kind', resetKinds);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }
  }

  const kinds = [...new Set(records.map((record) => record.kind))];
  const { data: existingRows, error: existingError } = await supabase
    .from('leads')
    .select('id,kind,kommo_id,phone')
    .eq('organization_id', membership.organization_id)
    .in('kind', kinds);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });

  const byKommo = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const item of existingRows ?? []) {
    if (item.kommo_id) byKommo.set(`${item.kind}:${item.kommo_id}`, item.id);
    if (item.phone) byPhone.set(`${item.kind}:${item.phone}`, item.id);
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const seenInBatch = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  for (const record of records) {
    if (!record.name || !['cliente', 'corretor'].includes(record.kind)) {
      skipped++;
      continue;
    }

    const kommoKey = record.kommo_id ? `${record.kind}:kommo:${record.kommo_id}` : null;
    const phoneKey = record.phone ? `${record.kind}:phone:${record.phone}` : null;
    const batchKey = kommoKey || phoneKey;
    if (batchKey && seenInBatch.has(batchKey)) {
      skipped++;
      continue;
    }
    if (batchKey) seenInBatch.add(batchKey);

    const existingId =
      (record.kommo_id && byKommo.get(`${record.kind}:${record.kommo_id}`))
      || (record.phone && byPhone.get(`${record.kind}:${record.phone}`));
    if (existingId && strategy === 'ignore') {
      skipped++;
      continue;
    }

    const stage = normalizeImportedStage(record.kind, String(record.stage || ''));
    const terminal = ['fechado_ganho', 'encerrado'].includes(stage);
    const human = ['humano_ativo', 'agendado', 'pos_reuniao', 'proposta_negociacao'].includes(stage);
    const basePayload = {
      organization_id: membership.organization_id,
      kind: record.kind,
      kommo_id: record.kommo_id || null,
      name: String(record.name).slice(0, 200),
      phone: record.phone || null,
      email: record.email || null,
      stage,
      source: record.source || null,
      enterprise: record.enterprise || null,
      company: record.company || null,
      group_name: record.group_name || null,
      creci: record.creci || null,
      temperature: Math.max(0, Math.min(100, Number(record.temperature) || 0)),
      owner_mode: terminal ? 'none' : human ? 'human' : 'ai',
      ai_enabled: !terminal && !human,
      automation_paused: false,
      metadata: record.metadata || {},
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      updates.push({ id: existingId, ...basePayload });
      updated++;
    } else {
      inserts.push(basePayload);
      added++;
    }
  }

  if (updates.length) {
    const { error } = await supabase.from('leads').upsert(updates, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (inserts.length) {
    const { error } = await supabase.from('leads').insert(inserts);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ added, updated, skipped });
}
