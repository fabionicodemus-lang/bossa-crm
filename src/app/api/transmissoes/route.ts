import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeWaId } from '@/lib/whatsapp';
import { stagesFor } from '@/lib/stages';
import type { LeadKind } from '@/lib/types';

type Channel = 'clientes' | 'corretores';
type VariableMapping = { source: 'name' | 'enterprise' | 'company' | 'stage' | 'fixed'; value?: string };
type BroadcastLeadRow = {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  enterprise: string | null;
  company: string | null;
  group_name: string | null;
  source: string | null;
  opt_out: boolean | null;
  automation_paused: boolean | null;
};

const PAGE_SIZE = 100;

function headerHasDynamicText(components: unknown) {
  if (!Array.isArray(components)) return false;
  const header = components.find((item) => item && typeof item === 'object' && String((item as { type?: unknown }).type).toUpperCase() === 'HEADER') as { text?: unknown } | undefined;
  return /\{\{\d+\}\}/.test(String(header?.text ?? ''));
}

async function fetchAllBroadcastLeads(
  admin: SupabaseClient,
  organizationId: string,
  kind: LeadKind,
  stages: string[],
) {
  const rows: BroadcastLeadRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin.from('leads')
      .select('id,name,phone,stage,enterprise,company,group_name,source,opt_out,automation_paused')
      .eq('organization_id', organizationId)
      .eq('kind', kind)
      .in('stage', stages)
      .is('archived_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: rows, error };

    const batch = (data ?? []) as BroadcastLeadRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para criar transmissões.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    name?: unknown;
    channel?: unknown;
    stages?: unknown;
    templateId?: unknown;
    variableMappings?: unknown;
    mediaBucket?: unknown;
    mediaPath?: unknown;
    mediaMimeType?: unknown;
    mediaFilename?: unknown;
  };

  const name = String(body.name ?? '').trim();
  const channel = String(body.channel ?? '') as Channel;
  const templateId = String(body.templateId ?? '');
  const stages = Array.isArray(body.stages) ? body.stages.map(String) : [];
  const variableMappings = Array.isArray(body.variableMappings) ? body.variableMappings as VariableMapping[] : [];
  if (name.length < 2) return NextResponse.json({ error: 'Dê um nome para a transmissão.' }, { status: 400 });
  if (!['clientes', 'corretores'].includes(channel)) return NextResponse.json({ error: 'Público inválido.' }, { status: 400 });
  if (!templateId || stages.length === 0) return NextResponse.json({ error: 'Selecione o modelo da Meta e ao menos uma etapa.' }, { status: 400 });

  const kind: LeadKind = channel === 'clientes' ? 'cliente' : 'corretor';
  const validStages = new Set<string>(stagesFor(kind).map((stage) => stage.id));
  if (stages.some((stage) => !validStages.has(stage))) return NextResponse.json({ error: 'Uma das etapas selecionadas é inválida.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: template, error: templateError } = await admin.from('whatsapp_templates')
    .select('*').eq('id', templateId).eq('organization_id', membership.organization_id).maybeSingle();
  if (templateError || !template) return NextResponse.json({ error: 'Modelo da Meta não encontrado.' }, { status: 404 });
  if (String(template.status).toUpperCase() !== 'APPROVED') {
    return NextResponse.json({ error: 'Somente modelos com status Aprovado podem ser usados.' }, { status: 409 });
  }
  if (String(template.category).toUpperCase() !== 'MARKETING') {
    return NextResponse.json({ error: 'Transmissões comerciais e de reativação devem usar um modelo da categoria Marketing.' }, { status: 409 });
  }
  if (Number(template.variable_count) !== variableMappings.length) {
    return NextResponse.json({ error: `Preencha as ${template.variable_count} variáveis do modelo.` }, { status: 400 });
  }
  if (headerHasDynamicText(template.components)) {
    return NextResponse.json({ error: 'Este modelo possui variável no cabeçalho de texto. Nesta versão, use cabeçalho estático ou mídia.' }, { status: 409 });
  }

  const { data: connection } = await admin.from('whatsapp_connections')
    .select('id,channel,status').eq('id', template.whatsapp_connection_id)
    .eq('organization_id', membership.organization_id).maybeSingle();
  if (!connection || connection.status !== 'connected' || connection.channel !== channel) {
    return NextResponse.json({ error: 'O modelo não pertence ao canal selecionado ou o número não está conectado.' }, { status: 409 });
  }

  const headerType = String(template.header_format ?? 'NONE').toUpperCase();
  const mediaRequired = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType);
  const mediaPath = String(body.mediaPath ?? '').trim() || null;
  if (mediaRequired && !mediaPath) {
    return NextResponse.json({ error: `O modelo exige um anexo do tipo ${headerType.toLowerCase()}.` }, { status: 400 });
  }

  const { data: leads, error: leadsError } = await fetchAllBroadcastLeads(
    admin,
    membership.organization_id,
    kind,
    stages,
  );
  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 400 });

  const recipients: Array<Record<string, unknown>> = [];
  const seenPhones = new Set<string>();
  let skipped = 0;
  for (const lead of leads) {
    const phone = normalizeWaId(String(lead.phone ?? ''));
    if (!phone || lead.opt_out || lead.automation_paused || seenPhones.has(phone)) {
      skipped++;
      continue;
    }
    seenPhones.add(phone);
    recipients.push({
      organization_id: membership.organization_id,
      lead_id: lead.id,
      lead_name: lead.name,
      phone,
      stage: lead.stage,
      lead_snapshot: {
        name: lead.name,
        enterprise: lead.enterprise,
        company: lead.company,
        group_name: lead.group_name,
        source: lead.source,
        stage: lead.stage,
      },
      status: 'queued',
    });
  }
  if (!recipients.length) return NextResponse.json({ error: 'Nenhum contato elegível nas etapas selecionadas. Telefones inválidos, opt-outs e automações pausadas são excluídos.' }, { status: 409 });

  const { data: broadcast, error: broadcastError } = await admin.from('broadcasts').insert({
    organization_id: membership.organization_id,
    whatsapp_connection_id: connection.id,
    template_id: template.id,
    channel,
    name,
    stages,
    template_name: template.name,
    template_language: template.language,
    template_category: template.category,
    variable_mappings: variableMappings,
    header_type: headerType,
    media_bucket: mediaPath ? String(body.mediaBucket ?? 'broadcast-media') : null,
    media_path: mediaPath,
    media_mime_type: mediaPath ? String(body.mediaMimeType ?? '') || null : null,
    media_filename: mediaPath ? String(body.mediaFilename ?? '') || null : null,
    status: 'ready',
    recipient_count: recipients.length,
    queued_count: recipients.length,
    skipped_count: skipped,
    created_by: user.id,
  }).select('*').single();
  if (broadcastError) return NextResponse.json({ error: broadcastError.message }, { status: 400 });

  const rows = recipients.map((recipient) => ({ ...recipient, broadcast_id: broadcast.id }));
  const { error: recipientsError } = await admin.from('broadcast_recipients').insert(rows);
  if (recipientsError) {
    await admin.from('broadcasts').delete().eq('id', broadcast.id);
    return NextResponse.json({ error: recipientsError.message }, { status: 400 });
  }

  return NextResponse.json({ broadcast, eligible: recipients.length, skipped });
}
