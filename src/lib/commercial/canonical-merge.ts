type RpcResult = { data: unknown; error: unknown };
type MergeClient = { rpc(name: string, args: { p_keep: string; p_dup: string }): PromiseLike<RpcResult> };
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export async function checkCanonicalMerge(client: MergeClient, keep: string, duplicate: string) {
  try {
    const { data, error } = await client.rpc("commercial_merge_preflight", { p_keep: keep, p_dup: duplicate });
    const result = record(data);
    if (error || typeof result?.can_merge !== "boolean") return { status: "unavailable" as const };
    return { status: result.can_merge ? "ready" as const : "review_required" as const };
  } catch {
    return { status: "unavailable" as const };
  }
}

export type CanonicalMergeResult = {
  status: "not_requested" | "merged" | "review_required" | "failed";
  mergedFromLeadId: string | null;
  warning: string | null;
};
// Called only AFTER a successful send. A merge failure must not turn that send into
// an apparent delivery failure and invite the operator to send the message twice.
export async function mergeAfterConfirmedSend(client: MergeClient, keep: string, duplicate: string | null): Promise<CanonicalMergeResult> {
  if (!duplicate || duplicate === keep) return { status: "not_requested", mergedFromLeadId: null, warning: null };
  const failed: CanonicalMergeResult = {
    status: "failed", mergedFromLeadId: null,
    warning: "Mensagem enviada, mas a unificação dos contatos não foi confirmada. Confira o histórico; não reenvie a mensagem por causa deste aviso.",
  };
  try {
    const { data, error } = await client.rpc("merge_duplicate_lead", { p_keep: keep, p_dup: duplicate });
    if (error) return failed;
    const result = record(data);
    if (result?.ok === true && result.kept === keep && result.archived === duplicate) {
      return { status: "merged", mergedFromLeadId: duplicate, warning: null };
    }
    if (result?.ok === false && result.review_required === true) {
      return { status: "review_required", mergedFromLeadId: null,
        warning: "Mensagem enviada. A mesclagem exige revisão para preservar os vínculos e o histórico comercial; os contatos não foram unificados. Não é necessário reenviar a mensagem." };
    }
    return failed;
  } catch { return failed; }
}
