import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  channelAccess,
  ensureConversation,
  findChannelById,
  type WhatsAppChannelRecord,
} from '@/lib/whatsapp/channelService';
import { normalizeWaId } from '@/lib/whatsapp/utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

type TemplateSpec = {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  body: string;
  examples: string[];
};

type IntakeJob = {
  id: string;
  organization_id: string;
  lead_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  source_label: string | null;
  alert_attempts: number;
  nara_attempts: number;
  alert_status: string;
  nara_status: string;
  alert_due_at: string;
  nara_due_at: string;
  created_at: string;
};

type IntakeSettings = {
  organization_id: string;
  alert_enabled: boolean;
  alert_phone: string | null;
  alert_name: string | null;
  alert_channel_id: string | null;
  alert_template_name: string | null;
  nara_enabled: boolean;
  nara_channel_id: string | null;
  nara_delay_seconds: number;
  nara_template_name: string | null;
};

type TemplateRow = {
  status: string;
  name: string;
  language: string;
  body_text?: string | null;
};

const NARA_TEMPLATE: TemplateSpec = {
  name: 'nara_novo_lead_formulario',
  language: 'pt_BR',
  category: 'MARKETING',
  body: 'Olá, {{1}}! Tudo bem? 😊\n\nAqui é a Nara, da Bossa Empreendimentos. Recebemos seu cadastro e vou te ajudar com as informações dos nossos empreendimentos em Porto Belo.\n\nPosso te fazer algumas perguntas rápidas para entender melhor o que você procura?',
  examples: ['João'],
};

const ALERT_TEMPLATE: TemplateSpec = {
  name: 'alerta_novo_lead_bossa',
  language: 'pt_BR',
  category: 'UTILITY',
  body: 'Novo lead recebido no Bossa CRM.\n\nNome: {{1}}\nOrigem: {{2}}\nTelefone: {{3}}\n\nO lead já entrou no pipeline de clientes.',
  examples: ['João da Silva', 'FORMULARIO BRANDING', '+55 47 99999-9999'],
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret || request.headers.get('x-cron-secret') === secret;
}

function firstName(value: string | null | undefined) {
  const clean = String(value ?? '').trim();
  if (!clean) return 'Olá';
  if (clean.startsWith('<test lead:')) return 'Olá';
  return clean.split(/\s+/)[0].slice(0, 80);
}

function displayPhone(value: string | null | undefined) {
  const digits = normalizeWaId(String(value ?? ''));
  if (!digits) return 'Não informado';
  if (digits.startsWith('55') && digits.length >= 12) {
    const local = digits.slice(2);
    const ddd = local.slice(0, 2);
    const number = local.slice(2);
    return `+${digits.slice(0, 2)} ${ddd} ${number}`;
  }
  return digits;
}

function renderBody(text: string, values: string[]) {
  return values.reduce((current, value, index) => current.replaceAll(`{{${index + 1}}}`, value), text);
}

async function syncTemplate(
  admin: AdminClient,
  channel: WhatsAppChannelRecord,
  spec: TemplateSpec,
) {
  const { data: existing } = await admin.from('whatsapp_templates')
    .select('*')
    .eq('organization_id', channel.organization_id)
    .eq('channel_id', channel.id)
    .eq('name', spec.name)
    .eq('language', spec.language)
    .maybeSingle();

  if (existing && String(existing.status).toUpperCase() === 'APPROVED') return existing;

  const { provider, accessToken, wabaId } = channelAccess(channel);
  const listed = await provider.listTemplates({ wabaId, accessToken });
  const remote = (listed.data ?? []).find((item) => item.name === spec.name && item.language === spec.language);

  if (remote) {
    const now = new Date().toISOString();
    const row = {
      organization_id: channel.organization_id,
      whatsapp_connection_id: channel.legacy_connection_id ?? channel.id,
      channel_id: channel.id,
      waba_id: channel.waba_id,
      meta_template_id: remote.id ?? existing?.meta_template_id ?? null,
      name: spec.name,
      language: spec.language,
      category: remote.category || spec.category,
      status: remote.status || 'PENDING',
      quality_score: typeof remote.quality_score === 'string' ? remote.quality_score : remote.quality_score?.score ?? null,
      rejected_reason: remote.rejected_reason ?? null,
      header_format: 'NONE',
      body_text: spec.body,
      footer_text: null,
      components: remote.components ?? existing?.components ?? [],
      buttons: [],
      variable_count: spec.examples.length,
      source: 'CRM',
      submitted_at: existing?.submitted_at ?? now,
      last_synced_at: now,
      updated_at: now,
    };
    const { data, error } = await admin.from('whatsapp_templates')
      .upsert(row, { onConflict: 'whatsapp_connection_id,name,language' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  if (existing && ['PENDING', 'REJECTED', 'PAUSED', 'DISABLED'].includes(String(existing.status).toUpperCase())) {
    return existing;
  }

  const components = [{
    type: 'BODY',
    text: spec.body,
    example: { body_text: [spec.examples] },
  }];
  const created = await provider.createTemplate({
    wabaId,
    accessToken,
    name: spec.name,
    language: spec.language,
    category: spec.category,
    components,
  });
  const now = new Date().toISOString();
  const { data, error } = await admin.from('whatsapp_templates')
    .upsert({
      organization_id: channel.organization_id,
      whatsapp_connection_id: channel.legacy_connection_id ?? channel.id,
      channel_id: channel.id,
      waba_id: channel.waba_id,
      meta_template_id: created.id ?? null,
      name: spec.name,
      language: spec.language,
      category: created.category ?? spec.category,
      status: created.status ?? 'PENDING',
      quality_score: null,
      rejected_reason: null,
      header_format: 'NONE',
      body_text: spec.body,
      footer_text: null,
      components,
      buttons: [],
      variable_count: spec.examples.length,
      source: 'CRM',
      submitted_at: now,
      last_synced_at: now,
    }, { onConflict: 'whatsapp_connection_id,name,language' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function processAlert(admin: AdminClient, job: IntakeJob, settings: IntakeSettings, channel: WhatsAppChannelRecord, template: TemplateRow) {
  if (!settings.alert_enabled || !settings.alert_phone) {
    await admin.from('lead_intake_jobs').update({
      alert_status: 'skipped', alert_error: 'Alerta desativado ou sem telefone configurado.', updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return 'skipped';
  }
  if (String(template.status).toUpperCase() !== 'APPROVED') return 'waiting_template';

  const destination = normalizeWaId(String(settings.alert_phone));
  if (!destination) throw new Error('Telefone de alerta inválido.');
  const values = [
    String(job.lead_name || 'Lead sem nome').slice(0, 200),
    String(job.source_label || 'Meta Lead Ads').slice(0, 300),
    displayPhone(job.lead_phone),
  ];
  const { provider, accessToken, phoneNumberId } = channelAccess(channel);
  const result = await provider.sendTemplate({
    phoneNumberId,
    accessToken,
    to: destination,
    name: template.name,
    language: template.language,
    bodyParameters: values,
    headerType: 'NONE',
  });
  const now = new Date().toISOString();
  await Promise.all([
    admin.from('lead_intake_jobs').update({
      alert_status: 'sent',
      alert_message_id: result.messageId,
      alert_sent_at: now,
      alert_error: null,
      alert_attempts: Number(job.alert_attempts || 0) + 1,
      updated_at: now,
    }).eq('id', job.id),
    admin.from('activities').insert({
      organization_id: job.organization_id,
      lead_id: job.lead_id,
      type: 'novo_lead_alerta_whatsapp',
      title: 'Gestor avisado sobre novo lead',
      description: `${job.lead_name || 'Lead'} · ${job.source_label || 'Meta Lead Ads'}`,
      metadata: { whatsapp_message_id: result.messageId, recipient: settings.alert_name || 'Gestor' },
    }),
  ]);
  return 'sent';
}

async function processNara(admin: AdminClient, job: IntakeJob, settings: IntakeSettings, channel: WhatsAppChannelRecord, template: TemplateRow) {
  if (!settings.nara_enabled) {
    await admin.from('lead_intake_jobs').update({
      nara_status: 'skipped', nara_error: 'Primeiro contato automático desativado.', updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return 'skipped';
  }
  if (String(template.status).toUpperCase() !== 'APPROVED') return 'waiting_template';

  const { data: lead, error: leadError } = await admin.from('leads')
    .select('*').eq('id', job.lead_id).eq('organization_id', job.organization_id).maybeSingle();
  if (leadError) throw leadError;
  if (!lead) throw new Error('Lead não encontrado.');

  if (lead.kind !== 'cliente' || lead.opt_out || lead.automation_paused || lead.owner_mode === 'human') {
    await admin.from('lead_intake_jobs').update({
      nara_status: 'skipped',
      nara_error: 'Lead já está com atendimento humano, pausado ou opt-out.',
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return 'skipped';
  }

  const destination = normalizeWaId(String(lead.phone ?? job.lead_phone ?? ''));
  if (!destination) {
    await admin.from('lead_intake_jobs').update({
      nara_status: 'skipped', nara_error: 'Lead sem telefone válido.', updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return 'skipped';
  }

  const { count: outboundAfterIntake } = await admin.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead.id)
    .eq('direction', 'out')
    .gte('created_at', job.created_at);
  if ((outboundAfterIntake ?? 0) > 0) {
    await admin.from('lead_intake_jobs').update({
      nara_status: 'skipped',
      nara_error: 'O lead já recebeu atendimento depois da entrada.',
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return 'skipped';
  }

  const values = [firstName(lead.name)];
  const { provider, accessToken, phoneNumberId } = channelAccess(channel);
  const result = await provider.sendTemplate({
    phoneNumberId,
    accessToken,
    to: destination,
    name: template.name,
    language: template.language,
    bodyParameters: values,
    headerType: 'NONE',
  });
  const sentAt = new Date().toISOString();
  const conversation = await ensureConversation({
    admin,
    channel,
    contactWaId: destination,
    leadId: lead.id,
  });
  const rendered = renderBody(String(template.body_text || NARA_TEMPLATE.body), values);

  const transport = {
    organization_id: job.organization_id,
    channel_id: channel.id,
    conversation_id: conversation.id,
    lead_id: lead.id,
    wamid: result.messageId,
    direction: 'out',
    sender_kind: 'ia',
    type: 'template',
    body: rendered,
    payload: {
      provider: result.raw,
      automation: 'lead_intake_3min',
      template_name: template.name,
    },
    status: 'sent',
    category: 'marketing',
    sent_at: sentAt,
  };
  if (result.messageId) {
    await admin.from('whatsapp_messages').upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true });
  } else {
    await admin.from('whatsapp_messages').insert(transport);
  }

  await Promise.all([
    admin.from('messages').insert({
      organization_id: job.organization_id,
      lead_id: lead.id,
      whatsapp_connection_id: channel.legacy_connection_id ?? null,
      whatsapp_channel_id: channel.id,
      whatsapp_conversation_id: conversation.id,
      direction: 'out',
      sender_kind: 'ia',
      body: rendered,
      status: 'sent',
      whatsapp_message_id: result.messageId,
      raw_payload: {
        category: 'marketing',
        automation: 'lead_intake_3min',
        template_name: template.name,
      },
    }),
    admin.from('leads').update({
      stage: lead.stage === 'novo_triagem' ? 'qualificacao_ia' : lead.stage,
      owner_mode: 'ai',
      ai_enabled: true,
      last_outbound_at: sentAt,
      next_action: 'Aguardar resposta ao primeiro contato da Nara.',
      next_action_type: 'aguardar_resposta',
      next_action_due_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      updated_at: sentAt,
    }).eq('id', lead.id),
    admin.from('activities').insert({
      organization_id: job.organization_id,
      lead_id: lead.id,
      type: 'nara_primeiro_contato',
      title: 'Nara iniciou o atendimento do novo lead',
      description: rendered,
      metadata: {
        whatsapp_message_id: result.messageId,
        template_name: template.name,
        intake_delay_seconds: settings.nara_delay_seconds,
      },
    }),
    admin.from('lead_intake_jobs').update({
      nara_status: 'sent',
      nara_message_id: result.messageId,
      nara_sent_at: sentAt,
      nara_error: null,
      nara_attempts: Number(job.nara_attempts || 0) + 1,
      updated_at: sentAt,
    }).eq('id', job.id),
  ]);
  return 'sent';
}

async function runWorker() {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: settingsRows, error: settingsError } = await admin.from('lead_intake_settings').select('*');
  if (settingsError) throw settingsError;

  const summary = {
    organizations: 0,
    alert_sent: 0,
    nara_sent: 0,
    skipped: 0,
    errors: 0,
    templates_pending: 0,
  };

  for (const settings of (settingsRows ?? []) as IntakeSettings[]) {
    summary.organizations += 1;
    const alertChannel = settings.alert_channel_id
      ? await findChannelById(admin, settings.organization_id, settings.alert_channel_id)
      : null;
    const naraChannel = settings.nara_channel_id
      ? await findChannelById(admin, settings.organization_id, settings.nara_channel_id)
      : null;
    if (!alertChannel || alertChannel.status !== 'connected' || !naraChannel || naraChannel.status !== 'connected') {
      summary.errors += 1;
      continue;
    }

    let alertTemplate: TemplateRow;
    let naraTemplate: TemplateRow;
    try {
      [alertTemplate, naraTemplate] = await Promise.all([
        syncTemplate(admin, alertChannel, { ...ALERT_TEMPLATE, name: settings.alert_template_name || ALERT_TEMPLATE.name }),
        syncTemplate(admin, naraChannel, { ...NARA_TEMPLATE, name: settings.nara_template_name || NARA_TEMPLATE.name }),
      ]);
    } catch (error) {
      console.error('[lead intake templates]', error);
      summary.errors += 1;
      continue;
    }

    if (String(alertTemplate.status).toUpperCase() !== 'APPROVED') summary.templates_pending += 1;
    if (String(naraTemplate.status).toUpperCase() !== 'APPROVED') summary.templates_pending += 1;

    const { data: jobs, error: jobsError } = await admin.from('lead_intake_jobs')
      .select('*')
      .eq('organization_id', settings.organization_id)
      .or(`and(alert_status.eq.queued,alert_due_at.lte.${now}),and(nara_status.eq.queued,nara_due_at.lte.${now})`)
      .order('created_at', { ascending: true })
      .limit(30);
    if (jobsError) {
      console.error('[lead intake jobs]', jobsError.message);
      summary.errors += 1;
      continue;
    }

    for (const job of (jobs ?? []) as IntakeJob[]) {
      if (job.alert_status === 'queued' && new Date(job.alert_due_at).getTime() <= Date.now()) {
        try {
          const result = await processAlert(admin, job, settings, alertChannel, alertTemplate);
          if (result === 'sent') summary.alert_sent += 1;
          if (result === 'skipped') summary.skipped += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Falha no alerta.';
          await admin.from('lead_intake_jobs').update({
            alert_attempts: Number(job.alert_attempts || 0) + 1,
            alert_error: message.slice(0, 1000),
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          summary.errors += 1;
        }
      }

      if (job.nara_status === 'queued' && new Date(job.nara_due_at).getTime() <= Date.now()) {
        try {
          const result = await processNara(admin, job, settings, naraChannel, naraTemplate);
          if (result === 'sent') summary.nara_sent += 1;
          if (result === 'skipped') summary.skipped += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Falha no primeiro contato da Nara.';
          await admin.from('lead_intake_jobs').update({
            nara_attempts: Number(job.nara_attempts || 0) + 1,
            nara_error: message.slice(0, 1000),
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          summary.errors += 1;
        }
      }
    }
  }

  return summary;
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runWorker()) });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
