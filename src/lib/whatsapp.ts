import crypto from 'node:crypto';

const graphVersion = process.env.META_GRAPH_VERSION || 'v25.0';
const graphBase = `https://graph.facebook.com/${graphVersion}`;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

async function graphRequest<T>(path: string, options: RequestInit & { accessToken?: string } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${graphBase}/${path.replace(/^\//, '')}`, { ...options, headers, cache: 'no-store' });
  const data = await response.json() as T & { error?: { message?: string; code?: number; error_subcode?: number } };
  if (!response.ok) {
    const suffix = data.error?.code ? ` (Meta ${data.error.code}${data.error.error_subcode ? `/${data.error.error_subcode}` : ''})` : '';
    throw new Error(`${data.error?.message || `Meta Graph API: HTTP ${response.status}`}${suffix}`);
  }
  return data;
}

export async function exchangeEmbeddedSignupCode(code: string) {
  const params = new URLSearchParams({ client_id: required('META_APP_ID'), client_secret: required('META_APP_SECRET'), code });
  const response = await fetch(`${graphBase}/oauth/access_token?${params}`, { cache: 'no-store' });
  const data = await response.json() as { access_token?: string; error?: { message?: string } };
  if (!response.ok || !data.access_token) throw new Error(data.error?.message || 'A Meta não devolveu o token de acesso.');
  return data.access_token;
}

export async function subscribeAppToWaba(wabaId: string, accessToken: string) {
  return graphRequest<{ success: boolean }>(`${wabaId}/subscribed_apps`, { method: 'POST', accessToken });
}

export async function getPhoneNumber(phoneNumberId: string, accessToken: string) {
  return graphRequest<{ id: string; verified_name?: string; display_phone_number?: string; quality_rating?: string }>(
    `${phoneNumberId}?fields=id,verified_name,display_phone_number,quality_rating`,
    { accessToken },
  );
}

export type MetaTemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  example?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MetaMessageTemplate = {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  quality_score?: { score?: string } | string | null;
  components?: MetaTemplateComponent[];
};

export async function getWhatsAppTemplates(args: { wabaId: string; accessToken: string }) {
  const fields = encodeURIComponent('id,name,status,category,language,quality_score,components');
  return graphRequest<{ data?: MetaMessageTemplate[] }>(`${args.wabaId}/message_templates?limit=250&fields=${fields}`, {
    accessToken: args.accessToken,
  });
}

export async function sendWhatsAppText(args: { phoneNumberId: string; accessToken: string; to: string; body: string }) {
  return graphRequest<{ messages?: Array<{ id: string }> }>(`${args.phoneNumberId}/messages`, {
    method: 'POST',
    accessToken: args.accessToken,
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: args.to, type: 'text', text: { preview_url: false, body: args.body } }),
  });
}

export async function sendWhatsAppTemplate(args: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  name: string;
  language: string;
  bodyParameters?: string[];
  headerType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
  headerMediaLink?: string;
  headerText?: string;
}) {
  const components: Array<Record<string, unknown>> = [];
  const headerType = args.headerType ?? 'NONE';

  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && args.headerMediaLink) {
    const type = headerType.toLowerCase();
    components.push({
      type: 'header',
      parameters: [{ type, [type]: { link: args.headerMediaLink } }],
    });
  } else if (headerType === 'TEXT' && args.headerText) {
    components.push({ type: 'header', parameters: [{ type: 'text', text: args.headerText }] });
  }

  if (args.bodyParameters?.length) {
    components.push({
      type: 'body',
      parameters: args.bodyParameters.map((text) => ({ type: 'text', text: String(text).slice(0, 1024) })),
    });
  }

  return graphRequest<{ messages?: Array<{ id: string }> }>(`${args.phoneNumberId}/messages`, {
    method: 'POST',
    accessToken: args.accessToken,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: args.to,
      type: 'template',
      template: {
        name: args.name,
        language: { code: args.language },
        ...(components.length ? { components } : {}),
      },
    }),
  });
}

export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document';

export async function sendWhatsAppMedia(args: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: WhatsAppMediaType;
  link: string;
  caption?: string;
  filename?: string;
}) {
  const media: Record<string, string> = { link: args.link };
  if (args.caption && args.type !== 'audio') media.caption = args.caption.slice(0, 1024);
  if (args.filename && args.type === 'document') media.filename = args.filename.slice(0, 240);

  return graphRequest<{ messages?: Array<{ id: string }> }>(`${args.phoneNumberId}/messages`, {
    method: 'POST',
    accessToken: args.accessToken,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: args.to,
      type: args.type,
      [args.type]: media,
    }),
  });
}

function encryptionKey() {
  const key = Buffer.from(required('WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64'), 'base64');
  if (key.length !== 32) throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64 deve representar 32 bytes.');
  return key;
}

export function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptToken(payload: string) {
  const [ivRaw, tagRaw, dataRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error('Token criptografado inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function verifyMetaSignature(rawBody: string, header: string | null) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', required('META_APP_SECRET')).update(rawBody, 'utf8').digest('hex');
  const received = header.slice(7);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function normalizeWaId(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}
