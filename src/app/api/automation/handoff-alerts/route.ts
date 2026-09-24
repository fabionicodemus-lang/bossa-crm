import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  channelAccess,
  findChannelById,
  type WhatsAppChannelRecord,
} from '@/lib/whatsapp/channelService';
import { normalizeWaId } from '@/lib/whatsapp/utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

type HandoffSettings = {
  organization_id: string;
  primary_owner_user_id: string | null;
  primary_owner_name: string;
  primary_owner_alert_phone: string | null;
  manager_user_id: string | null;
  manager_name: string;
  manager_alert_phone: string | null;
  alert_sender_channel_id: string | null;
  alert_template_name: string;
  enabled: boolean;
};

type HandoffJob = {
  id: string;
  organization_id: string;
  lead_id: string;
  handoff_id: string;
  briefing: Record<string, unknown>;
  owner_status: string;
  manager_status: string;
  owner_attempts: number;
  manager_attempts: number;
  owner_message_id: string | null;
  manager_message_id: string | null;
  owner_error: string | null;
  manager_error: string | null;
  created_at: string;
};

const DEFAULT_TEMPLATE = {
  name: 'alerta_passagem_nara',
  language: 'pt_BR',
  category: 'UTILITY' as const,
  body: 'Nova passagem da Nara para a Taís.\n\nLead: {{1}}\n\nDados principais:\n{{2}}\n\nResumo da conversa:\n{{3}}\n\nPróxima ação:\n{{4}}\n\nAbra o Bossa CRM para continuar o atendimento.',
  examples: [
    'João Silva',
    'Telefone: +55 47 99999-9999 | Origem: Meta | Empreendimento: Flow | Prioridade: A1',
    'Busca apartamento para morar e pediu uma visita nesta semana.',
    'Entrar em contato e confirmar o melhor horário para a visita.',
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

function detailsFromBriefing(briefing: Record<string, unknown>) {
  const parts = [
    `Telefone: ${clean(briefing.phone)}`,
    `Origem: ${clean(briefing.source)}`,
    `Empreendimento: ${clean(briefing.enterprise)}`,
    `Prioridade: ${clean(briefing.priority_class)}`,
  ];
  const purpose = clean(briefing.purpose, '');
  const typology = clean(briefing.typology, '');
  const budget = clean(briefing.budget, '');
  const deadline = clean(briefing.deadline, '');
  const decisionMaker = clean(briefing.decision_maker, '');
  if (purpose) parts.push(`Objetivo: ${purpose}`);
  if (typology) parts.push(`Tipologia: ${typology}`);
  if (budget) parts.push(`Faixa: ${budget}`);
  if (deadline) parts.push(`Prazo: ${deadline}`);
  if (decisionMaker) parts.push(`Decisão: ${decisionMaker}`);
  return parts.join(' | ').slice(0, 950);
}

function renderTemplate(values: string[]) {
  return values.reduce(
    (body, value, index) => body.replaceAll(`{{${index + 1}}}`, value),
    DEFAULT_TEMPLATE.body,
  );
}

async function syncTemplate(
  admin: AdminClient,
  channel: WhatsAppChannelRecord,
  templateName: string,
) {
  const { data: existing } = await admin
    .from('whatsapp_templates')
    .select('*')
    .eq('organization_id', channel.organization_id)
    .eq('channel_id', channel.id)
    .eq('name', templateName)
    .eq('language', DEFAULT_TEMPLATE.language)
    .maybeSingle();

  const { provider, accessToken, wabaId } = channelAccess(channel);
  const listed = await provider.listTemplates({ wabaId, accessToken });
  const remote = (listed.data ?? []).find(
    (item) => item.name === templateName && item.language === DEFAULT_TEMPLATE.language,
  );

  if (remote) {
    const now = new Date().toISOString();
    const row = {
      organization_id: channel.organization_id,
      whatsapp_connection_id: channel.legacy_connection_id ?? channel.id,
      channel_id: channel.id,
      waba_id: channel.waba_id,
      meta_template_id: remote.id ?? existing?.meta_template_id ?? null,
      name: templateName,
      language: DEFAULT_TEMPLATE.language,
      category: remote.category || DEFAULT_TEMPLATE.category,
      status: remote.status || 'PENDING',
      quality_score: typeof remote.quality_score === 'string'
        ? remote.quality_score
        : remote.quality_score?.score ?? null,
      rejected_reason: remote.rejected_reason ?? null,
      header_format: 'NONE',
      body_text: DEFAULT_TEMPLATE.body,
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
    return data;
  }

  if (existing) return existing;

  const components = [{
    type: 'BODY',
    text: DEFAULT_TEMPLATE.body,
    example: { body_text: [DEFAULT_TEMPLATE.examples] },
  }];
  const created = await provider.createTemplate({
    wabaId,
    accessToken,
    name: templateName,
    language: DEFAULT_TEMPLATE.language,
    category: DEFAULT_TEMPLATE.category,
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
      name: templateName,
      language: DEFAULT_TEMPLATE.language,
      category: created.category ?? DEFAULT_TEMPLATE.category,
      status: created.status ?? 'PENDING',
      quality_score: null,
      rejected_reason: null,
      header_format: 'NONE',
      body_text: DEFAULT_TEMPLATE.body,
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
  return data;
}

async function sendRecipient(args: {
  admin: AdminClient;
  job: HandoffJob;
  settings: HandoffSettings;
  channel: WhatsAppChannelRecord;
  template: Record<string, unknown>;
  recipient: 'owner' | 'manager';
}) {
  const isOwner = args.recipient === 'owner';
  const phone = isOwner
    ? args.settings.primary_owner_alert_phone
    : args.settings.manager_alert_phone;
  const recipientName = isOwner
    ? args.settings.primary_owner_name
    : args.settings.manager_name;
  const statusKey = isOwner ? 'owner_status' : 'manager_status';
  const attemptsKey = isOwner ? 'owner_attempts' : 'manager_attempts';
  const messageKey = isOwner ? 'owner_message_id' : 'manager_message_id';
  const errorKey = isOwner ? 'owner_error' : 'manager_error';
  const sentAtKey = isOwner ? 'owner_sent_at' : 'manager_sent_at';
  const currentAttempts = isOwner ? args.job.owner_attempts : args.job.manager_attempts;

  const destination = normalizeWaId(phone ?? '');
  if (!destination) {
    await args.admin.from('client_handoff_alert_jobs').update({
      [statusKey]: 'skipped',
      [errorKey]: `Telefone de alerta de ${recipientName} não configurado.`,
      updated_at: new Date().toISOString(),
    }).eq('id', args.job.id);
    return 'skipped';
  }

  const briefing = args.job.briefing ?? {};
  const values = [
    clean(briefing.lead_name, 'Lead sem nome').slice(0, 200),
    detailsFromBriefing(briefing),
    clean(briefing.main_objection, 'A Nara encaminhou o atendimento ao comercial.').slice(0, 900),
    clean(briefing.next_best_action, 'Continuar o atendimento no Bossa CRM.').slice(0, 900),
  ];
  const { provider, accessToken, phoneNumberId } = channelAccess(args.channel);
  const result = await provider.sendTemplate({
    phoneNumberId,
    accessToken,
    to: destination,
    name: String(args.template.name),
    language: String(args.template.language),
    bodyParameters: values,
    headerType: 'NONE',
  });
  const sentAt = new Date().toISOString();
  const rendered = renderTemplate(values);

  const transport = {
    organization_id: args.job.organization_id,
    channel_id: args.channel.id,
    conversation_id: null,
    lead_id: args.job.lead_id,
    wamid: result.messageId,
    direction: 'out',
    sender_kind: 'system',
    type: 'template',
    body: rendered,
    payload: {
      provider: result.raw,
      internal_notification: true,
      notification_kind: 'nara_handoff',
      recipient: isOwner ? 'tais' : 'fabio',
      handoff_id: args.job.handoff_id,
      template_name: String(args.template.name),
    },
    status: 'sent',
    category: 'utility',
    sent_at: sentAt,
  };

  if (result.messageId) {
    await args.admin.from('whatsapp_messages')
      .upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true });
  } else {
    await args.admin.from('whatsapp_messages').insert(transport);
  }

  await Promise.all([
    args.admin.from('client_handoff_alert_jobs').update({
      [statusKey]: 'sent',
      [attemptsKey]: currentAttempts + 1,
      [messageKey]: result.messageId,
      [errorKey]: null,
      [sentAtKey]: sentAt,
      updated_at: sentAt,
    }).eq('id', args.job.id),
    args.admin.from('activities').insert({
      organization_id: args.job.organization_id,
      lead_id: args.job.lead_id,
      type: 'alerta_passagem_nara',
      title: `Alerta de passagem enviado para ${recipientName}`,
      description: values[2],
      metadata: {
        recipient: recipientName,
        recipient_phone: destination,
        handoff_id: args.job.handoff_id,
        whatsapp_message_id: result.messageId,
        responsible: args.settings.primary_owner_name,
      },
    }),
  ]);
  return 'sent';
}

async function runWorker() {
  const admin = createAdminClient();
  const summary = {
    organizations: 0,
    owner_sent: 0,
    manager_sent: 0,
    skipped: 0,
    errors: 0,
    templates_pending: 0,
  };

  const { data: settingsRows, error: settingsError } = await admin
    .from('client_handoff_settings')
    .select('*')
    .eq('enabled', true);
  if (settingsError) throw settingsError;

  for (const rawSettings of settingsRows ?? []) {
    const settings = rawSettings as HandoffSettings;
    summary.organizations += 1;

    if (!settings.alert_sender_channel_id) {
      summary.errors += 1;
      continue;
    }

    const channel = await findChannelById(
      admin,
      settings.organization_id,
      settings.alert_sender_channel_id,
    );
    if (!channel || channel.status !== 'connected') {
      summary.errors += 1;
      continue;
    }

    let template: Record<string, unknown>;
    try {
      template = await syncTemplate(
        admin,
        channel,
        settings.alert_template_name || DEFAULT_TEMPLATE.name,
      ) as Record<string, unknown>;
    } catch (error) {
      console.error('[handoff alert template]', error);
      summary.errors += 1;
      continue;
    }

    if (String(template.status ?? '').toUpperCase() !== 'APPROVED') {
      summary.templates_pending += 1;
      continue;
    }

    const { data: jobs, error: jobsError } = await admin
      .from('client_handoff_alert_jobs')
      .select('*')
      .eq('organization_id', settings.organization_id)
      .or('owner_status.eq.queued,manager_status.eq.queued')
      .order('created_at', { ascending: true })
      .limit(30);
    if (jobsError) {
      console.error('[handoff alert jobs]', jobsError.message);
      summary.errors += 1;
      continue;
    }

    for (const rawJob of jobs ?? []) {
      const job = rawJob as HandoffJob;
      if (job.owner_status === 'queued') {
        try {
          const result = await sendRecipient({
            admin, job, settings, channel, template, recipient: 'owner',
          });
          if (result === 'sent') summary.owner_sent += 1;
          else summary.skipped += 1;
        } catch (error) {
          const attempts = Number(job.owner_attempts || 0) + 1;
          const message = error instanceof Error ? error.message : 'Falha no alerta para Taís.';
          await admin.from('client_handoff_alert_jobs').update({
            owner_attempts: attempts,
            owner_status: attempts >= 10 ? 'failed' : 'queued',
            owner_error: message.slice(0, 1000),
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          summary.errors += 1;
        }
      }

      if (job.manager_status === 'queued') {
        try {
          const result = await sendRecipient({
            admin, job, settings, channel, template, recipient: 'manager',
          });
          if (result === 'sent') summary.manager_sent += 1;
          else summary.skipped += 1;
        } catch (error) {
          const attempts = Number(job.manager_attempts || 0) + 1;
          const message = error instanceof Error ? error.message : 'Falha no alerta para Fábio.';
          await admin.from('client_handoff_alert_jobs').update({
            manager_attempts: attempts,
            manager_status: attempts >= 10 ? 'failed' : 'queued',
            manager_error: message.slice(0, 1000),
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
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runWorker()) });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
