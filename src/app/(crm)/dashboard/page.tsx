import Link from 'next/link';
import { AiHealthBadge } from '@/components/AiHealthBadge';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';

type ActivityLead = { id: string; name: string; kind: string };
type DashboardActivity = { id: string; title: string; description: string | null; created_at: string; leads: ActivityLead | null };
type AiMessage = { created_at: string; raw_payload: Record<string, unknown> | null };

export default async function DashboardPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const orgId = context!.organization.id;
  const now = new Date().toISOString();
  const [{ count: totalClients }, { count: aiCount }, { count: hotCount }, { count: brokerCount }, { count: overdueTasks }, { count: pendingHandoffs }, activitiesResult, aiMessagesResult] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'cliente').is('archived_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('owner_mode', 'ai').eq('ai_enabled', true).is('archived_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('priority_class', ['A1', 'A2']).not('stage', 'in', '(fechado_ganho,encerrado)').is('archived_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'corretor').is('archived_at', null),
    supabase.from('lead_tasks').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', ['pending', 'overdue']).lt('due_at', now),
    supabase.from('lead_handoffs').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
    supabase.from('activities').select('id,title,description,created_at,leads(id,name,kind)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(10),
    supabase.from('messages').select('created_at,raw_payload').eq('organization_id', orgId).eq('direction', 'out').eq('sender_kind', 'ia').eq('status', 'sent').order('created_at', { ascending: false }).limit(20),
  ]);

  const activities: DashboardActivity[] = (activitiesResult.data ?? []).map((item) => {
    const relatedLead = Array.isArray(item.leads) ? (item.leads[0] ?? null) : (item.leads ?? null);
    return { id: item.id, title: item.title, description: item.description, created_at: item.created_at, leads: relatedLead };
  });
  const lastAiSuccessAt = ((aiMessagesResult.data ?? []) as AiMessage[])
    .find((item) => item.raw_payload?.ai_fallback_message !== true)
    ?.created_at ?? null;

  return <>
    <PageTopbar
      title="Dashboard"
      subtitle={`Operação híbrida Nara + equipe · ${context!.organization.name}`}
      actions={<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {context!.role === 'admin' && <AiHealthBadge lastSuccessAt={lastAiSuccessAt} />}
        <Link href="/importar" className="btn btn-primary btn-sm">📥 Importar XLSX</Link>
      </div>}
    />
    <div className="page-content">
      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Leads de clientes</div><div className="kpi-value">{totalClients ?? 0}</div><div className="kpi-note">base ativa</div></div>
        <div className="kpi"><div className="kpi-label">Sob responsabilidade da IA</div><div className="kpi-value">{aiCount ?? 0}</div><div className="kpi-note">Nara e Plantão ativos</div></div>
        <div className="kpi"><div className="kpi-label">Prioridade A1/A2</div><div className="kpi-value" style={{ color: 'var(--red)' }}>{hotCount ?? 0}</div><div className="kpi-note">pedem resposta rápida</div></div>
        <div className="kpi"><div className="kpi-label">Passagens pendentes</div><div className="kpi-value" style={{ color: (pendingHandoffs ?? 0) > 0 ? 'var(--red)' : undefined }}>{pendingHandoffs ?? 0}</div><div className="kpi-note">aguardando aceite</div></div>
        <div className="kpi"><div className="kpi-label">Tarefas vencidas</div><div className="kpi-value" style={{ color: (overdueTasks ?? 0) > 0 ? 'var(--red)' : undefined }}>{overdueTasks ?? 0}</div><div className="kpi-note">perda evitável por prazo</div></div>
        <div className="kpi"><div className="kpi-label">Corretores</div><div className="kpi-value">{brokerCount ?? 0}</div><div className="kpi-note">pipeline de parceiros</div></div>
      </div>
      <div className="grid grid-2">
        <section className="card"><div className="card-head"><h3>Atividade recente</h3></div><div className="card-body">{activities.length === 0 ? <div className="empty-state">As movimentações do CRM aparecerão aqui.</div> : <div className="timeline">{activities.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-icon">•</div><div><div className="timeline-title">{item.title}</div>{item.description && <div className="timeline-desc">{item.description}</div>}<div className="timeline-time">{item.leads?.name ? `${item.leads.name} · ` : ''}{formatDateTime(item.created_at)}</div></div></div>)}</div>}</div></section>
        <section className="card"><div className="card-head"><h3>Acessos rápidos</h3></div><div className="card-body grid"><Link href="/clientes" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🧲 Pipeline de clientes</Link><Link href="/corretores" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🤝 Pipeline de corretores</Link><Link href="/ia" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🤖 Conversas sob responsabilidade da IA</Link><Link href="/arquivados" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🗄️ Leads arquivados</Link><Link href="/configuracoes/whatsapp" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>📱 Configurar WhatsApp</Link>{context!.role === 'admin' && <Link href="/usuarios" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>👥 Consultores e permissões</Link>}</div></section>
      </div>
    </div>
  </>;
}
