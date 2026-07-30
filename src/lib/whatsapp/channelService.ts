import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ChannelProvider,
  WhatsAppChannelRole,
  WhatsAppProviderName,
} from '@/lib/whatsapp/channelProvider';
import { decryptToken } from '@/lib/whatsapp/crypto';
import { metaCloudProvider } from '@/lib/whatsapp/providers/metaCloud';
import { windowExpiresFromInbound } from '@/lib/whatsapp/window';

export type WhatsAppChannelRecord = {
  id: string;
  organization_id: string;
  label: string;
  role: WhatsAppChannelRole;
  provider: WhatsAppProviderName | string;
  business_id: string | null;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  token_encrypted: string;
  status: 'pending_registration' | 'connected' | 'disconnected' | 'error';
  messaging_limit: string | null;
  registered_at: string | null;
  app_subscribed_at: string | null;
  last_tested_at: string | null;
  legacy_connection_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppConversationRecord = {
  id: string;
  organization_id: string;
  channel_id: string;
  contact_wa_id: string;
  lead_id: string | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

export function getChannelProvider(provider: string): ChannelProvider {
  if (provider === 'meta_cloud') return metaCloudProvider;
  throw new Error(`Provedor de WhatsApp não suportado: ${provider}`);
}

export function channelAccess(channel: WhatsAppChannelRecord) {
  return {
    provider: getChannelProvider(channel.provider),
    accessToken: decryptToken(channel.token_encrypted),
    phoneNumberId: channel.phone_number_id,
    wabaId: channel.waba_id,
  };
}

export function roleForLeadKind(kind: 'cliente' | 'corretor'): WhatsAppChannelRole {
  return kind;
}

export function legacyChannelForRole(role: WhatsAppChannelRole) {
  return role === 'cliente' ? 'clientes' as const : 'corretores' as const;
}

export async function findChannelByRole(
  admin: AdminClient,
  organizationId: string,
  role: WhatsAppChannelRole,
  requireConnected = true,
) {
  let query = admin
    .from('whatsapp_channels')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('role', role);
  if (requireConnected) query = query.eq('status', 'connected');
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as WhatsAppChannelRecord | null;
}

export async function findChannelById(
  admin: AdminClient,
  organizationId: string,
  channelId: string,
) {
  const { data, error } = await admin
    .from('whatsapp_channels')
    .select('*')
    .eq('id', channelId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return data as WhatsAppChannelRecord | null;
}

export async function findChannelByPhoneNumberId(
  admin: AdminClient,
  phoneNumberId: string,
) {
  const { data, error } = await admin
    .from('whatsapp_channels')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  if (error) throw error;
  return data as WhatsAppChannelRecord | null;
}

export async function ensureConversation(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  contactWaId: string;
  leadId?: string | null;
}) {
  const { data: current, error: readError } = await args.admin
    .from('whatsapp_conversations')
    .select('*')
    .eq('channel_id', args.channel.id)
    .eq('contact_wa_id', args.contactWaId)
    .maybeSingle();
  if (readError) throw readError;

  if (current) {
    if (args.leadId && current.lead_id !== args.leadId) {
      const { data, error } = await args.admin
        .from('whatsapp_conversations')
        .update({ lead_id: args.leadId })
        .eq('id', current.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as WhatsAppConversationRecord;
    }
    return current as WhatsAppConversationRecord;
  }

  const { data, error } = await args.admin
    .from('whatsapp_conversations')
    .insert({
      organization_id: args.channel.organization_id,
      channel_id: args.channel.id,
      contact_wa_id: args.contactWaId,
      lead_id: args.leadId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as WhatsAppConversationRecord;
}

export async function openConversationWindow(args: {
  admin: AdminClient;
  channel: WhatsAppChannelRecord;
  contactWaId: string;
  leadId: string;
  receivedAt: string;
}) {
  const windowExpiresAt = windowExpiresFromInbound(args.receivedAt);
  const { data, error } = await args.admin
    .from('whatsapp_conversations')
    .upsert({
      organization_id: args.channel.organization_id,
      channel_id: args.channel.id,
      contact_wa_id: args.contactWaId,
      lead_id: args.leadId,
      last_inbound_at: args.receivedAt,
      window_expires_at: windowExpiresAt,
    }, { onConflict: 'channel_id,contact_wa_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data as WhatsAppConversationRecord;
}
