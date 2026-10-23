import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST as createAgenda } from '@/app/api/agenda/route';
import { objectValue, parseRecoveryAction, publicRecovery } from '@/lib/commercial/recovery';
import { sourceRequestFailure } from '@/lib/commercial/source-request';

export const runtime = 'nodejs';
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
const failed = (cause: unknown) => { const failure = sourceRequestFailure(cause); return response({ error: failure.message }, failure.status); };
async function session() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return { context: null, error: response({ error: 'Não autenticado.' }, 401) };
  if (!['admin', 'comercial'].includes(context.role)) return { context: null, error: response({ error: 'Sem permissão.' }, 403) };
  return { context, error: null };
}
export async function GET(request: Request) {
  const auth = await session();
  if (!auth.context) return auth.error!;
  const type = new URL(request.url).searchParams.get('type');
  if (type !== 'proposals' && type !== 'agenda_events') return response({ error: 'Tipo inválido.' }, 400);
  try {
    const db = await createClient();
    const pending = await db.from('commercial_pending_source_requests').select('request_id')
      .eq('organization_id', auth.context.organization.id).eq('actor_id', auth.context.userId)
      .eq('entity_type', type).eq('status', 'pending').maybeSingle();
    if (pending.error) return response({ error: 'Recuperação indisponível. Confira a migração e sua sessão; não foi presumida uma fila vazia.' }, 503);
    if (!pending.data) return response({ request: null });
    const result = await db.rpc('commercial_get_source_recovery', { p_org: auth.context.organization.id, p_request: pending.data.request_id });
    if (result.error) return failed(result.error);
    const view = publicRecovery(result.data);
    // Another tab may have acknowledged/abandoned it between listing and reading.
    return response({ request: ['acknowledged', 'abandoned'].includes(view.state) ? null : view });
  } catch { return response({ error: 'Não foi possível conferir a tentativa. Nenhuma nova gravação foi iniciada.' }, 503); }
}
export async function POST(request: Request) {
  const auth = await session();
  if (!auth.context) return auth.error!;
  const input = parseRecoveryAction(await request.json().catch(() => null));
  if (!input) return response({ error: 'Confirme a ação e a tentativa que deseja revisar.' }, 400);
  const org = auth.context.organization.id;
  try {
    const db = await createClient();
    if (input.action !== 'retry') {
      const result = await db.rpc('commercial_finish_source_recovery', { p_org: org, p_request: input.requestId, p_action: input.action });
      if (result.error) return failed(result.error);
      return response({ request: publicRecovery(result.data) });
    }
    const loaded = await db.rpc('commercial_get_source_recovery', { p_org: org, p_request: input.requestId });
    if (loaded.error) return failed(loaded.error);
    const view = publicRecovery(loaded.data);
    // Checking a committed receipt must never invoke Outlook or repeat source writes.
    if (view.state !== 'pending') return response({ request: view, warning: 'Estado atual recuperado. Nenhuma nova gravação ou sincronização foi iniciada.' });
    const payload = objectValue(objectValue(loaded.data).payload);
    let warning = '';
    if (view.kind === 'proposals') {
      const data = objectValue(payload.data);
      const saved = data.operation === 'status'
        ? await db.rpc('commercial_proposal_status_once', {
          p_org: org, p_request: input.requestId, p_id: payload.id,
          p_expected_updated_at: payload.expected_updated_at,
          p_expected_version: data.expected_version, p_workflow_status: data.workflow_status,
        })
        : await db.rpc('commercial_save_proposal_once', {
          p_org: org, p_request: input.requestId, p_data: payload.data, p_items: payload.items,
          p_id: payload.id, p_expected_updated_at: payload.expected_updated_at,
        });
      if (saved.error) return failed(saved.error);
      if (!objectValue(saved.data).record) return response({ error: 'Resposta incerta. Confira a tentativa antes de iniciar outro pedido.' }, 503);
      warning = data.operation === 'status'
        ? 'Status e atividade conferidos no CRM. A escolha não comprova envio, assinatura ou recebimento.'
        : 'Proposta conferida no CRM. Etapa legada do contato e abertura do PDF não foram reexecutadas.';
    } else {
      // Reuse the human agenda path: availability, RLS and external-sync warnings.
      // Never accept the browser's replacement payload or impersonate another actor.
      const headers = new Headers(request.headers);
      headers.delete('Content-Length');
      headers.set('Content-Type', 'application/json'); headers.set('Idempotency-Key', input.requestId);
      const result = await createAgenda(new Request(new URL('/api/agenda', request.url), { method: 'POST', headers, body: JSON.stringify(payload) }));
      const body = objectValue(await result.json().catch(() => null));
      if (!result.ok) return response({ error: typeof body.error === 'string' ? body.error : 'Não foi possível confirmar o compromisso.' }, result.status);
      warning = typeof body.warning === 'string' ? body.warning : 'Compromisso conferido no CRM. Confira separadamente a sincronização e o convite no Outlook.';
    }
    const current = await db.rpc('commercial_get_source_recovery', { p_org: org, p_request: input.requestId });
    if (current.error) return failed(current.error);
    return response({ request: publicRecovery(current.data), warning });
  } catch { return response({ error: 'A resposta ficou incerta. A tentativa permanece no servidor; confira antes de iniciar outra gravação.' }, 503); }
}
