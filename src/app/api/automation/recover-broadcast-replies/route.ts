import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processConversation } from '@/lib/whatsapp/webhookProcessor';
import { findChannelById, type WhatsAppConversationRecord } from '@/lib/whatsapp/channelService';
import { phoneMatchVariants } from '@/lib/whatsapp/utils';
import type { Lead } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type MessageRow = {
  id: string;
  lead_id: string;
  body: string | null;
  created_at: string;
  whatsapp_channel_id: string | null;
  whatsapp_conversation_id: string | null;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret || request.headers.get('x-cron-secret') === secret;
}

function intersects(a: string[], b: string[]) {
  const set = new Set(a);
  return b.some((value) => set.has(value));
}

function likelyAutomaticReply(body: string) {
  const value = body
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');

  return [
    'nao estamos disponiveis no momento',
    'nao estou online',
    'bem vindo ao studio',
    'bem-vindo ao studio',
    'bem vindo ao la lija',
    'bem-vindo ao la lija',
    'que bom te ver por aqui',
    'para iniciar nosso atendimento',
    'somos especialistas em laudos',
    'ja vamos conversar com voce',
  ].some((needle) => value.includes(needle));
}

async function fetchLeads(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const result: Lead[] = [];
  for (let index = 0; index < unique.length; index += 200) {
    const batch = unique.slice(index, index + 200);
    const { data, error } = await admin
      .from('leads')
      .select('*')
      .in('id', batch);
    if (error) throw error;
    result.push(...((data ?? []) as Lead[]));
  }
  return result;
}

async function recover(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const broadcastId = String(url.searchParams.get('broadcastId') ?? '').trim();
  const requestedLimit = Number(url.searchParams.get('limit') ?? '4');
  const limit = Math.max(1, Math.min(5, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 4));
  if (!broadcastId) return NextResponse.json({ error: 'broadcastId obrigatório.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: broadcast, error: broadcastError } = await admin
    .from('broadcasts')
    .select('id,organization_id,name')
    .eq('id', broadcastId)
    .maybeSingle();
  if (broadcastError) throw broadcastError;
  if (!broadcast) return NextResponse.json({ error: 'Transmissão não encontrada.' }, { status: 404 });

  const { data: sentRows, error: sentError } = await admin
    .from('messages')
    .select('id,lead_id,body,created_at,whatsapp_channel_id,whatsapp_conversation_id')
    .eq('organization_id', broadcast.organization_id)
    .eq('direction', 'out')
    .contains('raw_payload', { broadcast_id: broadcastId })
    .order('created_at', { ascending: true })
    .limit(5000);
  if (sentError) throw sentError;
  const sent = (sentRows ?? []) as MessageRow[];
  if (!sent.length) {
    return NextResponse.json({ ok: true, broadcast: broadcast.name, selected: 0, processed: [], ignored_auto: [] });
  }

  const earliest = sent[0].created_at;
  const [{ data: inboundRows, error: inboundError }, { data: outboundRows, error: outboundError }] = await Promise.all([
    admin.from('messages')
      .select('id,lead_id,body,created_at,whatsapp_channel_id,whatsapp_conversation_id')
      .eq('organization_id', broadcast.organization_id)
      .eq('direction', 'in')
      .gte('created_at', earliest)
      .order('created_at', { ascending: false })
      .limit(5000),
    admin.from('messages')
      .select('id,lead_id,body,created_at,whatsapp_channel_id,whatsapp_conversation_id')
      .eq('organization_id', broadcast.organization_id)
      .eq('direction', 'out')
      .gte('created_at', earliest)
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);
  if (inboundError) throw inboundError;
  if (outboundError) throw outboundError;

  const inbound = (inboundRows ?? []) as MessageRow[];
  const outbound = (outboundRows ?? []) as MessageRow[];
  const leads = await fetchLeads(admin, [
    ...sent.map((row) => row.lead_id),
    ...inbound.map((row) => row.lead_id),
    ...outbound.map((row) => row.lead_id),
  ]);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const variantsByLead = new Map(leads.map((lead) => [lead.id, phoneMatchVariants(lead.phone)]));

  const seenSources = new Set<string>();
  const candidates: Array<{ source: MessageRow; lead: Lead; sentAt: string }> = [];

  for (const broadcastMessage of sent) {
    const sentVariants = variantsByLead.get(broadcastMessage.lead_id) ?? [];
    if (!sentVariants.length) continue;
    const sentAtMs = new Date(broadcastMessage.created_at).getTime();
    const untilMs = sentAtMs + 7 * 24 * 60 * 60 * 1000;

    const source = inbound.find((row) => {
      const time = new Date(row.created_at).getTime();
      const variants = variantsByLead.get(row.lead_id) ?? [];
      return time > sentAtMs && time <= untilMs && intersects(sentVariants, variants);
    });
    if (!source || seenSources.has(source.id)) continue;

    const sourceVariants = variantsByLead.get(source.lead_id) ?? [];
    const alreadyAnswered = outbound.some((row) => {
      const variants = variantsByLead.get(row.lead_id) ?? [];
      return new Date(row.created_at).getTime() > new Date(source.created_at).getTime()
        && intersects(sourceVariants, variants);
    });
    if (alreadyAnswered) continue;

    const lead = leadById.get(source.lead_id);
    if (!lead || lead.kind !== 'cliente' || lead.archived_at) continue;

    seenSources.add(source.id);
    candidates.push({ source, lead, sentAt: broadcastMessage.created_at });
  }

  candidates.sort((a, b) => new Date(a.source.created_at).getTime() - new Date(b.source.created_at).getTime());
  const ignoredAuto = candidates
    .filter(({ source }) => likelyAutomaticReply(String(source.body ?? '')))
    .map(({ lead, source }) => ({ name: lead.name, phone: lead.phone, message: source.body, received_at: source.created_at }));

  const actionable = candidates
    .filter(({ source }) => !likelyAutomaticReply(String(source.body ?? '')))
    .slice(0, limit);

  const processed: Array<Record<string, unknown>> = [];
  for (const item of actionable) {
    const channelId = item.source.whatsapp_channel_id;
    const conversationId = item.source.whatsapp_conversation_id;
    if (!channelId || !conversationId) {
      processed.push({ name: item.lead.name, status: 'skipped_missing_whatsapp_context' });
      continue;
    }

    const [channel, conversationResult] = await Promise.all([
      findChannelById(admin, broadcast.organization_id, channelId),
      admin.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle(),
    ]);
    if (conversationResult.error) throw conversationResult.error;
    const conversation = conversationResult.data as WhatsAppConversationRecord | null;
    if (!channel || !conversation) {
      processed.push({ name: item.lead.name, status: 'skipped_missing_channel_or_conversation' });
      continue;
    }

    try {
      await processConversation({
        admin,
        channel,
        conversation,
        leadId: item.lead.id,
        sourceMessageId: item.source.id,
      });
      const { data: afterRows } = await admin
        .from('messages')
        .select('id,sender_kind,created_at')
        .eq('lead_id', item.lead.id)
        .eq('direction', 'out')
        .gt('created_at', item.source.created_at)
        .order('created_at', { ascending: true })
        .limit(3);
      const { data: activityRows } = await admin
        .from('activities')
        .select('type,title,created_at')
        .eq('lead_id', item.lead.id)
        .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(3);

      processed.push({
        name: item.lead.name,
        phone: item.lead.phone,
        message: item.source.body,
        received_at: item.source.created_at,
        status: (afterRows ?? []).length ? 'replied' : 'handled_without_ai_text',
        outbound: afterRows ?? [],
        activities: activityRows ?? [],
      });
    } catch (error) {
      processed.push({
        name: item.lead.name,
        phone: item.lead.phone,
        status: 'error',
        error: error instanceof Error ? error.message : 'Falha desconhecida',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    broadcast: broadcast.name,
    candidates: candidates.length,
    selected: actionable.length,
    processed,
    ignored_auto: ignoredAuto,
  });
}

export async function GET(request: Request) {
  return recover(request);
}

export async function POST(request: Request) {
  return recover(request);
}
