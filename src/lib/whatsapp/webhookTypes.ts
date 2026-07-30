export interface MetaWebhookMessage {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string | number;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  image?: { caption?: string; id?: string; mime_type?: string };
  document?: { caption?: string; filename?: string; id?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { caption?: string; id?: string; mime_type?: string };
  location?: Record<string, unknown>;
  contacts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface MetaWebhookStatus {
  id?: string;
  status?: string;
  timestamp?: string | number;
  recipient_id?: string;
  conversation?: Record<string, unknown>;
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
    type?: string;
  };
  errors?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface MetaWebhookValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    wa_id?: string;
    profile?: { name?: string };
  }>;
  statuses?: MetaWebhookStatus[];
  messages?: MetaWebhookMessage[];
  [key: string]: unknown;
}

export interface MetaWebhookChange {
  field?: string;
  value?: MetaWebhookValue;
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: MetaWebhookChange[];
  }>;
}

export interface StoredMetaWebhookEvent {
  id: string;
  organization_id: string | null;
  channel_id: string | null;
  phone_number_id: string | null;
  raw: {
    object?: string;
    entry_id?: string;
    change?: MetaWebhookChange;
    raw_text?: string;
    [key: string]: unknown;
  };
  signature_valid: boolean;
  received_at: string;
  processing_started_at: string | null;
  processed_at: string | null;
  attempts: number;
  error: string | null;
}
