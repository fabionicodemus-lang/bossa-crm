import { getCurrentContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validarConfigBi } from '@/lib/site-bi';
import { carregarBiSite, ErroBi } from '@/lib/site-bi-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return Response.json({ error: 'Sessão expirada. Entre novamente no CRM.' }, { status: 401, headers });
  if (context.role === 'viewer') return Response.json({ error: 'Sem acesso às estatísticas do site.' }, { status: 403, headers });
  let config;
  try {
    config = validarConfigBi(await request.json());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Consulta inválida.' }, { status: 400, headers });
  }
  try {
    const resultado = await carregarBiSite(createAdminClient(), context.organization.id, config);
    const json = JSON.stringify(resultado);
    if (new TextEncoder().encode(json).byteLength > 3_900_000) {
      return Response.json({ error: 'A tabela ficou muito grande. Reduza o período ou as dimensões para consultar todos os valores.' }, { status: 422, headers });
    }
    return new Response(json, { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (error) {
    if (error instanceof ErroBi) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error('[site bi] falha na consulta');
    return Response.json({ error: 'Não foi possível consultar as estatísticas agora. Tente novamente.' }, { status: 503, headers });
  }
}
