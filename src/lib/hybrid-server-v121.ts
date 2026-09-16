import { applyHybridDecision as applyOriginalDecision } from './hybrid-server';
import { deriveHybridDecision, type HybridDecision } from './hybrid';
import { whatsappCanStillReply } from './whatsapp/aiTurnSafety';

export * from './hybrid-server';

type Args = Parameters<typeof applyOriginalDecision>[0];
type ControlledTurn = Args['turn'] & {
  __bossaAiSkipped?: boolean;
  __bossaAiClaim?: { conversationId: string; sourceId: string };
  __bossaLastUserMessage?: string;
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
  if (turn.__bossaAiClaim) {
    const allowed = await whatsappCanStillReply({
      admin: args.admin,
      leadId: args.lead.id,
      conversationId: turn.__bossaAiClaim.conversationId,
      sourceId: turn.__bossaAiClaim.sourceId,
    });
    if (!allowed) return silentDecision(args);
  }
  return applyOriginalDecision({
    ...args,
    lastUserMessage: turn.__bossaLastUserMessage || args.lastUserMessage,
    sourceMessageId: turn.__bossaAiClaim?.sourceId || args.sourceMessageId,
  });
}
