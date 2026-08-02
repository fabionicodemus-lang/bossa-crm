import type {
  ChannelProvider,
  WhatsAppConnectionTest,
  WhatsAppPhoneInfo,
  WhatsAppSendResult,
  WhatsAppTemplate,
  WhatsAppTemplateComponent,
} from '@/lib/whatsapp/channelProvider';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function graphBase() {
  return `https://graph.facebook.com/${required('META_GRAPH_VERSION')}`;
}

type MetaErrorPayload = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_data?: Record<string, unknown>;
  };
};

function recipientNotAllowed(error: unknown) {
  return error instanceof Error && /\(Meta 131030(?:\/\d+)?\)/.test(error.message);
}

function brazilRecipientAlternative(value: string) {
  const digits = value.replace(/\D/g, '');
  if (/^55\d{10}$/.test(digits)) {
    return {
      value: `${digits.slice(0, 4)}9${digits.slice(4)}`,
      mode: 'br_ninth_digit_added',
    } as const;
  }
  if (/^55\d{11}$/.test(digits) && digits[4] === '9') {
    return {
      value: `${digits.slice(0, 4)}${digits.slice(5)}`,
      mode: 'br_ninth_digit_removed',
    } as const;
  }
  return null;
}

async function graphRequest<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${graphBase()}/${path.replace(/^\//, '')}`, {
    ...options,
    headers,
    cache: 'no-store',
  });
  const data = await response.json() as T & MetaErrorPayload;

  if (!response.ok) {
    const meta = data.error;
    const suffix = meta?.code
      ? ` (Meta ${meta.code}${meta.error_subcode ? `/${meta.error_subcode}` : ''})`
      : '';
    throw new Error(`${meta?.message || `Meta Graph API: HTTP ${response.status}`}${suffix}`);
  }

  return data;
}

function phoneInfo(value: {
  id: string;
  verified_name?: string;
  display_phone_number?: string;
  quality_rating?: string;
  whatsapp_business_manager_messaging_limit?: string;
}): WhatsAppPhoneInfo {
  return {
    id: value.id,
    verifiedName: value.verified_name ?? null,
    displayPhoneNumber: value.display_phone_number ?? null,
    qualityRating: value.quality_rating ?? null,
    messagingLimit: value.whatsapp_business_manager_messaging_limit ?? null,
  };
}

async function getPhoneInfo(input: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<WhatsAppPhoneInfo> {
  const fields = [
    'id',
    'verified_name',
    'display_phone_number',
    'quality_rating',
    'whatsapp_business_manager_messaging_limit',
  ].join(',');
  const result = await graphRequest<{
    id: string;
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
    whatsapp_business_manager_messaging_limit?: string;
  }>(`${input.phoneNumberId}?fields=${encodeURIComponent(fields)}`, {
    accessToken: input.accessToken,
  });
  return phoneInfo(result);
}

async function testConnection(input: {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}): Promise<WhatsAppConnectionTest> {
  const fields = encodeURIComponent('id');
  const [phone, numbers] = await Promise.all([
    getPhoneInfo(input),
    graphRequest<{ data?: Array<{ id: string }> }>(
      `${input.wabaId}/phone_numbers?limit=100&fields=${fields}`,
      { accessToken: input.accessToken },
    ),
  ]);
  return {
    phone,
    belongsToWaba: (numbers.data ?? []).some((item) => String(item.id) === input.phoneNumberId),
  };
}

function sendResult(raw: { messages?: Array<{ id?: string }> } & Record<string, unknown>): WhatsAppSendResult {
  return {
    messageId: raw.messages?.[0]?.id ?? null,
    raw,
  };
}

export async function exchangeEmbeddedSignupCode(code: string) {
  const params = new URLSearchParams({
    client_id: required('META_APP_ID'),
    client_secret: required('META_APP_SECRET'),
    code,
  });
  const response = await fetch(`${graphBase()}/oauth/access_token?${params}`, { cache: 'no-store' });
  const data = await response.json() as { access_token?: string; error?: { message?: string } };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error?.message || 'A Meta não devolveu o token de acesso.');
  }
  return data.access_token;
}

export const metaCloudProvider: ChannelProvider = {
  name: 'meta_cloud',

  testConnection,
  getPhoneInfo,

  async getMessagingLimit(input) {
    return (await getPhoneInfo(input)).messagingLimit;
  },

  async subscribeWebhook(input) {
    return graphRequest<{ success: boolean }>(`${input.wabaId}/subscribed_apps`, {
      method: 'POST',
      accessToken: input.accessToken,
    });
  },

  async registerPhone(input) {
    return graphRequest<{ success: boolean }>(`${input.phoneNumberId}/register`, {
      method: 'POST',
      accessToken: input.accessToken,
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: input.pin }),
    });
  },

  async sendText(input) {
    const send = (to: string) => graphRequest<{ messages?: Array<{ id?: string }> } & Record<string, unknown>>(
      `${input.phoneNumberId}/messages`,
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: input.body },
        }),
      },
    );

    try {
      return sendResult(await send(input.to));
    } catch (error) {
      const alternative = brazilRecipientAlternative(input.to);
      if (!alternative || !recipientNotAllowed(error)) throw error;

      const raw = await send(alternative.value);
      return sendResult({
        ...raw,
        bossa_recipient_fallback: alternative.mode,
      });
    }
  },

  async sendTemplate(input) {
    const components: Array<Record<string, unknown>> = [];
    const headerType = input.headerType ?? 'NONE';

    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && input.headerMediaLink) {
      const type = headerType.toLowerCase();
      components.push({
        type: 'header',
        parameters: [{ type, [type]: { link: input.headerMediaLink } }],
      });
    } else if (headerType === 'TEXT' && input.headerText) {
      components.push({ type: 'header', parameters: [{ type: 'text', text: input.headerText }] });
    }

    if (input.bodyParameters?.length) {
      components.push({
        type: 'body',
        parameters: input.bodyParameters.map((text) => ({
          type: 'text',
          text: String(text).slice(0, 1024),
        })),
      });
    }

    const raw = await graphRequest<{ messages?: Array<{ id?: string }> } & Record<string, unknown>>(
      `${input.phoneNumberId}/messages`,
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: input.to,
          type: 'template',
          template: {
            name: input.name,
            language: { code: input.language },
            ...(components.length ? { components } : {}),
          },
        }),
      },
    );
    return sendResult(raw);
  },

  async sendMedia(input) {
    const media: Record<string, string> = { link: input.link };
    if (input.caption && input.type !== 'audio') media.caption = input.caption.slice(0, 1024);
    if (input.filename && input.type === 'document') media.filename = input.filename.slice(0, 240);

    const raw = await graphRequest<{ messages?: Array<{ id?: string }> } & Record<string, unknown>>(
      `${input.phoneNumberId}/messages`,
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: input.to,
          type: input.type,
          [input.type]: media,
        }),
      },
    );
    return sendResult(raw);
  },

  async listTemplates(input) {
    const fields = encodeURIComponent('id,name,status,category,language,quality_score,rejected_reason,components');
    return graphRequest<{ data?: WhatsAppTemplate[] }>(
      `${input.wabaId}/message_templates?limit=250&fields=${fields}`,
      { accessToken: input.accessToken },
    );
  },

  async createTemplate(input) {
    return graphRequest<{ id?: string; status?: string; category?: string }>(
      `${input.wabaId}/message_templates`,
      {
        method: 'POST',
        accessToken: input.accessToken,
        body: JSON.stringify({
          name: input.name,
          language: input.language,
          category: input.category,
          components: input.components,
        }),
      },
    );
  },

  async uploadTemplateMedia(input) {
    const params = new URLSearchParams({
      file_length: String(input.bytes.byteLength),
      file_type: input.fileType,
      file_name: input.fileName,
    });
    const session = await graphRequest<{ id?: string }>(
      `${required('META_APP_ID')}/uploads?${params.toString()}`,
      { method: 'POST', accessToken: input.accessToken },
    );
    if (!session.id) throw new Error('A Meta não criou a sessão de upload do anexo.');

    const uploaded = await graphRequest<{ h?: string }>(session.id, {
      method: 'POST',
      accessToken: input.accessToken,
      headers: {
        'Content-Type': input.fileType,
        file_offset: '0',
      },
      body: input.bytes,
    });
    if (!uploaded.h) throw new Error('A Meta não devolveu o identificador do anexo.');
    return uploaded.h;
  },
};

export type { WhatsAppTemplateComponent };
