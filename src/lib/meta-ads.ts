import type { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/whatsapp/crypto';

type AdminClient = ReturnType<typeof createAdminClient>;

type MetaInsightsResponse = {
  data?: Array<{ spend?: string }>;
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

export type MetaSpendResult = {
  status: 'ok' | 'permission_required' | 'not_configured' | 'error';
  spend: number | null;
  adAccountId: string | null;
  error: string | null;
};

export async function fetchMetaAdSpend(
  admin: AdminClient,
  organizationId: string,
  since: string,
  until: string,
): Promise<MetaSpendResult> {
  const { data: connection, error } = await admin
    .from('meta_lead_ads_connections')
    .select('user_token_encrypted,ad_account_id,scopes,status')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    return { status: 'error', spend: null, adAccountId: null, error: error.message };
  }
  if (!connection || connection.status !== 'connected' || !connection.ad_account_id) {
    return { status: 'not_configured', spend: null, adAccountId: connection?.ad_account_id ?? null, error: null };
  }

  const scopes = Array.isArray(connection.scopes) ? connection.scopes.map(String) : [];
  if (!connection.user_token_encrypted || !scopes.includes('ads_read')) {
    return {
      status: 'permission_required',
      spend: null,
      adAccountId: connection.ad_account_id,
      error: null,
    };
  }

  const version = process.env.META_GRAPH_VERSION?.trim();
  if (!version) {
    return {
      status: 'error',
      spend: null,
      adAccountId: connection.ad_account_id,
      error: 'META_GRAPH_VERSION não configurada.',
    };
  }

  try {
    const accessToken = decryptToken(String(connection.user_token_encrypted));
    const account = String(connection.ad_account_id).replace(/^act_/i, '');
    const url = new URL(`https://graph.facebook.com/${version}/act_${encodeURIComponent(account)}/insights`);
    url.searchParams.set('fields', 'spend');
    url.searchParams.set('level', 'account');
    url.searchParams.set('time_range', JSON.stringify({ since, until }));
    url.searchParams.set('limit', '1');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    const payload = await response.json().catch(() => ({})) as MetaInsightsResponse;
    if (!response.ok) {
      const suffix = payload.error?.code
        ? ` Meta ${payload.error.code}${payload.error.error_subcode ? `/${payload.error.error_subcode}` : ''}`
        : '';
      return {
        status: payload.error?.code === 200 || payload.error?.code === 190 ? 'permission_required' : 'error',
        spend: null,
        adAccountId: connection.ad_account_id,
        error: `${payload.error?.message || `HTTP ${response.status}`}${suffix}`,
      };
    }

    const raw = Number(payload.data?.[0]?.spend ?? 0);
    return {
      status: 'ok',
      spend: Number.isFinite(raw) ? raw : 0,
      adAccountId: connection.ad_account_id,
      error: null,
    };
  } catch (cause) {
    return {
      status: 'error',
      spend: null,
      adAccountId: connection.ad_account_id,
      error: cause instanceof Error ? cause.message : 'Não foi possível consultar o investimento na Meta.',
    };
  }
}
