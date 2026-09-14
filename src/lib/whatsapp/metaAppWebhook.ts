const REQUIRED_COEXISTENCE_FIELDS = [
  'messages',
  'history',
  'smb_app_state_sync',
  'smb_message_echoes',
] as const;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function graphBase() {
  return `https://graph.facebook.com/${required('META_GRAPH_VERSION')}`;
}

type Subscription = {
  object?: string;
  callback_url?: string;
  fields?: Array<{ name?: string }>;
};

type GraphError = {
  error?: { message?: string; code?: number; error_subcode?: number };
};

function graphError(payload: GraphError, status: number) {
  const error = payload.error;
  const suffix = error?.code ? ` (Meta ${error.code}${error.error_subcode ? `/${error.error_subcode}` : ''})` : '';
  return `${error?.message || `Meta Graph API: HTTP ${status}`}${suffix}`;
}

export async function ensureCoexistenceWebhookFields() {
  const appId = required('META_APP_ID');
  const appSecret = required('META_APP_SECRET');
  const verifyToken = required('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  const appUrl = required('NEXT_PUBLIC_APP_URL').replace(/\/$/, '');
  const callbackUrl = `${appUrl}/api/meta/whatsapp/webhook`;
  const appAccessToken = `${appId}|${appSecret}`;

  const currentResponse = await fetch(`${graphBase()}/${appId}/subscriptions`, {
    headers: { Authorization: `Bearer ${appAccessToken}` },
    cache: 'no-store',
  });
  const currentPayload = await currentResponse.json().catch(() => ({})) as { data?: Subscription[] } & GraphError;
  if (!currentResponse.ok) throw new Error(graphError(currentPayload, currentResponse.status));

  const current = (currentPayload.data ?? []).find((item) => item.object === 'whatsapp_business_account');
  const currentFields = (current?.fields ?? []).map((field) => String(field.name ?? '').trim()).filter(Boolean);
  const fields = [...new Set([...currentFields, ...REQUIRED_COEXISTENCE_FIELDS])];

  const body = new URLSearchParams({
    object: 'whatsapp_business_account',
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: fields.join(','),
    include_values: 'true',
  });
  const response = await fetch(`${graphBase()}/${appId}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appAccessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as { success?: boolean } & GraphError;
  if (!response.ok || payload.success === false) throw new Error(graphError(payload, response.status));

  return { callbackUrl, fields };
}
