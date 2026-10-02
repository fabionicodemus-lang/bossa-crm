import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  channelAccess,
  findChannelById,
  type WhatsAppChannelRecord,
} from '@/lib/whatsapp/channelService';
import { normalizeManualPhone } from '@/lib/whatsapp/utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

type AlertJob = {
  id: string;
  organization_id: string;
  lead_id: string;
  source_message_id: string | null;
  reason: string;
  summary: string;
  broker_name: string;
  broker_phone: string;
  status: string;
  attempts: number;
};

type AlertSettings = {
  organization_id: string;
  primary_owner_name: string;
  primary_owner_alert_phone: string | null;
  alert_sender_channel_id: string | null;
  enabled: boolean;
};

const TEMPLATE = {
  name: 'alerta_plantao_oportunidade_tais',
  language: 'pt_BR',
  category: 'UTILITY' as const,
  body: 'Alerta do Plantão fora do horário.\n\nCorretor: {{1}}\nTelefone: {{2}}\nAssunto: {{3}}\n\nResumo: {{4}}\n\nAbra o Bossa CRM para acompanhar.',
  examples: [
    'João Silva',
    '+55 47 99999-9999',
    'Corretor com cliente',
    'O corretor está com um cliente interessado no Flow e quer montar uma proposta.',
  ],
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret || request.headers.get('x-cron-secret') === secret;
}

function clean(value: unknown, fallback = 'Não informado') {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text || fallback;
}

function renderTemplate(values: string[]) {
  return values.reduce(
    (body, value, index) => body.replaceAll(`{{${index + 1}}}`, value),
    TEMPLATE.body,
  );
}

async function syncTemplate(
  admin: AdminClient,
  channel: WhatsAppChannelRecord,
) {
  const { data: existing } = await admin
    .from('whatsapp_templates')
    .select('*')
    .eq('organization_id', channel.organization_id)
    .eq('channel_id', channel.id)
    .eq('name', TEMPLATE.name)
    .eq('language', TEMPLATE.language)
    .maybeSingle();

  const { provider, accessToken, wabaId } = channelAccess(channel);
  const listed = await provider.listTemplates({ wabaId, accessToken });
  const remote = (listed.data ?? []).find(
    (item) => item.name === TEMPLATE.name && item.language === TEMPLATE.language,
  );

  if (remote) {
    const now = new Date().toISOString();
    const row = {
      organization_id: channel.organization_id,
      whatsapp_connection_id: channel.legacy_connection_id ?? channel.id,
      channel_id: channel.id,
      waba_id: channel.waba_id,
      meta_template_id: remote.id ?? existing?.meta_template_id ?? null,
      name: TEMPLATE.name,
      language: TEMPLATE.language,
      category: remote.category || TEMPLATE.category,
      status: remote.status || 'PENDING',
      quality_score: typeof remote.quality_score === 'string'
        ? remote.quality_score
        : remote.quality_score?.score ?? null,
      rejected_reason: remote.rejected_reason ?? null,
      header_format: 'NONE',
      body_text: TEMPLATE.body,
      footer_text: null,
      components: remote.components ?? existing?.components ?? [],
      buttons: [],
      variable_count: 4,
      source: 'CRM',
      submitted_at: existing?.submitted_at ?? now,
      last_synced_at: now,
      updated_at: now,
    };
    const { data, error } = await admin
      .from('whatsapp_templates')
      .upsert(row, { onConflict: 'whatsapp_connection_id,name,language' })
      .select('*')
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  if (existing) return existing as Record<string, unknown>;

  const components = [{
    type: 'BODY',
    text: TEMPLATE.body,
    example: { body_text: [TEMPLATE.examples] },
  }];
  const created = await provider.createTemplate({
    wabaId,
    accessToken,
    name: TEMPLATE.name,
    language: TEMPLATE.language,
    category: TEMPLATE.category,
    components,
  });
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('whatsapp_templates')
    .upsert({
      organization_id: channel.organization_id,
      whatsapp_connection_id: channel.legacy_connection_id ?? channel.id,
      channel_id: channel.id,
      waba_id: channel.waba_id,
      meta_template_id: created.id ?? null,
      name: TEMPLATE.name,
      language: TEMPLATE.language,
      category: created.category ?? TEMPLATE.category,
      status: created.status ?? 'PENDING',
      quality_score: null,
      rejected_reason: null,
      header_format: 'NONE',
      body_text: TEMPLATE.body,
      footer_text: null,
      components,
      buttons: [],
      variable_count: 4,
      source: 'CRM',
      submitted_at: now,
      last_synced_at: now,
    }, { onConflict: 'whatsapp_connection_id,name,language' })
    .select('*')
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function processJobs() {
  const admin = createAdminClient();
  const summary = { queued: 0, sent: 0, failed: 0, skipped: 0, template_pending: 0 };

  const { data: jobs, error: jobsError } = await admin
    .from('broker_after_hours_alert_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(40);
  if (jobsError) throw jobsError;
  summary.queued = jobs?.length ?? 0;

  if (!jobs?.length) {
    const { data: settingsRows, error: settingsError } = await admin
      .from('client_handoff_settings')
      .select('organization_id,primary_owner_name,primary_owner_alert_phone,alert_sender_channel_id,enabled')
      .eq('enabled', true);
    if (settingsError) throw settingsError;

    for (const rawSettings of settingsRows ?? []) {
      const settings = rawSettings as AlertSettings;
      if (!settings.alert_sender_channel_id) continue;
      try {
        const channel = await findChannelById(admin, settings.organization_id, settings.alert_sender_channel_id);
        if (!channel || channel.status !== 'connected') continue;
        const template = await syncTemplate(admin, channel);
        if (String(template?.status ?? '').toUpperCase() !== 'APPROVED') {
          summary.template_pending += 1;
        }
      } catch (error) {
        console.error('[plantao alert template bootstrap]', error);
      }
    }
    return summary;
  }

  const settingsCache = new Map<string, AlertSettings | null>();
  const channelCache = new Map<string, WhatsAppChannelRecord | null>();
  const templateCache = new Map<string, Record<string, unknown> | null>();

  for (const rawJob of jobs) {
    const job = rawJob as AlertJob;
    try {
      let settings = settingsCache.get(job.organization_id);
      if (settings === undefined) {
        const { data, error } = await admin
          .from('client_handoff_settings')
          .select('organization_id,primary_owner_name,primary_owner_alert_phone,alert_sender_channel_id,enabled')
          .eq('organization_id', job.organization_id)
          .maybeSingle();
        if (error) throw error;
        settings = data as AlertSettings | null;
        settingsCache.set(job.organization_id, settings);
      }

      if (!settings?.enabled || !settings.alert_sender_channel_id) {
        summary.skipped += 1;
        continue;
      }

      let channel = channelCache.get(job.organization_id);
      if (channel === undefined) {
        channel = await findChannelById(admin, job.organization_id, settings.alert_sender_channel_id);
        channelCache.set(job.organization_id, channel);
      }
      if (!channel || channel.status !== 'connected') {
        throw new Error('Canal interno de alertas não está conectado.');
      }

      let template = templateCache.get(job.organization_id);
      if (template === undefined) {
        template = await syncTemplate(admin, channel);
        templateCache.set(job.organization_id, template);
      }

      if (!template || String(template.status ?? '').toUpperCase() !== 'APPROVED') {
        summary.template_pending += 1;
        continue;
      }

      const approvedTemplate = template;
      const destination = normalizeManualPhone(settings.primary_owner_alert_phone ?? '');
      if (!destination) throw new Error('Telefone da Taís não configurado para alertas.');

      const values = [
        clean(job.broker_name, 'Corretor sem nome').slice(0, 200),
        clean(job.broker_phone, 'Sem telefone').slice(0, 100),
        clean(job.reason, 'Oportunidade comercial').slice(0, 200),
        clean(job.summary, 'O Plantão identificou uma conversa que precisa de acompanhamento humano.').slice(0, 900),
      ];
      const { provider, accessToken, phoneNumberId } = channelAccess(channel);
      const result = await provider.sendTemplate({
        phoneNumberId,
        accessToken,
        to: destination,
        name: String(approvedTemplate.name),
        language: String(approvedTemplate.language),
        bodyParameters: values,
        headerType: 'NONE',
      });
      const sentAt = new Date().toISOString();
      const rendered = renderTemplate(values);

      const transport = {
        organization_id: job.organization_id,
        channel_id: channel.id,
        conversation_id: null,
        lead_id: job.lead_id,
        wamid: result.messageId,
        direction: 'out',
        sender_kind: 'system',
        type: 'template',
        body: rendered,
        payload: {
          provider: result.raw,
          internal_notification: true,
          notification_kind: 'plantao_after_hours_opportunity',
          recipient: 'tais',
          source_message_id: job.source_message_id,
          alert_job_id: job.id,
          template_name: String(approvedTemplate.name),
        },
        status: 'sent',
        category: 'utility',
        sent_at: sentAt,
      };

      if (result.messageId) {
        await admin.from('whatsapp_messages')
          .upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true });
      } else {
        await admin.from('whatsapp_messages').insert(transport);
      }

      await Promise.all([
        admin.from('broker_after_hours_alert_jobs').update({
          status: 'sent',
          attempts: Number(job.attempts || 0) + 1,
          whatsapp_message_id: result.messageId,
          error_message: null,
          sent_at: sentAt,
          updated_at: sentAt,
        }).eq('id', job.id),
        admin.from('activities').insert({
          organization_id: job.organization_id,
          lead_id: job.lead_id,
          type: 'alerta_plantao_whatsapp_tais',
          title: 'Alerta do Plantão enviado para a Taís',
          description: `${job.reason}: ${job.summary}`,
          metadata: {
            alert_job_id: job.id,
            source_message_id: job.source_message_id,
            recipient_phone: destination,
            whatsapp_message_id: result.messageId,
          },
        }),
      ]);
      summary.sent += 1;
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      const message = error instanceof Error ? error.message : 'Falha ao enviar alerta do Plantão.';
      await admin.from('broker_after_hours_alert_jobs').update({
        attempts,
        status: attempts >= 10 ? 'failed' : 'queued',
        error_message: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      summary.failed += 1;
      console.error('[plantao after-hours alert worker]', message);
    }
  }

  return summary;
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    return NextResponse.json(await processJobs());
  } catch (error) {
    console.error('[plantao after-hours alert worker]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Falha ao processar alertas do Plantão.',
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
