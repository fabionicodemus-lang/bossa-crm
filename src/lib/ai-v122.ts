import { generateAiTurn as generateV121Turn } from './ai-v121';
import type { AiTrainingContext, AiTurn } from './ai';
import { aiCanReply } from './hybrid';
import { createAdminClient } from './supabase/admin';
import type { Lead } from './types';

export * from './ai-v121';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** A versão legada do webhook ainda passa as primeiras 100 mensagens.
 * Ancoramos o processamento na mensagem realmente mais recente do banco;
 * a v121 então relê as últimas 100, agrupa, verifica o claim e guarda memória. */
export async function generateAiTurn(
  lead: Lead,
  history: ChatMessage[],
  context: AiTrainingContext = {},
): Promise<AiTurn | null> {
  const conversationId = typeof lead.metadata?.whatsapp_conversation_id === 'string'
    ? lead.metadata.whatsapp_conversation_id : '';
  const receivedAt = new Date(lead.last_inbound_at || '').getTime();
  const live = Boolean(conversationId && Number.isFinite(receivedAt)
    && Date.now() - receivedAt >= 0 && Date.now() - receivedAt < 180_000 && aiCanReply(lead));
  if (!live) return generateV121Turn(lead, history, context);

  const admin = createAdminClient();
  const { data, error } = await admin.from('messages').select('body')
    .eq('whatsapp_conversation_id', conversationId).eq('direction', 'in')
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(1).maybeSingle();
  if (error || !data) {
    console.error('[ai latest inbound]', error?.message || 'Mensagem recente ausente.');
    return generateV121Turn(lead, history, context);
  }
  return generateV121Turn(lead, [...history, { role: 'user', content: String(data.body || '') }], context);
}
