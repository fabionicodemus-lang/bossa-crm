export type AppRole = 'admin' | 'comercial' | 'viewer';
export type LeadKind = 'cliente' | 'corretor';
export type SenderKind = 'lead' | 'ia' | 'humano' | 'sistema';
export type MessageDirection = 'in' | 'out' | 'system';
export type OwnerMode = 'ai' | 'human' | 'none';
export type LeadTaskStatus = 'pending' | 'completed' | 'cancelled' | 'overdue';

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
  owner_mode?: OwnerMode | null;
  backup_owner_id?: string | null;
  priority_class?: 'A1' | 'A2' | 'B' | 'C' | 'D' | null;
  next_action?: string | null;
  next_action_type?: string | null;
  next_action_due_at?: string | null;
  reactivation_at?: string | null;
  handoff_requested_at?: string | null;
  handoff_accepted_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  last_human_activity_at?: string | null;
  last_ai_activity_at?: string | null;
  loss_reason?: string | null;
  opt_out?: boolean | null;
  automation_paused?: boolean | null;
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

export interface LeadTask {
  id: string;
  organization_id: string;
  lead_id: string;
  assigned_to: string | null;
  assigned_mode: 'ai' | 'human' | 'manager';
  type: string;
  title: string;
  description: string | null;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  status: LeadTaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_by_kind: 'ai' | 'human' | 'system';
  created_by: string | null;
  dedupe_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LeadHandoff {
  id: string;
  organization_id: string;
  lead_id: string;
  requested_by: 'ai' | 'human' | 'system';
  offered_to: string | null;
  backup_to: string | null;
  accepted_by: string | null;
  priority_class: 'A1' | 'A2' | 'B' | 'C' | 'D' | null;
  reason: string | null;
  briefing: Record<string, unknown>;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  user_id: string;
  full_name: string;
  email: string;
  role: AppRole;
}
