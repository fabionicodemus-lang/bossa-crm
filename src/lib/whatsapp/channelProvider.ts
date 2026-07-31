export type WhatsAppProviderName = 'meta_cloud';
export type WhatsAppChannelRole = 'cliente' | 'corretor';
export type WhatsAppMessageCategory = 'service' | 'marketing' | 'utility' | 'authentication';
export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document';

export type WhatsAppTemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  example?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WhatsAppTemplate = {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  quality_score?: { score?: string } | string | null;
  rejected_reason?: string | null;
  components?: WhatsAppTemplateComponent[];
};

export type WhatsAppPhoneInfo = {
  id: string;
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
};

export type WhatsAppConnectionTest = {
  phone: WhatsAppPhoneInfo;
  belongsToWaba: boolean;
};

export type WhatsAppSendResult = {
  messageId: string | null;
  raw: Record<string, unknown>;
};

export interface ChannelProvider {
  readonly name: WhatsAppProviderName;

  testConnection(input: {
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
  }): Promise<WhatsAppConnectionTest>;

  getPhoneInfo(input: {
    phoneNumberId: string;
    accessToken: string;
  }): Promise<WhatsAppPhoneInfo>;

  getMessagingLimit(input: {
    phoneNumberId: string;
    accessToken: string;
  }): Promise<string | null>;

  subscribeWebhook(input: {
    wabaId: string;
    accessToken: string;
  }): Promise<{ success: boolean }>;

  registerPhone(input: {
    phoneNumberId: string;
    accessToken: string;
    pin: string;
  }): Promise<{ success: boolean }>;

  sendText(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: string;
  }): Promise<WhatsAppSendResult>;

  sendTemplate(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    name: string;
    language: string;
    bodyParameters?: string[];
    headerType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
    headerMediaLink?: string;
    headerText?: string;
  }): Promise<WhatsAppSendResult>;

  sendMedia(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    type: WhatsAppMediaType;
    link: string;
    caption?: string;
    filename?: string;
  }): Promise<WhatsAppSendResult>;

  listTemplates(input: {
    wabaId: string;
    accessToken: string;
  }): Promise<{ data?: WhatsAppTemplate[] }>;

  createTemplate(input: {
    wabaId: string;
    accessToken: string;
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY';
    components: WhatsAppTemplateComponent[];
  }): Promise<{ id?: string; status?: string; category?: string }>;

  uploadTemplateMedia(input: {
    accessToken: string;
    fileName: string;
    fileType: string;
    bytes: ArrayBuffer;
  }): Promise<string>;
}
