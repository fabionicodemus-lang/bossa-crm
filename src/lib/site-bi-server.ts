import { createAdminClient } from '@/lib/supabase/admin';
import { calcularBi, limitesBi, type ConfigBi, type EventoBi, type LeadBi, type SessaoBi } from '@/lib/site-bi';

type Admin = ReturnType<typeof createAdminClient>;

export class ErroBi extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function lerPaginas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  limite: number,
): Promise<T[]> {
  const resultado: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw error;
    if (!data?.length) return resultado;
    if (resultado.length + data.length > limite) {
      throw new ErroBi('Há muitos registros nesse período. Reduza as datas para consultar os totais completos.', 422);
    }
    resultado.push(...(data as T[]));
    if (data.length < 1000) return resultado;
  }
}

async function carregarLeadsVinculados(admin: Admin, organizationId: string) {
  type Ligacao = { visitor_code: string; lead_id: string };
  type Marco = { lead_id: string; qualified_at: string | null; meeting_at: string | null; proposal_at: string | null; won_at: string | null };
  const ligacoes = await lerPaginas<Ligacao>((a, b) => admin.from('lead_site_links').select('visitor_code,lead_id')
    .eq('organization_id', organizationId).order('id').range(a, b), 50_000);
  const ids = [...new Set(ligacoes.map((l) => l.lead_id))];
  const marcos = new Map<string, Marco>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from('lead_funnel_milestones').select('lead_id,qualified_at,meeting_at,proposal_at,won_at')
      .eq('organization_id', organizationId).in('lead_id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const m of (data ?? []) as Marco[]) marcos.set(m.lead_id, m);
  }
  const porVisitante = new Map<string, LeadBi[]>();
  for (const l of ligacoes) {
    const m = marcos.get(l.lead_id);
    const leads = porVisitante.get(l.visitor_code) ?? [];
    leads.push({ id: l.lead_id, qualificado: Boolean(m?.qualified_at), reuniao: Boolean(m?.meeting_at),
      proposta: Boolean(m?.proposal_at), venda: Boolean(m?.won_at) });
    porVisitante.set(l.visitor_code, leads);
  }
  return porVisitante;
}

export async function carregarBiSite(admin: Admin, organizationId: string, config: ConfigBi) {
  // site_sessions e site_events medem um único site e não têm organization_id.
  // Só concedemos o acesso quando a empresa autenticada é a dona dessa base.
  const { data: empresas, error: erroEmpresa } = await admin.from('organizations').select('id').limit(2);
  if (erroEmpresa) throw erroEmpresa;
  if (empresas?.length !== 1 || empresas[0].id !== organizationId) {
    throw new ErroBi('A empresa responsável pelas estatísticas do site não pôde ser identificada.', 403);
  }
  const { inicio, fim } = limitesBi(config);
  const [sessoes, eventos, vinculados] = await Promise.all([
    lerPaginas<SessaoBi>((a, b) => admin.from('site_sessions')
      .select('id,visitor_code,hostname,started_at,visit_number,referrer,utm,entry_page,city,region,country,visitante:site_visitors!site_sessions_visitor_code_fkey(device)')
      .gte('last_event_at', inicio).lt('started_at', fim).order('id').range(a, b), 50_000),
    lerPaginas<EventoBi>((a, b) => admin.from('site_events')
      .select('visitor_code,session_id,hostname,name,props,page,created_at')
      .gte('created_at', inicio).lt('created_at', fim).order('id').range(a, b), 150_000),
    carregarLeadsVinculados(admin, organizationId),
  ]);
  const resultado = calcularBi(config, sessoes, eventos, vinculados);
  // Enviamos ao navegador apenas grupos, filtros e medidas, sem códigos dos
  // visitantes, IDs de sessão, leads ou registros de navegação individuais.
  return resultado;
}
