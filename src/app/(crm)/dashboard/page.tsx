import Link from 'next/link';
import { AiHealthBadge } from '@/components/AiHealthBadge';
import { PageTopbar } from '@/components/PageTopbar';
import { getCurrentContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDateTime } from '@/lib/format';

type ActivityLead = { id: string; name: string; kind: string };
type DashboardActivity = { id: string; title: string; description: string | null; created_at: string; leads: ActivityLead | null };
type AiMessage = { created_at: string; raw_payload: Record<string, unknown> | null };
type PeriodLead = {
  id: string;
  kind: 'cliente' | 'corretor' | string;
  created_at: string;
  source: string | null;
  phone: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  owner_mode: string | null;
  stage: string;
};
type OutboundMessage = { lead_id: string; sender_kind: string; created_at: string };

const DAY_MS = 86_400_000;

function periodStarts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const year = Number(value('year'));
  const month = Number(value('month'));
  const day = Number(value('day'));
  const weekday = value('weekday');
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  const today = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
  const daysSinceMonday = weekdayIndex < 0 ? 0 : (weekdayIndex + 6) % 7;
  const week = new Date(today.getTime() - daysSinceMonday * DAY_MS);
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0, 0));
  return { today, week, month: monthStart };
}

function countSince<T extends { created_at: string }>(rows: T[], start: Date) {
  const cutoff = start.getTime();
  return rows.filter((row) => new Date(row.created_at).getTime() >= cutoff).length;
}

function minutesLabel(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 60) return `${Math.round(value)} min`;
  const hours = value / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`;
}

export default async function DashboardPage() {
  const context = await getCurrentContext();
  const supabase = await createClient();
  const admin = createAdminClient();
  const orgId = context!.organization.id;
  const now = new Date().toISOString();
  const isAdmin = context!.role === 'admin';
  const starts = periodStarts();
  const periodStart = new Date(Math.min(starts.week.getTime(), starts.month.getTime())).toISOString();
  const todayStart = starts.today.toISOString();
  const monthStart = starts.month.toISOString();

  let overdueTasksQuery = supabase.from('lead_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['pending', 'overdue'])
    .lt('due_at', now);
  if (!isAdmin) overdueTasksQuery = overdueTasksQuery.eq('assigned_to', context!.userId);

  const [
    { count: totalClients },
    { count: aiCount },
    { count: hotCount },
    { count: brokerCount },
    { count: overdueTasks },
    { count: pendingHandoffs },
    activitiesResult,
    aiMessagesResult,
    periodLeadsResult,
    activeServiceLeadsResult,
    outboundMonthResult,
    { count: pendingIntake },
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'cliente').is('archived_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('owner_mode', 'ai').eq('ai_enabled', true).is('archived_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('priority_class', ['A1', 'A2']).not('stage', 'in', '(fechado_ganho,encerrado)').is('archived_at', null),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('kind', 'corretor').is('archived_at', null),
    overdueTasksQuery,
    supabase.from('lead_handoffs').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
    supabase.from('activities').select('id,title,description,created_at,leads(id,name,kind)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(10),
    supabase.from('messages').select('created_at,raw_payload').eq('organization_id', orgId).eq('direction', 'out').eq('sender_kind', 'ia').eq('status', 'sent').order('created_at', { ascending: false }).limit(20),
    supabase.from('leads')
      .select('id,kind,created_at,source,phone,last_inbound_at,last_outbound_at,owner_mode,stage')
      .eq('organization_id', orgId)
      .in('kind', ['cliente', 'corretor'])
      .gte('created_at', periodStart)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase.from('leads')
      .select('id,kind,created_at,source,phone,last_inbound_at,last_outbound_at,owner_mode,stage')
      .eq('organization_id', orgId)
      .eq('kind', 'cliente')
      .is('archived_at', null)
      .not('stage', 'in', '(fechado_ganho,encerrado)')
      .limit(5000),
    supabase.from('messages')
      .select('lead_id,sender_kind,created_at')
      .eq('organization_id', orgId)
      .eq('direction', 'out')
      .gte('created_at', monthStart)
      .order('created_at', { ascending: true })
      .limit(10000),
    admin.from('lead_intake_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('nara_status', 'queued'),
  ]);

  const activities: DashboardActivity[] = (activitiesResult.data ?? []).map((item) => {
    const relatedLead = Array.isArray(item.leads) ? (item.leads[0] ?? null) : (item.leads ?? null);
    return { id: item.id, title: item.title, description: item.description, created_at: item.created_at, leads: relatedLead };
  });
  const lastAiSuccessAt = ((aiMessagesResult.data ?? []) as AiMessage[])
    .find((item) => item.raw_payload?.ai_fallback_message !== true)
    ?.created_at ?? null;
  const periodLeads = (periodLeadsResult.data ?? []) as PeriodLead[];
  const activeServiceLeads = (activeServiceLeadsResult.data ?? []) as PeriodLead[];
  const outboundMonth = (outboundMonthResult.data ?? []) as OutboundMessage[];
  const clientsInPeriod = periodLeads.filter((lead) => lead.kind === 'cliente');
  const brokersInPeriod = periodLeads.filter((lead) => lead.kind === 'corretor');

  const intake = {
    clientsDay: countSince(clientsInPeriod, starts.today),
    clientsWeek: countSince(clientsInPeriod, starts.week),
    clientsMonth: countSince(clientsInPeriod, starts.month),
    brokersDay: countSince(brokersInPeriod, starts.today),
    brokersWeek: countSince(brokersInPeriod, starts.week),
    brokersMonth: countSince(brokersInPeriod, starts.month),
    metaDay: countSince(clientsInPeriod.filter((lead) => String(lead.source ?? '').startsWith('Meta')), starts.today),
  };

  const monthlyClientIds = new Set(clientsInPeriod
    .filter((lead) => new Date(lead.created_at).getTime() >= starts.month.getTime())
    .map((lead) => lead.id));
  const firstOutbound = new Map<string, number>();
  for (const message of outboundMonth) {
    if (!monthlyClientIds.has(message.lead_id)) continue;
    const time = new Date(message.created_at).getTime();
    if (!firstOutbound.has(message.lead_id) || time < (firstOutbound.get(message.lead_id) ?? Infinity)) {
      firstOutbound.set(message.lead_id, time);
    }
  }
  const responseMinutes = clientsInPeriod
    .filter((lead) => monthlyClientIds.has(lead.id) && firstOutbound.has(lead.id))
    .map((lead) => ((firstOutbound.get(lead.id) ?? 0) - new Date(lead.created_at).getTime()) / 60_000)
    .filter((value) => value >= 0 && Number.isFinite(value));
  const avgFirstContactMinutes = responseMinutes.length
    ? responseMinutes.reduce((total, value) => total + value, 0) / responseMinutes.length
    : null;
  const within5Rate = responseMinutes.length
    ? Math.round((responseMinutes.filter((value) => value <= 5).length / responseMinutes.length) * 100)
    : null;
  const waitingReply = activeServiceLeads.filter((lead) => {
    if (!lead.last_inbound_at) return false;
    const inbound = new Date(lead.last_inbound_at).getTime();
    const outbound = lead.last_outbound_at ? new Date(lead.last_outbound_at).getTime() : Number.NEGATIVE_INFINITY;
    return inbound > outbound;
  }).length;
  const withoutFirstContact = activeServiceLeads.filter((lead) => !lead.last_outbound_at && Boolean(lead.phone)).length;
  const naraToday = outboundMonth.filter((message) =>
    message.sender_kind === 'ia' && new Date(message.created_at).getTime() >= starts.today.getTime()
  ).length;
  const humanToday = outboundMonth.filter((message) =>
    message.sender_kind === 'humano' && new Date(message.created_at).getTime() >= starts.today.getTime()
  ).length;

  const overdueTasksHref = isAdmin
    ? '/tarefas?status=vencidas'
    : '/tarefas?status=vencidas&responsavel=minhas';

  return <>
    <PageTopbar
      title="Dashboard"
      subtitle={`Operação híbrida Nara + equipe · ${context!.organization.name}`}
      actions={<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {isAdmin && <AiHealthBadge lastSuccessAt={lastAiSuccessAt} />}
        <Link href="/importar" className="btn btn-primary btn-sm">📥 Importar XLSX</Link>
      </div>}
    />
    <div className="page-content">
      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Leads de clientes</div><div className="kpi-value">{totalClients ?? 0}</div><div className="kpi-note">base ativa</div></div>
        <div className="kpi"><div className="kpi-label">Sob responsabilidade da IA</div><div className="kpi-value">{aiCount ?? 0}</div><div className="kpi-note">Nara e Plantão ativos</div></div>
        <div className="kpi"><div className="kpi-label">Prioridade A1/A2</div><div className="kpi-value" style={{ color: 'var(--red)' }}>{hotCount ?? 0}</div><div className="kpi-note">pedem resposta rápida</div></div>
        <div className="kpi"><div className="kpi-label">Passagens pendentes</div><div className="kpi-value" style={{ color: (pendingHandoffs ?? 0) > 0 ? 'var(--red)' : undefined }}>{pendingHandoffs ?? 0}</div><div className="kpi-note">aguardando aceite</div></div>
        <Link href={overdueTasksHref} className="kpi" style={{ display: 'block' }}><div className="kpi-label">Tarefas vencidas</div><div className="kpi-value" style={{ color: (overdueTasks ?? 0) > 0 ? 'var(--red)' : undefined }}>{overdueTasks ?? 0}</div><div className="kpi-note">clique para ver e agir</div></Link>
        <div className="kpi"><div className="kpi-label">Corretores</div><div className="kpi-value">{brokerCount ?? 0}</div><div className="kpi-note">pipeline de parceiros</div></div>
      </div>
      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>Entradas no CRM</h3></div>
        <div className="card-body">
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label">Leads de clientes</div>
              <div className="kpi-value">{intake.clientsDay}</div>
              <div className="kpi-note">hoje · {intake.clientsWeek} semana · {intake.clientsMonth} mês</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Corretores</div>
              <div className="kpi-value">{intake.brokersDay}</div>
              <div className="kpi-note">hoje · {intake.brokersWeek} semana · {intake.brokersMonth} mês</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Meta Lead Ads</div>
              <div className="kpi-value">{intake.metaDay}</div>
              <div className="kpi-note">leads recebidos hoje via formulários</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Fila 1º contato Nara</div>
              <div className="kpi-value">{pendingIntake ?? 0}</div>
              <div className="kpi-note">aguardando janela de 3 min/template</div>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h3>Métricas de atendimento</h3></div>
        <div className="card-body">
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label">Tempo médio até 1º contato</div>
              <div className="kpi-value">{minutesLabel(avgFirstContactMinutes)}</div>
              <div className="kpi-note">leads que entraram neste mês</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Atendidos em até 5 min</div>
              <div className="kpi-value">{within5Rate == null ? '—' : `${within5Rate}%`}</div>
              <div className="kpi-note">entre os leads já contatados no mês</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Sem primeiro contato</div>
              <div className="kpi-value" style={{ color: withoutFirstContact > 0 ? 'var(--red)' : undefined }}>{withoutFirstContact}</div>
              <div className="kpi-note">clientes ativos com telefone e sem saída</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Aguardando nossa resposta</div>
              <div className="kpi-value" style={{ color: waitingReply > 0 ? 'var(--red)' : undefined }}>{waitingReply}</div>
              <div className="kpi-note">última mensagem foi do cliente</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Respostas da Nara hoje</div>
              <div className="kpi-value">{naraToday}</div>
              <div className="kpi-note">mensagens enviadas pela IA</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Respostas humanas hoje</div>
              <div className="kpi-value">{humanToday}</div>
              <div className="kpi-note">mensagens enviadas pela equipe</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-2">
        <section className="card"><div className="card-head"><h3>Atividade recente</h3></div><div className="card-body">{activities.length === 0 ? <div className="empty-state">As movimentações do CRM aparecerão aqui.</div> : <div className="timeline">{activities.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-icon">•</div><div><div className="timeline-title">{item.title}</div>{item.description && <div className="timeline-desc">{item.description}</div>}<div className="timeline-time">{item.leads?.name ? `${item.leads.name} · ` : ''}{formatDateTime(item.created_at)}</div></div></div>)}</div>}</div></section>
        <section className="card"><div className="card-head"><h3>Acessos rápidos</h3></div><div className="card-body grid"><Link href="/tarefas" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>✅ Tarefas e próximos prazos</Link><Link href="/clientes" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🧲 Pipeline de clientes</Link><Link href="/corretores" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🤝 Pipeline de corretores</Link><Link href="/ia" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🤖 Conversas sob responsabilidade da IA</Link><Link href="/arquivados" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>🗄️ Leads arquivados</Link><Link href="/configuracoes/whatsapp" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>📱 Configurar WhatsApp</Link>{isAdmin && <Link href="/usuarios" className="btn btn-ghost" style={{ justifyContent: 'flex-start' }}>👥 Consultores e permissões</Link>}</div></section>
      </div>
    </div>
  </>;
}
