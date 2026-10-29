export function commercialIdentityError(error: { message?: string } | null | undefined): string | null {
  const message = error?.message ?? "";
  if (/COMMERCIAL_HISTORY_PROTECTED/.test(message)) return "Este contato possui histórico comercial. Você pode arquivá-lo, mas excluir, reclassificar ou mesclar exige revisão dos vínculos e das evidências.";
  if (/COMMERCIAL_SOURCE_PROTECTED|INTAKE_PRESERVE_SOURCE/.test(message)) return "Este documento ou compromisso integra o histórico comercial. Cancele sem apagar o registro; mudança de contato exige revisão específica.";
  if (/COMMERCIAL_EVIDENCE_PROTECTED/.test(message)) return "Esta conversa ou mensagem faz parte do histórico comercial e não pode ser apagada ou transferida por este atalho.";
  if (/COMMERCIAL_CONTACT_UNAVAILABLE/.test(message)) return "O contato mudou ou não está disponível nesta organização. Atualize a página antes de confirmar.";
  return null;
}
