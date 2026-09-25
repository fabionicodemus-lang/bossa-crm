import { createAdminClient } from '@/lib/supabase/admin';
import { channelAccess, ensureConversation, findChannelByRole, type WhatsAppChannelRecord } from '@/lib/whatsapp/channelService';
import type { WhatsAppSendResult } from '@/lib/whatsapp/channelProvider';
import { normalizeWaId } from '@/lib/whatsapp/utils';
import { naraContactZone, naraSendHours } from '@/lib/nara-timezone';
import { findChannelById } from '@/lib/whatsapp/channelService';
import { processConversation } from '@/lib/whatsapp/webhookProcessor';

type Admin = ReturnType<typeof createAdminClient>;
const HOUR = 3_600_000;
const START = Date.parse('2026-09-25T00:00:00Z');
const ACTIVE = ['novo_triagem', 'qualificacao_ia', 'nutricao_ativa'];

export function followupZone(text: string) {
  return naraContactZone(text);
}

export function followupLanguage(text: string) {
  if (/\b(hola|soy|cu[aá]nto|quiero|departamento|desde chile|gracias)\b/i.test(text)) return 'es';
  if (/\b(hello|i am|how much|thank you|apartment)\b/i.test(text)) return 'en';
  return 'pt_BR';
}

export function insideFollowupHours(date: Date, zone: string) {
  return naraSendHours(date, zone);
}

const copy = {
  pt_BR: {
    first: 'Oi, {{1}}! Você procura quantas suítes em Porto Belo? Posso separar as opções mais adequadas para você.',
    second: 'Oi, {{1}}! Se ainda estiver considerando um imóvel da Bossa em Porto Belo, posso separar opções para você. Quer que eu faça isso?',
  },
  es: {
    first: 'Hola, {{1}}. ¿Cuántas suites buscas en Porto Belo? Puedo seleccionar las opciones más adecuadas para ti.',
    second: 'Hola, {{1}}. Si todavía estás considerando una propiedad de Bossa en Porto Belo, puedo seleccionar opciones para ti. ¿Te gustaría?',
  },
  en: {
    first: 'Hi, {{1}}. How many suites are you looking for in Porto Belo? I can select suitable options for you.',
    second: 'Hi, {{1}}. If you are still considering a Bossa property in Porto Belo, I can select some options for you. Would you like that?',
  },
};
export const followupTemplates = Object.entries(copy).flatMap(([language, value]) => [
  { name: 'nara_retomada_suites_v1', language, body: value.first },
  { name: 'nara_retomada_opcoes_v1', language, body: value.second },
]);

async function syncFollowupTemplates(admin: Admin, organizationId: string) {
  const channel = await findChannelByRole(admin, organizationId, 'cliente');
  if (!channel) return;
  const { provider, accessToken, wabaId } = channelAccess(channel);
  const remote = await provider.listTemplates({ wabaId, accessToken });
  for (const spec of followupTemplates) {
    const current = (remote.data ?? []).find((item) => item.name === spec.name && item.language === spec.language);
    const created = current ?? await provider.createTemplate({ wabaId, accessToken, name: spec.name,
      language: spec.language, category: 'MARKETING', components: [{
        type: 'BODY', text: spec.body, example: { body_text: [['Camila']] },
      }] });
    const now = new Date().toISOString();
    const { error } = await admin.from('whatsapp_templates').upsert({
      organization_id: organizationId, whatsapp_connection_id: channel.legacy_connection_id ?? channel.id,
      channel_id: channel.id, waba_id: channel.waba_id, meta_template_id: created.id ?? null,
      name: spec.name, language: spec.language, category: created.category ?? 'MARKETING',
      status: created.status ?? 'PENDING', header_format: 'NONE', body_text: spec.body,
      components: current?.components ?? [{ type: 'BODY', text: spec.body }], buttons: [], variable_count: 1,
      source: 'CRM', submitted_at: now, last_synced_at: now, updated_at: now,
    }, { onConflict: 'whatsapp_connection_id,name,language' });
    if (error) throw error;
  }
}

export async function runDeferredNaraReplies(admin: Admin, now = new Date()) {
  const summary = { sent: 0, cancelled: 0, failed: 0 };
  const { data: pending, error } = await admin.from('nara_deferred_replies').select('*')
    .eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const seen = new Set<string>();
  for (const reply of pending ?? []) {
    if (!naraSendHours(now, reply.timezone)) continue;
    if (seen.has(reply.lead_id)) {
      await admin.from('nara_deferred_replies').update({ status: 'cancelled' }).eq('id', reply.id);
      summary.cancelled++;
      continue;
    }
    seen.add(reply.lead_id);
    const { data: lead } = await admin.from('leads').select('*').eq('id', reply.lead_id).maybeSingle();
    const { data: inbound } = await admin.from('messages').select('created_at').eq('id', reply.source_message_id).maybeSingle();
    if (!lead || !inbound || lead.opt_out || lead.automation_paused || lead.owner_mode !== 'ai'
      || !lead.ai_enabled || !ACTIVE.includes(lead.stage)
      || (lead.metadata?.nara_reset_at && new Date(lead.metadata.nara_reset_at) > new Date(inbound.created_at))
      || now.getTime() >= new Date(inbound.created_at).getTime() + 24 * HOUR) {
      await admin.from('nara_deferred_replies').update({ status: 'cancelled' }).eq('id', reply.id);
      summary.cancelled++;
      continue;
    }
    const { count: outgoing } = await admin.from('messages').select('id', { count: 'exact', head: true })
      .eq('lead_id', lead.id).eq('direction', 'out').gte('created_at', inbound.created_at);
    if (outgoing) {
      await admin.from('nara_deferred_replies').update({ status: 'cancelled' }).eq('id', reply.id);
      summary.cancelled++;
      continue;
    }
    const channel = await findChannelById(admin, reply.organization_id, reply.channel_id);
    const { data: conversation } = await admin.from('whatsapp_conversations').select('*')
      .eq('id', reply.conversation_id).eq('channel_id', reply.channel_id).maybeSingle();
    if (!channel || !conversation) continue;
    const { data: claimed } = await admin.rpc('claim_nara_deferred_reply', { p_id: reply.id });
    if (!claimed) continue;
    try {
      await processConversation({ admin, channel, conversation, leadId: lead.id, sourceMessageId: reply.source_message_id });
      const { count: after } = await admin.from('messages').select('id', { count: 'exact', head: true })
        .eq('lead_id', lead.id).eq('direction', 'out').gte('created_at', inbound.created_at);
      await admin.from('nara_deferred_replies').update({ status: after ? 'sent' : 'failed' }).eq('id', reply.id);
      if (after) summary.sent++; else summary.failed++;
    } catch (sendError) {
      console.error('[nara deferred reply]', sendError);
      await admin.from('nara_deferred_replies').update({ status: 'failed' }).eq('id', reply.id);
      summary.failed++;
    }
  }
  return summary;
}

async function recordSend(admin: Admin, lead: { id: string; organization_id: string }, channel: WhatsAppChannelRecord, destination: string, body: string, result: WhatsAppSendResult, type: 'text' | 'template', step: string) {
  const conversation = await ensureConversation({ admin, channel, contactWaId: destination, leadId: lead.id });
  const sentAt = new Date().toISOString();
  const payload = { provider: result.raw, automation: 'nara_no_reply', step };
  const transport = {
    organization_id: lead.organization_id, channel_id: channel.id, conversation_id: conversation.id,
    lead_id: lead.id, wamid: result.messageId, direction: 'out', sender_kind: 'ia',
    type, body, payload, status: 'sent', category: type === 'template' ? 'marketing' : 'service', sent_at: sentAt,
  };
  const stored = result.messageId
    ? await admin.from('whatsapp_messages').upsert(transport, { onConflict: 'wamid', ignoreDuplicates: true })
    : await admin.from('whatsapp_messages').insert(transport);
  if (stored.error) throw stored.error;
  const message = await admin.from('messages').insert({
    organization_id: lead.organization_id, lead_id: lead.id, whatsapp_connection_id: channel.legacy_connection_id,
    whatsapp_channel_id: channel.id, whatsapp_conversation_id: conversation.id, direction: 'out', sender_kind: 'ia',
    body, status: 'sent', whatsapp_message_id: result.messageId, raw_payload: payload,
  });
  if (message.error) throw message.error;
  await admin.from('leads').update({ last_outbound_at: sentAt }).eq('id', lead.id);
  return sentAt;
}

export async function runNaraFollowups(admin: Admin, now = new Date()) {
  const counts = { created: 0, first_sent: 0, second_sent: 0, cancelled: 0, waiting_template: 0, errors: 0 };
  const { data: leads, error } = await admin.from('leads').select('*').eq('kind', 'cliente')
    .eq('owner_mode', 'ai').eq('ai_enabled', true).eq('opt_out', false)
    .gte('last_outbound_at', new Date(START).toISOString()).limit(500);
  if (error) throw error;
  const { data: clientChannels } = await admin.from('whatsapp_channels').select('organization_id')
    .eq('role', 'cliente').eq('status', 'connected');
  const organizations = [...new Set((clientChannels ?? []).map((channel) => channel.organization_id))];
  for (const organizationId of organizations) {
    try { await syncFollowupTemplates(admin, organizationId); }
    catch (templateError) { console.error('[nara cadence templates]', templateError); counts.errors++; }
  }
  for (const lead of leads ?? []) {
    if (!ACTIVE.includes(lead.stage) || lead.automation_paused || !lead.phone) continue;
    const reset = typeof lead.metadata?.nara_reset_at === 'string' ? lead.metadata.nara_reset_at : null;
    const { data: existing } = await admin.from('nara_followup_sequences').select('*').eq('lead_id', lead.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    // A fresh inbound or #reset ends the prior sequence.
    if (existing?.status === 'active' && ((lead.last_inbound_at && new Date(lead.last_inbound_at) > new Date(existing.anchor_inbound_at || existing.first_outbound_at))
      || (reset && new Date(reset) > new Date(existing.first_outbound_at)))) {
      await admin.from('nara_followup_sequences').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('id', existing.id);
      counts.cancelled++;
    }
    let firstQuery = admin.from('messages').select('id,created_at')
      .eq('lead_id', lead.id).eq('direction', 'out').eq('sender_kind', 'ia')
      .gte('created_at', new Date(START).toISOString());
    if (lead.last_inbound_at) firstQuery = firstQuery.gte('created_at', lead.last_inbound_at);
    const { data: first, error: msgError } = await firstQuery.order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (msgError || !first || new Date(first.created_at).getTime() > now.getTime()) continue;
    let sequence = existing?.anchor_message_id === first.id ? existing : null;
    if (!sequence) {
      let inboundQuery = admin.from('messages').select('body').eq('lead_id', lead.id).eq('direction', 'in');
      if (lead.last_inbound_at) inboundQuery = inboundQuery.gte('created_at', lead.last_inbound_at);
      const { data: inbound } = await inboundQuery.order('created_at').limit(1).maybeSingle();
      const context = `${inbound?.body || ''} ${lead.metadata?.city || ''} ${lead.city || ''}`;
      const { data, error: createError } = await admin.from('nara_followup_sequences').upsert({
        organization_id: lead.organization_id, lead_id: lead.id, anchor_message_id: first.id,
        first_outbound_at: first.created_at, anchor_inbound_at: lead.last_inbound_at,
        language: followupLanguage(inbound?.body || ''), timezone: followupZone(context),
      }, { onConflict: 'anchor_message_id', ignoreDuplicates: true }).select('*').maybeSingle();
      if (createError) { console.error('[nara cadence create]', createError); counts.errors++; continue; }
      sequence = data;
      counts.created++;
    }
    if (!sequence || sequence.status !== 'active') continue;
    const firstAt = new Date(sequence.first_outbound_at).getTime();
    if (firstAt + 8 * HOUR > now.getTime() || firstAt + 72 * HOUR <= now.getTime()
      || !insideFollowupHours(now, sequence.timezone)) continue;
    const { data: recent } = await admin.from('messages').select('id,direction,sender_kind,created_at')
      .eq('lead_id', lead.id).gt('created_at', sequence.first_outbound_at)
      .order('created_at', { ascending: true }).limit(30);
    if ((recent ?? []).some((item) => item.direction === 'in' || (item.direction === 'out' && item.sender_kind !== 'ia'))) {
      await admin.from('nara_followup_sequences').update({ status: 'cancelled' }).eq('id', sequence.id);
      counts.cancelled++;
      continue;
    }
    const { count: sentRecently } = await admin.from('messages').select('id', { count: 'exact', head: true })
      .eq('lead_id', lead.id).eq('direction', 'out').gte('created_at', new Date(now.getTime() - 14 * 24 * HOUR).toISOString())
      .contains('raw_payload', { automation: 'nara_no_reply' });
    if ((sentRecently ?? 0) >= 2) continue;
    const channel = await findChannelByRole(admin, lead.organization_id, 'cliente');
    if (!channel) continue;
    const destination = normalizeWaId(lead.phone);
    if (!destination) continue;
    const { provider, phoneNumberId, accessToken } = channelAccess(channel);
    const language = (sequence.language in copy ? sequence.language : 'pt_BR') as keyof typeof copy;
    const name = String(lead.name || '').trim().split(/\s+/)[0] || (language === 'es' ? 'amigo' : 'você');
    const windowOpen = lead.last_inbound_at && now.getTime() < new Date(lead.last_inbound_at).getTime() + 24 * HOUR;
    if (sequence.first_status === 'pending') {
      const firstTemplate = followupTemplates.find((item) => item.name === 'nara_retomada_suites_v1' && item.language === language)!;
      const { data: firstListed } = !windowOpen ? await admin.from('whatsapp_templates').select('status')
        .eq('channel_id', channel.id).eq('name', firstTemplate.name).eq('language', language).maybeSingle() : { data: null };
      if (!windowOpen && String(firstListed?.status).toUpperCase() !== 'APPROVED') {
        counts.waiting_template++;
      } else {
        const { data: claimed } = await admin.rpc('claim_nara_followup_step', { p_id: sequence.id, p_step: 'first' });
        if (claimed) {
          try {
            const body = copy[language].first.replace('{{1}}', name);
            const result = windowOpen
              ? await provider.sendText({ phoneNumberId, accessToken, to: destination, body })
              : await provider.sendTemplate({ phoneNumberId, accessToken, to: destination,
                name: firstTemplate.name, language, bodyParameters: [name], headerType: 'NONE' });
            const sentAt = await recordSend(admin, lead, channel, destination, body, result, windowOpen ? 'text' : 'template', 'first');
            await admin.from('nara_followup_sequences').update({ first_status: 'sent', first_sent_at: sentAt }).eq('id', sequence.id);
            counts.first_sent++;
          } catch (sendError) {
            await admin.from('nara_followup_sequences').update({ first_status: 'failed', error: String(sendError) }).eq('id', sequence.id);
            counts.errors++;
          }
        }
      }
    }
    if (firstAt + 48 * HOUR > now.getTime() || firstAt + 72 * HOUR <= now.getTime() || sequence.second_status !== 'pending') continue;
    const spec = followupTemplates.find((item) => item.name === 'nara_retomada_opcoes_v1' && item.language === language)!;
    const { data: listed } = await admin.from('whatsapp_templates').select('status')
      .eq('channel_id', channel.id).eq('name', spec.name).eq('language', language).maybeSingle();
    if (String(listed?.status).toUpperCase() !== 'APPROVED') { counts.waiting_template++; continue; }
    const { data: claimed } = await admin.rpc('claim_nara_followup_step', { p_id: sequence.id, p_step: 'second' });
    if (!claimed) continue;
    try {
      const body = spec.body.replace('{{1}}', name);
      const result = await provider.sendTemplate({ phoneNumberId, accessToken, to: destination,
        name: spec.name, language, bodyParameters: [name], headerType: 'NONE' });
      const sentAt = await recordSend(admin, lead, channel, destination, body, result, 'template', 'second');
      await admin.from('nara_followup_sequences').update({ second_status: 'sent', second_sent_at: sentAt }).eq('id', sequence.id);
      counts.second_sent++;
    } catch (sendError) {
      await admin.from('nara_followup_sequences').update({ second_status: 'failed', error: String(sendError) }).eq('id', sequence.id);
      counts.errors++;
    }
  }
  return counts;
}
