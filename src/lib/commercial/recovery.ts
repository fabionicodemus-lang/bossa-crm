/** Public recovery responses contain summaries, never command payloads or session credentials. */
export type RecoveryKind = 'proposals' | 'agenda_events';
export type RecoveryState = 'pending' | 'committed' | 'committed_unavailable' | 'acknowledged' | 'abandoned';
export type RecoveryView = {
  requestId: string; kind: RecoveryKind; state: RecoveryState; createdAt: string;
  summary: string; recordId: string | null; recordLabel: string | null;
};
export const recoveryUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function publicRecovery(value: unknown): RecoveryView {
  const row = objectValue(value), payload = objectValue(row.payload), record = objectValue(row.record);
  if (typeof row.request_id !== 'string' || !recoveryUuid.test(row.request_id)
    || !['proposals', 'agenda_events'].includes(String(row.entity_type))
    || !['pending', 'committed', 'committed_unavailable', 'acknowledged', 'abandoned'].includes(String(row.state))
    || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Invalid recovery response');
  const data = row.entity_type === 'proposals' ? objectValue(payload.data) : payload;
  const snapshot = objectValue(data.snapshot);
  const summary = row.entity_type === 'proposals'
    ? ['Proposta', snapshot.development_name, snapshot.unit_code, data.proposed_price == null ? null : `valor informado ${String(data.proposed_price)}`]
      .filter((part) => typeof part === 'string' && part.length).join(' · ')
    : `${String(data.title ?? 'Compromisso')} · ${String(data.starts_at ?? 'horário não informado')}`;
  const recordId = typeof record.id === 'string' && recoveryUuid.test(record.id) ? record.id : null;
  if (row.state === 'committed' && !recordId) throw new Error('Invalid committed record');
  return {
    requestId: row.request_id, kind: row.entity_type as RecoveryKind, state: row.state as RecoveryState,
    createdAt: row.created_at, summary: summary.slice(0, 260), recordId,
    recordLabel: recordId ? (row.entity_type === 'proposals' ? `Proposta #${String(record.proposal_number ?? '—')}` : String(record.title ?? 'Compromisso')).slice(0, 200) : null,
  };
}
export function parseRecoveryAction(raw: unknown): { requestId: string; action: 'retry' | 'acknowledge' | 'abandon' } | null {
  const row = objectValue(raw);
  if (typeof row.requestId !== 'string' || !recoveryUuid.test(row.requestId)
    || !['retry', 'acknowledge', 'abandon'].includes(String(row.action)) || row.confirmed !== true) return null;
  return { requestId: row.requestId, action: row.action as 'retry' | 'acknowledge' | 'abandon' };
}
