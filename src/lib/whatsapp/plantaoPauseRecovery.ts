import type { SupabaseClient } from '@supabase/supabase-js';
import { findChannelById } from '@/lib/whatsapp/channelService';
import { processConversation } from '@/lib/whatsapp/webhookProcessor';
import { plantaoResumedAfterHumanPause, PLANTAO_HUMAN_PAUSE_MS } from '@/lib/whatsapp/plantaoHumanPause';
import { plantaoCanReplyNow } from '@/lib/whatsapp/plantaoSchedule';
import { isCustomerServiceWindowOpen } from '@/lib/whatsapp/window';

/** Minute worker: resume expired pauses, answer only pending inbound. */
export async function recoverPlantaoHumanPauses(admin: SupabaseClient) {
  const summary = { resumed: 0, attempted: 0, failed: 0 };
  const { data: candidates, error } = await admin.rpc('plantao_human_pause_candidates', { p_limit: 3 });
  if (error) throw error;
  await Promise.all((candidates ?? []).map(async (candidate: { lead_id: string }) => {
    try {
      const { data: resumed, error: resumeError } = await admin.rpc('resume_plantao_after_human_pause', { p_lead_id: candidate.lead_id });
      if (resumeError) throw resumeError;
      if (resumed) summary.resumed++;
      const { data: lead, error: leadError } = await admin.from('leads').select('*').eq('id', candidate.lead_id).maybeSingle();
      if (leadError) throw leadError;
      if (!lead || !plantaoResumedAfterHumanPause(lead) || !await plantaoCanReplyNow(admin, lead.organization_id)) return;
      const humanAt = new Date(Date.parse(lead.plantao_human_pause_until) - PLANTAO_HUMAN_PAUSE_MS).toISOString();
      const { data: source, error: sourceError } = await admin.from('messages')
        .select('id,created_at,whatsapp_conversation_id,whatsapp_channel_id')
        .eq('lead_id', lead.id).eq('direction', 'in').eq('sender_kind', 'lead')
        .gt('created_at', humanAt).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (sourceError) throw sourceError;
      if (!source?.whatsapp_conversation_id || !source.whatsapp_channel_id) return;
      const { data: answered, error: answeredError } = await admin.from('messages').select('id')
        .eq('whatsapp_conversation_id', source.whatsapp_conversation_id).eq('direction', 'out')
        .gte('created_at', source.created_at).limit(1).maybeSingle();
      if (answeredError) throw answeredError;
      if (answered) return;
      const channel = await findChannelById(admin, lead.organization_id, source.whatsapp_channel_id);
      const { data: conversation, error: conversationError } = await admin.from('whatsapp_conversations').select('*')
        .eq('id', source.whatsapp_conversation_id).eq('lead_id', lead.id).eq('channel_id', source.whatsapp_channel_id).maybeSingle();
      if (conversationError) throw conversationError;
      if (!channel || channel.role !== 'corretor' || !conversation || !isCustomerServiceWindowOpen(conversation.window_expires_at)) return;
      await processConversation({ admin, channel, conversation, leadId: lead.id, sourceMessageId: source.id });
      summary.attempted++;
    } catch (error) {
      summary.failed++;
      console.error('[plantao pause recovery]', candidate.lead_id, error);
    }
  }));
  return summary;
}
