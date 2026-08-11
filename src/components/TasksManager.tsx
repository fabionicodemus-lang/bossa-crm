'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import type { LeadTask } from '@/lib/types';

type TaskLead = {
  id: string;
  name: string;
  kind: 'cliente' | 'corretor';
};

type TaskMember = {
  user_id: string;
  full_name: string;
  email: string;
};

export type TaskListItem = LeadTask & {
  lead: TaskLead | null;
};

type StatusFilter = 'open' | 'overdue' | 'pending' | 'completed' | 'cancelled' | 'all';
type AssigneeMode = 'all' | 'mine' | 'custom';

const AI_ASSIGNEE = '__ai__';

function effectiveStatus(task: LeadTask, nowMs: number) {
  if (task.status === 'completed') return 'completed' as const;
  if (task.status === 'cancelled') return 'cancelled' as const;
  if (task.status === 'overdue') return 'overdue' as const;
  if (task.due_at) {
    const due = new Date(task.due_at).getTime();
    if (Number.isFinite(due) && due < nowMs) return 'overdue' as const;
  }
  return 'pending' as const;
}

function priorityWeight(priority: LeadTask['priority']) {
  if (priority === 'urgent') return 0;
  if (priority === 'high') return 1;
  if (priority === 'normal') return 2;
  return 3;
}

function priorityLabel(priority: LeadTask['priority']) {
  if (priority === 'urgent') return 'Urgente';
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baixa';
  return 'Normal';
}

function statusLabel(status: ReturnType<typeof effectiveStatus>) {
  if (status === 'overdue') return 'Vencida';
  if (status === 'completed') return 'Concluída';
  if (status === 'cancelled') return 'Cancelada';
  return 'Pendente';
}

function taskAssigneeKey(task: LeadTask) {
  return task.assigned_to || AI_ASSIGNEE;
}

export function TasksManager({
  initialTasks,
  members,
  currentUserId,
  isAdmin,
  referenceNow,
  initialStatus = 'open',
  initialAssigneeMode = 'all',
}: {
  initialTasks: TaskListItem[];
  members: TaskMember[];
  currentUserId: string;
  isAdmin: boolean;
  referenceNow: string;
  initialStatus?: StatusFilter;
  initialAssigneeMode?: AssigneeMode;
}) {
  const nowMs = new Date(referenceNow).getTime();
  const [tasks, setTasks] = useState(initialTasks);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [assigneeMode, setAssigneeMode] = useState<AssigneeMode>(isAdmin ? initialAssigneeMode : 'mine');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );

  const assigneeScopedTasks = useMemo(() => {
    if (!isAdmin) return tasks.filter((task) => task.assigned_to === currentUserId);
    if (assigneeMode === 'mine') return tasks.filter((task) => task.assigned_to === currentUserId);
    if (assigneeMode === 'custom') {
      if (!selectedAssignees.length) return [];
      const selected = new Set(selectedAssignees);
      return tasks.filter((task) => selected.has(taskAssigneeKey(task)));
    }
    return tasks;
  }, [assigneeMode, currentUserId, isAdmin, selectedAssignees, tasks]);

  const counts = useMemo(() => {
    const values = { open: 0, overdue: 0, pending: 0, completed: 0, cancelled: 0, all: assigneeScopedTasks.length };
    for (const task of assigneeScopedTasks) {
      const status = effectiveStatus(task, nowMs);
      if (status === 'overdue') values.overdue += 1;
      if (status === 'pending') values.pending += 1;
      if (status === 'completed') values.completed += 1;
      if (status === 'cancelled') values.cancelled += 1;
      if (status === 'overdue' || status === 'pending') values.open += 1;
    }
    return values;
  }, [assigneeScopedTasks, nowMs]);

  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return assigneeScopedTasks
      .filter((task) => {
        const status = effectiveStatus(task, nowMs);
        if (statusFilter === 'open' && !['pending', 'overdue'].includes(status)) return false;
        if (statusFilter !== 'open' && statusFilter !== 'all' && status !== statusFilter) return false;
        if (!normalizedSearch) return true;
        return [task.title, task.description, task.lead?.name]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(normalizedSearch));
      })
      .sort((a, b) => {
        const statusA = effectiveStatus(a, nowMs);
        const statusB = effectiveStatus(b, nowMs);
        const statusRank = { overdue: 0, pending: 1, completed: 2, cancelled: 3 } as const;
        if (statusRank[statusA] !== statusRank[statusB]) return statusRank[statusA] - statusRank[statusB];
        const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
        const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        return priorityWeight(a.priority) - priorityWeight(b.priority);
      });
  }, [assigneeScopedTasks, nowMs, search, statusFilter]);

  function assigneeLabel(task: LeadTask) {
    if (!task.assigned_to) return task.assigned_mode === 'ai' ? 'IA / sem responsável' : 'Sem responsável';
    const member = memberMap.get(task.assigned_to);
    return member?.full_name || 'Usuário';
  }

  function toggleSelectedAssignee(value: string) {
    setSelectedAssignees((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  async function actOnTask(task: TaskListItem, action: 'complete' | 'cancel' | 'reopen') {
    setLoadingTaskId(task.id);
    setError('');
    try {
      const response = await fetch(`/api/leads/${task.lead_id}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, action }),
      });
      const payload = await response.json().catch(() => ({})) as { task?: LeadTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || 'Não foi possível atualizar a tarefa.');
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...payload.task } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a tarefa.');
    } finally {
      setLoadingTaskId(null);
    }
  }

  return <div className="grid" style={{ gap: 18 }}>
    {error && <div className="error-box">{error}</div>}

    <div className="kpis" style={{ marginBottom: 0 }}>
      <button type="button" className="kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setStatusFilter('open')}>
        <div className="kpi-label">Em aberto</div><div className="kpi-value">{counts.open}</div><div className="kpi-note">pendentes + vencidas</div>
      </button>
      <button type="button" className="kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setStatusFilter('overdue')}>
        <div className="kpi-label">Vencidas</div><div className="kpi-value" style={{ color: counts.overdue > 0 ? 'var(--red)' : undefined }}>{counts.overdue}</div><div className="kpi-note">precisam de ação</div>
      </button>
      <button type="button" className="kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setStatusFilter('pending')}>
        <div className="kpi-label">Pendentes</div><div className="kpi-value">{counts.pending}</div><div className="kpi-note">dentro do prazo</div>
      </button>
      <button type="button" className="kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setStatusFilter('completed')}>
        <div className="kpi-label">Concluídas</div><div className="kpi-value">{counts.completed}</div><div className="kpi-note">no recorte atual</div>
      </button>
    </div>

    <section className="card">
      <div className="card-head"><h3>Filtros</h3><span className="faint" style={{ fontSize: 12 }}>{visibleTasks.length} tarefa{visibleTasks.length === 1 ? '' : 's'} exibida{visibleTasks.length === 1 ? '' : 's'}</span></div>
      <div className="card-body grid" style={{ gap: 14 }}>
        {isAdmin && <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7 }}>Responsáveis</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={`btn btn-sm ${assigneeMode === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAssigneeMode('all')}>Todas</button>
            <button type="button" className={`btn btn-sm ${assigneeMode === 'mine' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAssigneeMode('mine')}>Minhas</button>
            <button type="button" className={`btn btn-sm ${assigneeMode === 'custom' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAssigneeMode('custom')}>Selecionar responsáveis</button>
          </div>
          {assigneeMode === 'custom' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {members.map((member) => <label key={member.user_id} className="chip" style={{ cursor: 'pointer', gap: 6, padding: '6px 9px' }}>
              <input type="checkbox" checked={selectedAssignees.includes(member.user_id)} onChange={() => toggleSelectedAssignee(member.user_id)} />
              {member.full_name}{member.user_id === currentUserId ? ' (você)' : ''}
            </label>)}
            <label className="chip chip-orange" style={{ cursor: 'pointer', gap: 6, padding: '6px 9px' }}>
              <input type="checkbox" checked={selectedAssignees.includes(AI_ASSIGNEE)} onChange={() => toggleSelectedAssignee(AI_ASSIGNEE)} />
              IA / sem responsável
            </label>
          </div>}
        </div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 260px)', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 7 }}>Situação</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {([
                ['open', `Em aberto (${counts.open})`],
                ['overdue', `Vencidas (${counts.overdue})`],
                ['pending', `Pendentes (${counts.pending})`],
                ['completed', `Concluídas (${counts.completed})`],
                ['cancelled', `Canceladas (${counts.cancelled})`],
                ['all', `Todas (${counts.all})`],
              ] as Array<[StatusFilter, string]>).map(([value, label]) => <button key={value} type="button" className={`btn btn-sm ${statusFilter === value ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setStatusFilter(value)}>{label}</button>)}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Buscar tarefa ou lead</label>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: retorno, proposta, João…" />
          </div>
        </div>
      </div>
    </section>

    <section className="card">
      <div className="card-head"><h3>Tarefas</h3><span className="faint" style={{ fontSize: 12 }}>As vencidas aparecem primeiro.</span></div>
      <div className="card-body" style={{ padding: 0 }}>
        {visibleTasks.length === 0 ? <div className="empty-state">Nenhuma tarefa encontrada com estes filtros.</div> : <div style={{ display: 'grid' }}>
          {visibleTasks.map((task) => {
            const status = effectiveStatus(task, nowMs);
            const busy = loadingTaskId === task.id;
            return <div key={task.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(150px, .7fr) minmax(150px, .7fr) auto', gap: 14, alignItems: 'center', padding: '14px 17px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                  <strong>{task.title}</strong>
                  <span className={`chip ${status === 'overdue' ? 'chip-orange' : status === 'completed' ? 'chip-green' : ''}`}>{statusLabel(status)}</span>
                  <span className="chip">{priorityLabel(task.priority)}</span>
                </div>
                {task.description && <div className="muted" style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 5 }}>{task.description}</div>}
                <div className="faint" style={{ fontSize: 11 }}>
                  {task.lead ? <Link className="link" href={`/leads/${task.lead.id}`}>{task.lead.name}</Link> : 'Lead indisponível'}
                  {' · '}{task.lead?.kind === 'corretor' ? 'Corretor' : 'Cliente'}
                </div>
              </div>
              <div>
                <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Responsável</div>
                <strong style={{ fontSize: 12 }}>{assigneeLabel(task)}</strong>
              </div>
              <div>
                <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Prazo</div>
                <strong style={{ fontSize: 12, color: status === 'overdue' ? 'var(--red)' : undefined }}>{task.due_at ? formatDateTime(task.due_at) : 'Sem prazo'}</strong>
              </div>
              <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {task.lead && <Link className="btn btn-ghost btn-sm" href={`/leads/${task.lead.id}`}>Abrir lead</Link>}
                {(status === 'pending' || status === 'overdue') && <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void actOnTask(task, 'complete')}>{busy ? 'Salvando…' : 'Concluir'}</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void actOnTask(task, 'cancel')}>Cancelar</button>
                </>}
                {(status === 'completed' || status === 'cancelled') && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void actOnTask(task, 'reopen')}>{busy ? 'Salvando…' : 'Reabrir'}</button>}
              </div>
            </div>;
          })}
        </div>}
      </div>
    </section>
  </div>;
}
