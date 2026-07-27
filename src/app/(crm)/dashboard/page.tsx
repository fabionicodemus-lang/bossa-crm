import Link from 'next/link';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';

export default async function DashboardPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const orgId = context!.organization.id;

  const [{ count: totalClients }, { count: aiCount }, { count: hotCount }, { count: brokerCount }, activitiesResult] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'cliente'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'cliente').eq('stage', 'ia').eq('ai_enabled', true),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'cliente').in('stage', ['qualificado', 'agendado']),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'corretor'),
    supabase.from('activities').select('id,title,description,created_at,leads(id,name,kind)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(8),
  ]);

  const activities = (activitiesResult.data ?? []) as Array<{ id: string; title: string; description: string | null; created_at: string; leads: { id: string; name: string; kind: string } | null }>;

  return (
    <>
      <PageTopbar title="Dashboard" subtitle={`Visão geral da operação · ${context!.organization.name}`} actions={<Link href="/importar" className="btn btn-primary btn-sm">📥 Importar XLSX</Link>} />
      <div className="page-content">
        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Leads de clientes</div><div className="kpi-value">{totalClients ?? 0}</div><div className="kpi-note">base centralizada no banco</div></div>
          <div className="kpi"><div className="kpi-label">Em atendimento IA</div><div className="kpi-value">{aiCount ?? 0}</div><div className="kpi-note">somente etapa IA Atendendo</div></div>
          <div className="kpi"><div className="kpi-label">Leads quentes</div><div className="kpi-value" style={{ color: 'var(--red)' }}>{hotCount ?? 0}</div><div className="kpi-note">qualificados ou agendados</div></div>
          <div className="kpi"><div className="kpi-label">Corretores</div><div className="kpi-value">{brokerCount ?? 0}</div><div className="kpi-note">pipeline de parceiros</div></div>
        </div>

        <div className="grid grid-2">
          <section className="card">
            <div className="card-head"><h3>Atividade recente</h3></div>
            <div className="card-body">
              {activities.length === 0 ? <div className="empty-state">As movimentações do CRM aparecerão aqui.</div> : <div className="timeline">{activities.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-icon">•</div><div><div className="timeline-title">{item.title}</div>{item.description && <div className="timeline-desc">{item.description}</div>}<div className="timeline-time">{item.leads?.name ? `${item.leads.name} · ` : ''}{formatDateTime(item.created_at)}</div></div></div>)}</div>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Acessos rápidos</h3></div>
            <div className="card-body grid">
              <Link href="/clientes" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🧲 Abrir pipeline de clientes</Link>
              <Link href="/corretores" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🤝 Abrir pipeline de corretores</Link>
              <Link href="/ia" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🤖 Ver atendimentos da IA</Link>
              <Link href="/configuracoes/whatsapp" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>📱 Configurar WhatsApp</Link>
              {context!.role === 'admin' && <Link href="/usuarios" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>👥 Gerenciar usuários</Link>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
