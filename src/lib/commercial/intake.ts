export const commercialUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const intakeErrors: Record<string, string> = {
  INTAKE_INVALID: "Preencha comprador, intenção, próxima ação e evidência, e confirme a revisão.",
  INTAKE_FORBIDDEN: "Sem permissão para confirmar uma intenção de compra.",
  INTAKE_SOURCE_MISSING: "Registro não encontrado na fila desta organização. Volte e atualize a revisão.",
  INTAKE_STALE: "O documento ou compromisso mudou. Reabra a revisão antes de confirmar.",
  INTAKE_CLOSED: "Este registro está encerrado ou é um compromisso passado. Revise o histórico sem criar outra compra por este atalho.",
  INTAKE_BUYER: "Escolha um cliente ativo desta organização e confira sua relação com o contato de origem.",
  INTAKE_EXISTING: "Este comprador já tem oportunidade em aberto ou em nutrição. Vincule a existente; uma compra independente exige revisão separada.",
  INTAKE_ALREADY_LINKED: "O registro já está vinculado. Abra a oportunidade existente.",
  INTAKE_REPLAY_CONFLICT: "Esta origem já foi confirmada com outros dados. Abra a oportunidade existente; não foi criada outra.",
  unavailable: "Não foi possível confirmar. Confira a migração e as permissões; nenhuma criação parcial deve ser presumida como concluída.",
};
export type IntentInput = {
  entity_type: "proposals" | "agenda_events";
  entity_id: string; buyer_id: string; title: string;
  next_action: string; evidence: string; revision: string;
};
export function parseIntentInput(raw: Record<string, unknown>): IntentInput | null {
  const text = (key: string) => typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
  const entity = text("entity_type");
  const id = text("entity_id"), buyer = text("buyer_id");
  const title = text("title"), action = text("next_action"), evidence = text("evidence"), revision = text("revision");
  if ((entity !== "proposals" && entity !== "agenda_events") || !commercialUuid.test(id) || !commercialUuid.test(buyer)
    || title.length < 3 || title.length > 200 || action.length < 3 || action.length > 500
    || evidence.length < 20 || evidence.length > 2000 || raw.confirmed !== "yes"
    || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(revision) || !Number.isFinite(Date.parse(revision))) return null;
  // Keep the original precision: normalizing through Date would drop DB microseconds.
  return { entity_type: entity, entity_id: id, buyer_id: buyer, title, next_action: action, evidence, revision };
}
