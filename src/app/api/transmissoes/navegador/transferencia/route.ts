import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBrowserCampaignTransfer } from '@/lib/broadcast-transfer-service';
import { estimateMarketingCostBrl, MARKETING_RATE_BRL_2026 } from '@/lib/browser-campaign-api-transfer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Mapping = { source: 'name' | 'enterprise' | 'company' | 'stage' | 'fixed'; value?: string };

function hasDynamicHeader(components: unknown) {
  if (!Array.isArray(components)) return false;
  const header = components.find((part) => part && typeof part === 'object'
    && String((part as { type?: unknown }).type).toUpperCase() === 'HEADER') as { text?: unknown } | undefined;
  return /\{\{\d+\}\}/.test(String(header?.text ?? ''));
}

export async function GET(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  const campaignId = new URL(request.url).searchParams.get('campaign') ?? '';
  if (!UUID.test(campaignId)) return NextResponse.json({ error: 'Campanha inválida.' }, { status: 400 });

  try {
    const result = await loadBrowserCampaignTransfer(createAdminClient(), context.organization.id, campaignId);
    if (!result) return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
    return NextResponse.json({
      campaign: { id: result.campaign.id, name: result.campaign.name,
        status: result.campaign.status, senderPhone: result.campaign.sender_phone },
      counts: result.counts,
      eligible: result.eligible,
      excluded: result.excluded,
      files: result.files.map(({ path, filename }) => ({ path, filename })),
      estimatedMarketingCostBrl: estimateMarketingCostBrl(result.eligible),
      rateBrl: MARKETING_RATE_BRL_2026,
      priceReferenceDate: '2026-10-01',
      hasActiveRun: result.hasActiveRun,
      consentConfirmed: Boolean(result.campaign.consent_confirmed_at),
      senderMatches: result.senderMatches,
      existingBroadcast: result.existingBroadcast,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao consultar a fila.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  if (context.role === 'viewer') return NextResponse.json({ error: 'Permissão de edição necessária.' }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? '');
  const templateId = String(body.templateId ?? '');
  const mediaPath = String(body.mediaPath ?? '');
  const mappings = Array.isArray(body.variableMappings) ? body.variableMappings as Mapping[] : [];
  const name = String(body.name ?? '').trim();
  if (!UUID.test(campaignId) || !UUID.test(templateId) || name.length < 2 || name.length > 160)
    return NextResponse.json({ error: 'Identifique a campanha, o modelo aprovado e o nome da transmissão.' }, { status: 400 });
  if (mappings.some((mapping) => !['name','enterprise','company','stage','fixed'].includes(mapping?.source)
    || (mapping.source === 'fixed' && !String(mapping.value ?? '').trim())))
    return NextResponse.json({ error: 'Revise as variáveis do modelo.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    let transfer = await loadBrowserCampaignTransfer(admin, context.organization.id, campaignId);
    if (!transfer) return NextResponse.json({ error: 'Campanha de origem não encontrada.' }, { status: 404 });
    if (transfer.existingBroadcast) return NextResponse.json({
      error: 'Esta campanha já foi transferida para a API oficial. Abra a transmissão existente.',
      broadcastId: transfer.existingBroadcast.id,
    }, { status: 409 });
    if (!transfer.campaign.consent_confirmed_at)
      return NextResponse.json({ error: 'A campanha de origem não tem confirmação de consentimento.' }, { status: 409 });
    if (!['running','paused','ready'].includes(transfer.campaign.status))
      return NextResponse.json({ error: 'Esta campanha não está em estado válido para transferência.' }, { status: 409 });
    if (transfer.hasActiveRun)
      return NextResponse.json({ error: 'Encerre primeiro a execução antiga do ChatGPT no painel da campanha pelo navegador; a pausa do CRM não a interrompe.' }, { status: 409 });
    if (!transfer.senderMatches || !transfer.connection)
      return NextResponse.json({ error: 'O remetente original não corresponde ao número conectado na API oficial de corretores.' }, { status: 409 });
    if (!transfer.eligible)
      return NextResponse.json({ error: 'Não há destinatários pendentes e elegíveis para transferir.' }, { status: 409 });

    const { data: template, error: templateError } = await admin.from('whatsapp_templates')
      .select('*').eq('id', templateId).eq('organization_id', context.organization.id).maybeSingle();
    if (templateError || !template || template.whatsapp_connection_id !== transfer.connection.id
      || String(template.status).toUpperCase() !== 'APPROVED'
      || String(template.category).toUpperCase() !== 'MARKETING'
      || String(template.header_format).toUpperCase() !== 'DOCUMENT') {
      return NextResponse.json({ error: 'Selecione um modelo Marketing aprovado, com cabeçalho DOCUMENT, para este mesmo número.' }, { status: 409 });
    }
    if (Number(template.variable_count) !== mappings.length || hasDynamicHeader(template.components))
      return NextResponse.json({ error: 'As variáveis deste modelo não são compatíveis com a transmissão.' }, { status: 409 });

    // PDFs somente da campanha original: nao aceitar caminhos arbitrarios do cliente.
    const file = transfer.files.find((entry) => entry.path === mediaPath);
    if (!file) return NextResponse.json({ error: 'Escolha um dos PDFs da campanha original.' }, { status: 400 });
    const { data: storageFile, error: storageError } = await admin.storage.from('broadcast-media').info(file.path);
    if (storageError || !storageFile || Number(storageFile.size) !== file.size
      || storageFile.contentType !== 'application/pdf') {
      return NextResponse.json({ error: 'O PDF escolhido não está disponível no armazenamento privado.' }, { status: 409 });
    }

    // Congelar a fila antiga antes de preparar a nova. Nunca reativar envios
    // pelo navegador ou marcar como enviados os registros ainda pendentes.
    if (transfer.campaign.status === 'running') {
      const { data: paused, error: pauseError } = await admin.from('browser_campaigns')
        .update({ status: 'paused' }).eq('id', campaignId)
        .eq('organization_id', context.organization.id).eq('status', 'running')
        .select('id').maybeSingle();
      if (pauseError || !paused) return NextResponse.json({ error: 'A origem mudou de estado. Atualize a campanha e tente novamente.' }, { status: 409 });
    }

    // A lista anterior era somente uma pre-visualizacao. Depois da pausa,
    // consultar novamente os recibos, estados e opt-outs para preparar apenas
    // quem continua realmente pendente.
    const refreshed = await loadBrowserCampaignTransfer(admin, context.organization.id, campaignId);
    if (!refreshed || refreshed.hasActiveRun || refreshed.existingBroadcast
      || !['paused', 'ready'].includes(refreshed.campaign.status)
      || !refreshed.campaign.consent_confirmed_at || !refreshed.senderMatches
      || !refreshed.connection || !refreshed.eligible) {
      return NextResponse.json({ error: 'A fila ou a execução original mudou durante a conferência. Atualize e tente novamente.' }, { status: 409 });
    }
    transfer = refreshed;
    const connectionId = refreshed.connection.id;

    const stages = [...new Set(transfer.eligibleRecipients.map((recipient) => recipient.stage))];
    const { data: broadcast, error: createError } = await admin.from('broadcasts').insert({
      organization_id: context.organization.id,
      whatsapp_connection_id: connectionId,
      source_browser_campaign_id: campaignId,
      template_id: template.id,
      channel: 'corretores', name, stages,
      template_name: template.name, template_language: template.language,
      template_category: template.category, variable_mappings: mappings,
      header_type: 'DOCUMENT', media_bucket: 'broadcast-media',
      media_path: file.path, media_mime_type: file.mime, media_filename: file.filename,
      status: 'draft', recipient_count: transfer.eligible, queued_count: transfer.eligible,
      skipped_count: transfer.counts.queued - transfer.eligible,
      created_by: context.userId,
    }).select('*').single();
    if (createError || !broadcast) {
      if (createError?.code === '23505') return NextResponse.json({ error: 'Esta campanha já foi transferida. Atualize a página.' }, { status: 409 });
      throw createError ?? new Error('Falha ao criar a transmissão.');
    }

    try {
      for (let offset = 0; offset < transfer.eligibleRecipients.length; offset += 100) {
        const rows = transfer.eligibleRecipients.slice(offset, offset + 100).map((recipient) => ({
          ...recipient, organization_id: context.organization.id, broadcast_id: broadcast.id,
          status: 'queued',
        }));
        const { error: recipientError } = await admin.from('broadcast_recipients').insert(rows);
        if (recipientError) throw recipientError;
      }
      const { data: ready, error: readyError } = await admin.from('broadcasts')
        .update({ status: 'ready' }).eq('id', broadcast.id).eq('status', 'draft')
        .select('*').single();
      if (readyError || !ready) throw readyError ?? new Error('Falha ao concluir a preparação.');
      // Apenas PREPARAR: nunca invocar /send neste endpoint.
      return NextResponse.json({ broadcast: ready, eligible: transfer.eligible,
        skipped: transfer.counts.queued - transfer.eligible,
        partial: transfer.counts.partialOrObserved }, { status: 201 });
    } catch (error) {
      await admin.from('broadcasts').delete().eq('id', broadcast.id).eq('status', 'draft');
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao transferir a fila.' }, { status: 500 });
  }
}
