import type { SupabaseClient } from '@supabase/supabase-js';

type AiTurnIdentity = {
  admin: SupabaseClient;
  leadId: string;
  conversationId: string;
  sourceId: string;
};

export async function whatsappClaimAiTurn(args: AiTurnIdentity): Promise<boolean> {
  const { data, error } = await args.admin.rpc('claim_whatsapp_ai_turn', {
    p_conversation_id: args.conversationId,
    p_source_message_id: args.sourceId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function whatsappMarkAiTurnSent(args: AiTurnIdentity): Promise<void> {
  const { error } = await args.admin.rpc('whatsapp_ai_turn_mark_sent', {
    p_conversation_id: args.conversationId,
    p_source_message_id: args.sourceId,
  });
  if (error) throw error;
}

/** Verificação final após a geração: não deixa um processamento antigo
 * alterar o pipeline nem responder caso outro texto ou humano tenha chegado. */
export async function whatsappCanStillReply(args: AiTurnIdentity & {
  allowDisabledLead?: boolean;
}): Promise<boolean> {
  const [{ data: current, error: claimError }, { data: lead, error: leadError }, { data: source, error: sourceError }] = await Promise.all([
    args.admin.rpc('whatsapp_ai_turn_is_current', {
      p_conversation_id: args.conversationId,
      p_source_message_id: args.sourceId,
    }),
    args.admin.from('leads').select('owner_mode,ai_enabled,automation_paused,opt_out').eq('id', args.leadId).maybeSingle(),
    args.admin.from('messages').select('created_at').eq('id', args.sourceId).maybeSingle(),
  ]);
  if (claimError || leadError || sourceError || !current || !lead || !source) return false;
  if (lead.opt_out) return false;
  if (!args.allowDisabledLead && (!lead.ai_enabled || lead.automation_paused || lead.owner_mode !== 'ai')) return false;
  const { data: humanMessage, error: humanError } = await args.admin.from('messages').select('id')
    .eq('whatsapp_conversation_id', args.conversationId)
    .eq('direction', 'out').eq('sender_kind', 'humano')
    .gt('created_at', source.created_at).limit(1).maybeSingle();
  return !humanError && !humanMessage;
}
