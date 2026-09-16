import type { SupabaseClient } from '@supabase/supabase-js';

/** Verificação final após a geração: não deixa um processamento antigo
 * alterar o pipeline nem responder caso outro texto ou humano tenha chegado. */
export async function whatsappCanStillReply(args: {
  admin: SupabaseClient;
  leadId: string;
  conversationId: string;
  sourceId: string;
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
  if (!lead.ai_enabled || lead.automation_paused || lead.opt_out || lead.owner_mode !== 'ai') return false;
  const { data: humanMessage, error: humanError } = await args.admin.from('messages').select('id')
    .eq('whatsapp_conversation_id', args.conversationId)
    .eq('direction', 'out').eq('sender_kind', 'humano')
    .gt('created_at', source.created_at).limit(1).maybeSingle();
  return !humanError && !humanMessage;
}
