export type AppRole = 'admin' | 'comercial' | 'viewer';
export type LeadKind = 'cliente' | 'corretor';
export type SenderKind = 'lead' | 'ia' | 'humano' | 'sistema';
export type MessageDirection = 'in' | 'out' | 'system';

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface UserContext {
  userId: string;
  email: string;
  fullName: string;
  organization: Organization;
  role: AppRole;
}

export interface Lead {
  id: string;
  organization_id: string;
  kind: LeadKind;
  kommo_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  source: string | null;
  enterprise: string | null;
  company: string | null;
  group_name: string | null;
  creci: string | null;
  temperature: number;
  ai_enabled: boolean;
  ai_classification: string | null;
  ai_summary: string | null;
  ai_next_action: string | null;
  ai_last_classified_at: string | null;
  owner_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  direction: MessageDirection;
  sender_kind: SenderKind;
  sender_user_id: string | null;
  body: string;
  status: string | null;
  whatsapp_message_id: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  user_id: string | null;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
