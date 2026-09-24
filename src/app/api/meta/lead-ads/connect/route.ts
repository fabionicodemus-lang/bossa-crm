import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken } from '@/lib/whatsapp/crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

async function graphJson<T>(url: URL | string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({})) as T & GraphError;
  if (!response.ok) {
    const code = payload.error?.code ? ` Meta ${payload.error.code}${payload.error.error_subcode ? `/${payload.error.error_subcode}` : ''}` : '';
    throw new Error(`${payload.error?.message || `HTTP ${response.status}`}${code}`);
  }
  return payload;
}

function appConfig() {
  const appId = (process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? '').trim();
  const appSecret = (process.env.META_APP_SECRET ?? '').trim();
  const version = (process.env.META_GRAPH_VERSION ?? process.env.NEXT_PUBLIC_META_GRAPH_VERSION ?? '').trim();
  if (!appId || !appSecret || !version) throw new Error('Configuração Meta incompleta no servidor.');
  return { appId, appSecret, version };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id,role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem conectar o Meta Lead Ads.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { accessToken?: unknown };
    const shortToken = String(body.accessToken ?? '').trim();
    if (!shortToken) return NextResponse.json({ error: 'A Meta não devolveu o token de autorização.' }, { status: 400 });

    const { appId, appSecret, version } = appConfig();
    const exchange = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    exchange.searchParams.set('grant_type', 'fb_exchange_token');
    exchange.searchParams.set('client_id', appId);
    exchange.searchParams.set('client_secret', appSecret);
    exchange.searchParams.set('fb_exchange_token', shortToken);

    const longLived = await graphJson<{ access_token?: string; expires_in?: number }>(exchange);
    const userToken = String(longLived.access_token ?? '').trim() || shortToken;

    const permissionsUrl = new URL(`https://graph.facebook.com/${version}/me/permissions`);
    permissionsUrl.searchParams.set('access_token', userToken);
    const permissionsPayload = await graphJson<{ data?: Array<{ permission?: string; status?: string }> }>(permissionsUrl);
    const granted = (permissionsPayload.data ?? [])
      .filter((item) => item.status === 'granted' && item.permission)
      .map((item) => String(item.permission));
    const required = ['leads_retrieval', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'ads_read'];
    const missing = required.filter((scope) => !granted.includes(scope));
    if (missing.length) {
      return NextResponse.json({
        error: `Faltam permissões da Meta: ${missing.join(', ')}. Autorize novamente marcando todas as permissões.`,
        missing,
      }, { status: 409 });
    }

    const admin = createAdminClient();
    const { data: latestLeadEvent } = await admin
      .from('meta_lead_ads_events')
      .select('meta_page_id')
      .eq('organization_id', membership.organization_id)
      .not('meta_page_id', 'is', null)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const expectedPageId = String(latestLeadEvent?.meta_page_id ?? '').trim();

    const pagesUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    pagesUrl.searchParams.set('fields', 'id,name,access_token,tasks');
    pagesUrl.searchParams.set('limit', '100');
    pagesUrl.searchParams.set('access_token', userToken);
    const pagesPayload = await graphJson<{ data?: Array<{ id?: string; name?: string; access_token?: string; tasks?: string[] }> }>(pagesUrl);
    const pages = pagesPayload.data ?? [];
    const page = (expectedPageId ? pages.find((item) => item.id === expectedPageId) : null)
      ?? pages.find((item) => String(item.name ?? '').toLowerCase().includes('bossa empreendimentos'))
      ?? (pages.length === 1 ? pages[0] : null);

    if (!page?.id || !page.access_token) {
      return NextResponse.json({
        error: expectedPageId
          ? 'Seu login não devolveu acesso à Página da Bossa usada no formulário. Confirme o acesso à Página e tente novamente.'
          : 'Não foi possível identificar de forma segura a Página da Bossa no seu login Meta.',
        pages: pages.map((item) => ({ id: item.id ?? null, name: item.name ?? null })),
      }, { status: 409 });
    }

    const subscribeUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(page.id)}/subscribed_apps`);
    subscribeUrl.searchParams.set('subscribed_fields', 'leadgen');
    subscribeUrl.searchParams.set('access_token', page.access_token);
    await graphJson<{ success?: boolean }>(subscribeUrl, { method: 'POST' });

    let latestLeadReadable = false;
    let leadTestError: string | null = null;
    const { data: latestErrorEvent } = await admin
      .from('meta_lead_ads_events')
      .select('meta_leadgen_id')
      .eq('organization_id', membership.organization_id)
      .eq('meta_page_id', page.id)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErrorEvent?.meta_leadgen_id) {
      try {
        const leadUrl = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(String(latestErrorEvent.meta_leadgen_id))}`);
        leadUrl.searchParams.set('fields', 'id,created_time,ad_id,field_data');
        leadUrl.searchParams.set('access_token', page.access_token);
        await graphJson<Record<string, unknown>>(leadUrl);
        latestLeadReadable = true;
      } catch (error) {
        leadTestError = error instanceof Error ? error.message : 'Não foi possível ler o lead de teste.';
      }
    }

    const now = new Date().toISOString();
    const tokenExpiresAt = longLived.expires_in
      ? new Date(Date.now() + Number(longLived.expires_in) * 1000).toISOString()
      : null;
    const connection = {
      organization_id: membership.organization_id,
      page_id: page.id,
      page_name: page.name ?? null,
      app_id: appId,
      token_encrypted: encryptToken(page.access_token),
      user_token_encrypted: encryptToken(userToken),
      scopes: granted,
      status: 'connected',
      connected_by: user.id,
      connected_at: now,
      token_expires_at: tokenExpiresAt,
      last_tested_at: now,
      last_error: leadTestError,
      updated_at: now,
    };

    const { error: saveError } = await admin
      .from('meta_lead_ads_connections')
      .upsert(connection, { onConflict: 'organization_id' });
    if (saveError) throw saveError;

    return NextResponse.json({
      connected: true,
      pageId: page.id,
      pageName: page.name ?? null,
      scopes: granted,
      latestLeadReadable,
      leadTestError,
      status: 'connected',
    });
  } catch (error) {
    console.error('[meta lead ads connect]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível conectar o Meta Lead Ads.',
    }, { status: 500 });
  }
}
