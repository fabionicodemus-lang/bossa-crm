import { applyHybridDecision as applyOriginalDecision } from './hybrid-server';
import { deriveHybridDecision, type HybridDecision } from './hybrid';
import { whatsappCanStillReply } from './whatsapp/aiTurnSafety';

export * from './hybrid-server';

type Args = Parameters<typeof applyOriginalDecision>[0];
type ControlledTurn = Args['turn'] & {
  __bossaAiSkipped?: boolean;
  __bossaAiClaim?: { conversationId: string; sourceId: string };
};

function silentDecision(args: Args): HybridDecision {
  return {
    ...deriveHybridDecision({ lead: args.lead, turn: args.turn, lastUserMessage: args.lastUserMessage }),
    ownerMode: 'none',
    aiEnabled: false,
    handoffRequired: false,
    taskTitle: null,
    taskDedupeKey: null,
    taskDescription: null,
  };
}

/** Não altera etapas, cria tarefas nem envia mensagens para jobs obsoletos. */
export async function applyHybridDecision(args: Args): Promise<HybridDecision> {
  const turn = args.turn as ControlledTurn;
  if (turn.__bossaAiSkipped) return silentDecision(args);
  if (!turn.__bossaAiClaim) return applyOriginalDecision(args);

  const claim = turn.__bossaAiClaim;
  const allowed = await whatsappCanStillReply({
    admin: args.admin,
    leadId: args.lead.id,
    conversationId: claim.conversationId,
    sourceId: claim.sourceId,
  });
  if (!allowed) return silentDecision(args);

  const { data: source, error } = await args.admin.from('messages').select('body')
    .eq('id', claim.sourceId).maybeSingle();
  if (error || !source) return silentDecision(args);
  return applyOriginalDecision({
    ...args,
    lastUserMessage: String(source.body || ''),
    sourceMessageId: claim.sourceId,
  });
}
