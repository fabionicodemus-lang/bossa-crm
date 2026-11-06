import { getCurrentContext } from '@/lib/auth';
import { loadNaraFunnelSummary } from '@/lib/nara-funnel-events';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  const headers = { 'Cache-Control': 'no-store' };
  if (!context) return Response.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const now = Date.now();
  const from = new Date(params.get('from') ?? now - 30 * 86400000);
  const to = new Date(params.get('to') ?? now);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())
    || from >= to || to.getTime() - from.getTime() > 93 * 86400000) {
    return Response.json({ error: 'Informe um intervalo válido de até 93 dias; o término é exclusivo.' }, { status: 400, headers });
  }
  const contactKind = params.get('kind');
  if (contactKind && contactKind !== 'cliente' && contactKind !== 'corretor') {
    return Response.json({ error: 'Tipo de contato inválido.' }, { status: 400, headers });
  }
  try {
    // Neither organization nor privileges come from request parameters.
    // The session client enforces RLS in addition to the explicit tenant filter.
    const supabase = await createClient();
    const summary = await loadNaraFunnelSummary(supabase, {
      organizationId: context.organization.id,
      from: from.toISOString(), to: to.toISOString(),
      contactKind: contactKind === 'cliente' || contactKind === 'corretor' ? contactKind : undefined,
    });
    return Response.json(summary, { headers });
  } catch {
    return Response.json({ error: 'Não foi possível consultar o funil explícito agora.' }, { status: 503, headers });
  }
}
