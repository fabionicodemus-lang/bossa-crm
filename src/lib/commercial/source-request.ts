/** Reuse a command while its response is uncertain. Never deduplicate by customer or amount. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${stableJson(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export class SourceSaveAttempt {
  private attempt: { id: string; fingerprint: string } | null = null;
  get pending() { return this.attempt !== null; }
  prepare(payload: unknown, makeId: () => string = () => crypto.randomUUID()): string {
    const fingerprint = stableJson(payload);
    if (this.attempt && this.attempt.fingerprint !== fingerprint) {
      throw new Error('A gravação anterior ainda não foi confirmada. Retome os dados daquela tentativa e salve novamente, ou confira o registro antes de iniciar outra operação.');
    }
    this.attempt ??= { id: makeId(), fingerprint };
    return this.attempt.id;
  }
  complete() { this.attempt = null; }
  rejected(cause: unknown) {
    const failure = sourceRequestFailure(cause);
    if (failure.definiteRollback) this.complete();
  }
}

export function sourceRequestFailure(cause: unknown) {
  const error = cause && typeof cause === 'object' ? cause as { code?: string; message?: string } : {};
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  if (message.includes('COMMERCIAL_RECOVERY_PENDING')) return {
    message: 'Existe um salvamento anterior para conferir. Use a recuperação acima antes de iniciar outro pedido.', status: 409, definiteRollback: true,
  };
  if (message.includes('COMMERCIAL_RECOVERY_ABANDONED')) return {
    message: 'Esta tentativa foi abandonada e não será executada. Atualize a página para iniciar um novo pedido consciente.', status: 409, definiteRollback: true,
  };
  if (message.includes('COMMERCIAL_RECOVERY_NOT_COMMITTED')) return {
    message: 'A gravação ainda não foi confirmada. Confira, retome a mesma tentativa ou abandone-a explicitamente.', status: 409, definiteRollback: false,
  };
  if (message.includes('COMMERCIAL_RECOVERY_NOT_FOUND')) return {
    message: 'Tentativa indisponível para seu usuário e organização. Confira a sessão atual.', status: 404, definiteRollback: false,
  };
  if (message.includes('COMMERCIAL_REQUEST_REUSED')) return {
    message: 'Esta chave já pertence a outra gravação. Confira o registro anterior; nenhuma nova gravação foi realizada.', status: 409, definiteRollback: false,
  };
  if (message.includes('COMMERCIAL_SOURCE_CHANGED')) return {
    message: 'A proposta foi alterada desde que você a abriu. Atualize a página e confira a versão mais recente antes de editar.', status: 409, definiteRollback: true,
  };
  if (message.includes('COMMERCIAL_REQUEST_SOURCE_UNAVAILABLE')) return {
    message: 'A gravação anterior existe, mas o registro foi removido ou não está acessível. Não será criado um substituto automaticamente.', status: 409, definiteRollback: false,
  };
  if (message.includes('COMMERCIAL_ITEMS_TOTAL_MISMATCH')) return {
    message: 'As parcelas não conferem com o total da proposta. Nenhuma alteração foi salva.', status: 400, definiteRollback: true,
  };
  if (code === '23P01') return { message: 'Outro compromisso ocupa esse horário. Atualize a agenda.', status: 409, definiteRollback: true };
  if (code === '42501') return { message: 'Sua sessão não tem permissão para esta gravação.', status: 403, definiteRollback: true };
  if (code === '23514' || code.startsWith('22')) return {
    message: 'Os dados ou vínculos não são válidos para esta gravação. Confira contato, empreendimento, unidade e valores; nada foi salvo.', status: 400, definiteRollback: true,
  };
  if (code === 'PGRST202' || code === '42883') return {
    message: 'A gravação protegida ainda não está disponível neste ambiente. Nenhum salvamento alternativo foi tentado.', status: 503, definiteRollback: true,
  };
  return { message: 'Não foi possível confirmar a gravação. Tente novamente sem alterar os dados para recuperar o mesmo registro.', status: 503, definiteRollback: false };
}
