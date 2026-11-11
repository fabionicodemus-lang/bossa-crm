import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentContext } from '@/lib/auth';
import { brokerBroadcastEligibility } from '@/lib/contact-identity';
import { browserRecipientFirstName, hasBrowserRecipientNameToken, personalizeBrowserText, safeBrowserMedia, validBrowserMobilePhone, validBrowserPhone } from '@/lib/browser-campaigns';
import { browserCampaignMonitor } from '@/lib/browser-campaign-monitor';

type Broker = {
  id: string; kind: 'cliente' | 'corretor' | 'geral'; name: string;
  phone: string | null; stage: string; creci: string | null;
  metadata: Record<string, unknown> | null; updated_at: string; archived_at: string | null;
  opt_out: boolean;
  enterprise: string | null; company: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECIPIENTS = 1500;

async function editor() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  return context?.role === 'viewer' ? null : context;
}

async function brokerRows(organizationId: string) {
  const admin = createAdminClient();
  const result: Broker[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from('leads')
      .select('id,kind,name,phone,stage,creci,metadata,updated_at,archived_at,opt_out,enterprise,company')
      .eq('organization_id', organizationId).is('archived_at', null)
      .order('id', { ascending: true }).range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data ?? []) as Broker[]);
    if (!data || data.length < 500) return result;
    if (result.length > 30000) throw new Error('Muitos contatos. Refine a base antes de criar a transmissão.');
  }
}

function eligibleBrokers(rows: Broker[]) {
  const byPhone = new Map<string, Broker[]>();
  for (const lead of rows) {
    const phone = validBrowserMobilePhone(lead.phone);
    if (!phone) continue;
    const group = byPhone.get(phone) ?? [];
    group.push(lead);
    byPhone.set(phone, group);
  }
  const eligible = new Map<string, Broker & { normalizedPhone: string }>();
  for (const [phone, group] of byPhone) {
    if (!brokerBroadcastEligibility(group).eligible) continue;
    const broker = group.filter((lead) => lead.kind === 'corretor' && !lead.opt_out)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    // Pausa da Nara não significa exclusão de uma transmissão revisada pelo
    // operador. Opt-out explícito continua bloqueando todo o telefone.
    if (!broker || !browserRecipientFirstName(broker.name) || group.some((lead) => lead.opt_out)) continue;
    eligible.set(phone, { ...broker, normalizedPhone: phone });
  }
  return eligible;
}

export async function GET(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const admin = createAdminClient();
  try {
    if (params.get('mode') === 'contacts') {
      const candidates = [...eligibleBrokers(await brokerRows(context.organization.id)).values()];
      return NextResponse.json({ contacts: candidates.slice(0, 2500).map((lead) => ({
        id: lead.id, name: lead.name, phone: lead.normalizedPhone, stage: lead.stage,
        company: lead.company, enterprise: lead.enterprise,
      })), total: candidates.length, truncated: candidates.length > 2500 });
    }
    const campaignId = params.get('campaign');
    if (campaignId && UUID.test(campaignId)) {
      const { data: campaign, error } = await admin.from('browser_campaigns').select('*')
        .eq('id', campaignId).eq('organization_id', context.organization.id).maybeSingle();
      if (error) throw error;
      if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
      // Supabase aplica limite de 1.000 linhas por resposta em muitos projetos.
      // Paginar garante que o CRM mostre e contabilize todos os 1.500 contatos.
      const recipients: Array<{ status: string; [key: string]: unknown }> = [];
      for (let offset = 0; offset < MAX_RECIPIENTS; offset += 500) {
        const { data: page, error: rowsError } = await admin.from('browser_campaign_recipients')
          .select('id,lead_name,phone,stage,message_text,position,status,next_item_index,detail,claimed_at,finished_at')
          .eq('campaign_id', campaignId).eq('organization_id', context.organization.id)
          .order('position').range(offset, offset + Math.min(499, MAX_RECIPIENTS - offset - 1));
        if (rowsError) throw rowsError;
        recipients.push(...(page ?? []));
        if (!page || page.length < 500) break;
      }
      const { data: lastObserved, error: observedError } = await admin.from('browser_campaign_events')
        .select('created_at').eq('organization_id', context.organization.id)
        .eq('campaign_id', campaignId).eq('result', 'observed')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (observedError) throw observedError;
      const { data: senderLock } = await admin.from('browser_sender_locks').select('requires_review')
        .eq('organization_id', context.organization.id).eq('sender_phone', campaign.sender_phone).maybeSingle();
      const { data: standaloneRun, error: runError } = await admin.from('browser_campaign_standalone_runs')
        .select('id,status,created_at,last_observed_at')
        .eq('organization_id', context.organization.id).eq('campaign_id', campaignId).maybeSingle();
      if (runError && runError.code !== '42P01' && runError.code !== 'PGRST205') throw runError;
      const monitor = browserCampaignMonitor({
        campaignStatus: campaign.status, startedAt: standaloneRun?.created_at ?? campaign.started_at,
        lastObservedAt: lastObserved?.created_at ?? null,
        recipientStatuses: (recipients ?? []).map((recipient) => recipient.status),
        expectedRecipients: campaign.recipient_count,
        nowMs: Date.now(),
      });
      return NextResponse.json({ campaign, recipients, senderBlocked: senderLock?.requires_review === true, monitor,
        standaloneRun: standaloneRun ?? null });
    }
    const { data, error } = await admin.from('browser_campaigns').select('*')
      .eq('organization_id', context.organization.id).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    return NextResponse.json({ campaigns: data ?? [] });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Falha ao consultar campanhas.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await editor();
  if (!context) return NextResponse.json({ error: 'Permissão de edição necessária.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  const baseText = String(body.baseText ?? '').trim();
  const senderPhone = validBrowserPhone(String(body.senderPhone ?? ''));
  const ids = Array.isArray(body.leadIds) ? body.leadIds.map(String) : [];
  const variants = Array.isArray(body.variants) ? body.variants.map((value) => String(value).trim()) : [];
  const media = safeBrowserMedia(context.organization.id, body.media);
  if (name.length < 2 || name.length > 160 || !baseText || baseText.length > 4000 || !senderPhone)
    return NextResponse.json({ error: 'Preencha nome, número remetente com DDI e mensagem (até 4.000 caracteres).' }, { status: 400 });
  if (!ids.length || ids.length > MAX_RECIPIENTS || new Set(ids).size !== ids.length || ids.some((id) => !UUID.test(id)))
    return NextResponse.json({ error: `Selecione de 1 a ${MAX_RECIPIENTS} corretores distintos.` }, { status: 400 });
  if (variants.length > 6 || variants.some((value) => !value || value.length > 4000))
    return NextResponse.json({ error: 'Revise as variações da mensagem.' }, { status: 400 });
  if ([baseText, ...variants].some((value) => !hasBrowserRecipientNameToken(value)))
    return NextResponse.json({ error: 'Inclua {{nome}} no texto e em todas as variações para chamar cada corretor pelo primeiro nome.' }, { status: 400 });
  if (!media) return NextResponse.json({ error: 'Anexos inválidos: até três PDFs de 8 MB, somando até 20 MB.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    for (const file of media) {
      const { data, error } = await admin.storage.from(file.bucket).info(file.path);
      if (error || !data || Number(data.size) !== file.size || data.contentType !== file.mime)
        return NextResponse.json({ error: `Arquivo “${file.filename}” não está disponível no armazenamento.` }, { status: 409 });
    }
    const candidates = eligibleBrokers(await brokerRows(context.organization.id));
    const byId = new Map([...candidates.values()].map((lead) => [lead.id, lead]));
    if (ids.some((id) => !byId.has(id)))
      return NextResponse.json({ error: 'A seleção contém contatos sem celular válido, com exclusão explícita, duplicados ou reclassificados. Atualize a lista.' }, { status: 409 });
    const selected = ids.map((id) => byId.get(id)!);
    if (new Set(selected.map((lead) => lead.normalizedPhone)).size !== selected.length)
      return NextResponse.json({ error: 'Há telefones repetidos entre os contatos escolhidos.' }, { status: 409 });

    const { data: campaign, error: createError } = await admin.from('browser_campaigns').insert({
      organization_id: context.organization.id, name, sender_phone: senderPhone,
      base_text: baseText, variants, media, recipient_count: selected.length,
      status: 'draft', created_by: context.userId,
    }).select('id').single();
    if (createError || !campaign) throw createError || new Error('Falha na criação.');
    try {
      const templates = variants.length ? variants : [baseText];
      for (let start = 0; start < selected.length; start += 100) {
        const recipients = selected.slice(start, start + 100).map((lead, index) => ({
          organization_id: context.organization.id,
          campaign_id: campaign.id,
          lead_id: lead.id,
          lead_name: lead.name,
          phone: lead.normalizedPhone,
          stage: lead.stage,
          message_text: personalizeBrowserText(templates[(start + index) % templates.length], lead),
          position: start + index,
        }));
        if (recipients.some((entry) => !entry.message_text || entry.message_text.length > 4000))
          throw new Error('Uma mensagem ficou vazia ou longa demais após a preparação.');
        const { error } = await admin.from('browser_campaign_recipients').insert(recipients);
        if (error) throw error;
      }
    } catch (cause) {
      await admin.from('browser_campaigns').delete().eq('id', campaign.id);
      throw cause;
    }
    return NextResponse.json({ id: campaign.id, recipients: selected.length }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Falha ao preparar campanha.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const context = await editor();
  if (!context) return NextResponse.json({ error: 'Permissão de edição necessária.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.campaignId ?? '');
  const action = String(body.action ?? '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'Campanha inválida.' }, { status: 400 });
  const transitions: Record<string, { from: string[]; to: string }> = {
    approve: { from: ['draft'], to: 'ready' },
    start: { from: ['ready', 'paused'], to: 'running' },
    pause: { from: ['running'], to: 'paused' },
    cancel: { from: ['draft', 'ready', 'paused'], to: 'cancelled' },
  };
  const transition = transitions[action];
  if (!transition) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  if (action === 'approve' && body.consentConfirmed !== true)
    return NextResponse.json({ error: 'Confirme a autorização dos contatos para receber esta comunicação.' }, { status: 400 });
  const admin = createAdminClient();
  if (action === 'start') {
    const { data: transferred, error: transferError } = await admin.from('broadcasts')
      .select('id').eq('organization_id', context.organization.id)
      .eq('source_browser_campaign_id', id).limit(1).maybeSingle();
    if (transferError) return NextResponse.json({ error: transferError.message }, { status: 400 });
    if (transferred) return NextResponse.json({
      error: 'A fila desta campanha foi transferida para a API oficial. Para evitar duplicação, não é possível retomá-la no navegador.',
    }, { status: 409 });
  }
  const changes: Record<string, unknown> = { status: transition.to };
  if (action === 'approve') {
    changes.consent_confirmed_by = context.userId;
    changes.consent_confirmed_at = new Date().toISOString();
  }
  if (action === 'start') changes.started_at = new Date().toISOString();
  const { data, error } = await admin.from('browser_campaigns').update(changes)
    .eq('id', id).eq('organization_id', context.organization.id)
    .in('status', transition.from).select('id,status').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'A campanha mudou de estado; atualize a tela.' }, { status: 409 });
  return NextResponse.json({ campaign: data });
}
