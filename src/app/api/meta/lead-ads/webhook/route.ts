import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken, verifyMetaSignature } from '@/lib/whatsapp/crypto';
import {
  extractMetaLeadgenEvents,
  parseMetaLeadFieldData,
  type MetaLeadDetails,
} from '@/lib/meta-leads';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

type StoredEvent = {
  id: string;
  organization_id: string;
  meta_leadgen_id: string;
  meta_form_id: string | null;
  meta_ad_id: string | null;
  meta_page_id: string | null;
  raw_payload: Record<string, unknown>;
  status: string;
};

function webhookVerifyToken() {
  const value = (
    process.env.META_LEAD_ADS_VERIFY_TOKEN
    ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ?? ''
  ).trim();
  if (!value) throw new Error('META_LEAD_ADS_VERIFY_TOKEN ou WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurado.');
  return value;
}

async function resolveOrganizationId(admin: AdminClient) {
  const configured = process.env.META_LEAD_ADS_ORGANIZATION_ID?.trim();
  if (configured) {
    const { data, error } = await admin.from('organizations')
      .select('id')
      .eq('id', configured)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('META_LEAD_ADS_ORGANIZATION_ID não corresponde a uma organização existente.');
    return data.id as string;
  }

  const { data, error } = await admin.from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(2);
  if (error) throw error;
  if (data?.length === 1) return data[0].id as string;
  throw new Error('Há mais de uma organização no CRM. Configure META_LEAD_ADS_ORGANIZATION_ID.');
}

async function resolveLeadAdsAccessToken(admin: AdminClient, organizationId: string) {
  const dedicated = process.env.META_LEAD_ADS_ACCESS_TOKEN?.trim();
  if (dedicated) return dedicated;

  const { data, error } = await admin.from('whatsapp_channels')
    .select('token_encrypted')
    .eq('organization_id', organizationId)
    .eq('role', 'cliente')
    .eq('status', 'connected')
    .not('token_encrypted', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.token_encrypted) {
    throw new Error('Nenhum token Meta disponível. Configure META_LEAD_ADS_ACCESS_TOKEN.');
  }
  return decryptToken(String(data.token_encrypted));
}

async function fetchLeadDetails(leadgenId: string, accessToken: string) {
  const version = process.env.META_GRAPH_VERSION?.trim();
  if (!version) throw new Error('META_GRAPH_VERSION não configurada.');

  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set('fields', 'id,created_time,ad_id,field_data');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Meta Lead Ads retornou HTTP ${response.status}: ${body.slice(0, 1500)}`);
  }
  return response.json() as Promise<MetaLeadDetails>;
}

function metadataObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function findExistingLead(
  admin: AdminClient,
  organizationId: string,
  phone: string | null,
  email: string | null,
) {
  if (phone) {
    const { data, error } = await admin.from('leads')
      .select('id,name,phone,email,enterprise,source,metadata')
      .eq('organization_id', organizationId)
      .eq('kind', 'cliente')
      .eq('phone', phone)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (email) {
    const { data, error } = await admin.from('leads')
      .select('id,name,phone,email,enterprise,source,metadata')
      .eq('organization_id', organizationId)
      .eq('kind', 'cliente')
      .ilike('email', email)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

async function processStoredEvent(eventId: string) {
  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.from('meta_lead_ads_events')
    .update({ status: 'processing', error: null })
    .eq('id', eventId)
    .in('status', ['received', 'error'])
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  const event = claimed as StoredEvent;
  try {
    const accessToken = await resolveLeadAdsAccessToken(admin, event.organization_id);
    const details = await fetchLeadDetails(event.meta_leadgen_id, accessToken);
    const parsed = parseMetaLeadFieldData(details.field_data);
    const now = new Date().toISOString();
    const leadName = parsed.name || parsed.email || parsed.phone || `Lead Meta ${event.meta_leadgen_id}`;
    const existing = await findExistingLead(
      admin,
      event.organization_id,
      parsed.phone,
      parsed.email,
    );

    const metaSnapshot = {
      leadgen_id: event.meta_leadgen_id,
      form_id: event.meta_form_id,
      ad_id: details.ad_id ?? event.meta_ad_id,
      page_id: event.meta_page_id,
      created_time: details.created_time ?? event.raw_payload.created_time ?? null,
      received_at: now,
      answers: parsed.answers,
    };

    let leadId: string;
    let created = false;
    if (existing) {
      const patch: Record<string, unknown> = {
        metadata: {
          ...metadataObject(existing.metadata),
          meta_lead_ads: metaSnapshot,
        },
        updated_at: now,
      };
      if (!existing.phone && parsed.phone) patch.phone = parsed.phone;
      if (!existing.email && parsed.email) patch.email = parsed.email;
      if (!existing.enterprise && parsed.enterprise) patch.enterprise = parsed.enterprise;
      if ((!existing.name || String(existing.name).startsWith('Lead Meta ')) && parsed.name) {
        patch.name = parsed.name;
      }
      const { error } = await admin.from('leads').update(patch).eq('id', existing.id);
      if (error) throw error;
      leadId = existing.id as string;
    } else {
      const { data: lead, error } = await admin.from('leads').insert({
        organization_id: event.organization_id,
        kind: 'cliente',
        name: leadName,
        phone: parsed.phone,
        email: parsed.email,
        stage: 'novo_triagem',
        source: 'Meta Lead Ads',
        enterprise: parsed.enterprise,
        temperature: 0,
        ai_enabled: true,
        automation_paused: false,
        owner_mode: 'ai',
        metadata: { meta_lead_ads: metaSnapshot },
      }).select('id').single();
      if (error) throw error;
      leadId = lead.id as string;
      created = true;
    }

    await admin.from('activities').insert({
      organization_id: event.organization_id,
      lead_id: leadId,
      type: 'meta_lead_ads',
      title: created ? 'Novo lead captado pelo Meta' : 'Novo cadastro Meta vinculado ao lead',
      description: event.meta_form_id ? `Formulário Meta ${event.meta_form_id}` : 'Lead Ads',
      metadata: metaSnapshot,
    });

    const { error: finishError } = await admin.from('meta_lead_ads_events').update({
      lead_id: leadId,
      meta_ad_id: String(details.ad_id ?? event.meta_ad_id ?? '').trim() || null,
      field_data: parsed.answers,
      status: 'processed',
      error: null,
      processed_at: now,
    }).eq('id', event.id);
    if (finishError) throw finishError;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no Meta Lead Ads.';
    await admin.from('meta_lead_ads_events').update({
      status: 'error',
      error: message.slice(0, 2000),
    }).eq('id', event.id);
    throw error;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  try {
    if (mode === 'subscribe' && token === webhookVerifyToken()) {
      return new Response(challenge ?? '', { status: 200 });
    }
  } catch (error) {
    console.error('[meta lead ads handshake]', error);
    return new Response('Webhook not configured', { status: 500 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
      return new Response('Invalid signature', { status: 401 });
    }
  } catch (error) {
    console.error('[meta lead ads signature]', error);
    return new Response('Webhook not configured', { status: 500 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const leadEvents = extractMetaLeadgenEvents(payload);
  if (!leadEvents.length) {
    return NextResponse.json({ received: true, queued: 0 }, { status: 200 });
  }

  const admin = createAdminClient();
  let organizationId: string;
  try {
    organizationId = await resolveOrganizationId(admin);
  } catch (error) {
    console.error('[meta lead ads organization]', error);
    return NextResponse.json({ error: 'Lead Ads organization unavailable' }, { status: 500 });
  }

  const queuedIds: string[] = [];
  for (const leadEvent of leadEvents) {
    const row = {
      organization_id: organizationId,
      meta_leadgen_id: leadEvent.leadgenId,
      meta_form_id: leadEvent.formId,
      meta_ad_id: leadEvent.adId,
      meta_page_id: leadEvent.pageId,
      raw_payload: leadEvent.rawValue,
      status: 'received',
    };
    const { data: inserted, error } = await admin.from('meta_lead_ads_events')
      .upsert(row, { onConflict: 'meta_leadgen_id', ignoreDuplicates: true })
      .select('id,status')
      .maybeSingle();
    if (error) {
      console.error('[meta lead ads queue]', leadEvent.leadgenId, error.message);
      continue;
    }

    if (inserted?.id && inserted.status !== 'processed') {
      queuedIds.push(inserted.id as string);
      continue;
    }

    const { data: existing } = await admin.from('meta_lead_ads_events')
      .select('id,status')
      .eq('meta_leadgen_id', leadEvent.leadgenId)
      .maybeSingle();
    if (existing?.id && existing.status !== 'processed' && existing.status !== 'processing') {
      queuedIds.push(existing.id as string);
    }
  }

  if (queuedIds.length) {
    after(async () => {
      const results = await Promise.allSettled(queuedIds.map(processStoredEvent));
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error('[meta lead ads async]', queuedIds[index], result.reason);
        }
      });
    });
  }

  return NextResponse.json({ received: true, queued: queuedIds.length }, { status: 200 });
}
