'use client';

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Activity, Lead, LeadTask, Message, TeamMember } from '@/lib/types';
import { displayPhone, formatDateTime, initials } from '@/lib/format';
import { stageLabel, stagesFor } from '@/lib/stages';
import { useLeadLiveFeed } from '@/lib/use-lead-live-feed';
import { MessageContent } from '@/components/MessageContent';
import { metaAdSourceLabel, readMetaAdAttribution } from '@/lib/meta-ad-attribution';
import {
  isCustomerServiceWindowOpen,
  leadWindowExpiresAt,
  OUTSIDE_WINDOW_MESSAGE,
  windowExpiresFromInbound,
} from '@/lib/whatsapp/window';

type Tab = 'whatsapp' | 'historico' | 'tarefas' | 'dados';

// Margem em que a conversa ainda conta como "no fim": o usuário pode estar
// alguns pixels acima sem que a mensagem nova deixe de acompanhá-lo.
const BOTTOM_THRESHOLD_PX = 80;

type AiUsageSummary = {
  calls: number;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  last_model: string | null;
  last_at: string | null;
};

function messageClass(message: Message) {
  if (message.direction === 'system' || message.sender_kind === 'sistema') return 'system';
  return message.direction === 'in' ? 'in' : 'out';
}

function senderLabel(message: Message) {
  if (message.sender_kind === 'ia') return 'IA';
  if (message.sender_kind === 'humano') return 'Comercial Bossa';
  if (message.sender_kind === 'sistema') return 'Sistema';
  return 'Contato';
}

function scoreLabel(value: number) {
  if (value >= 75) return 'Quente';
  if (value >= 40) return 'Morno';
  return 'Frio';
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readAiUsage(metadata: Record<string, unknown> | null | undefined): AiUsageSummary | null {
  const raw = metadata?.ai_usage;
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  return {
    calls: numberValue(value.calls),
    input_tokens: numberValue(value.input_tokens),
    cached_tokens: numberValue(value.cached_tokens),
    output_tokens: numberValue(value.output_tokens),
    estimated_cost_usd: numberValue(value.estimated_cost_usd),
    last_model: typeof value.last_model === 'string' ? value.last_model : null,
    last_at: typeof value.last_at === 'string' ? value.last_at : null,
  };
}

// Uma mensagem também muda quando a Meta confirma entrega/leitura, então o
// controle de duplicidade precisa considerar o corpo e o status, não só o id.
function messageSignature(message: Message) {
  return `${message.created_at}|${message.status ?? ''}|${message.body}`;
}

function byCreatedAt(a: { created_at: string }, b: { created_at: string }) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

// O Realtime e a Data API entregam o timestamp em formatos diferentes. O cursor
// da sincronização incremental é sempre normalizado em ISO para que a
// comparação e o filtro `gte` continuem confiáveis.
function newestCreatedAt(rows: Array<{ created_at: string }>): string | null {
  let newest = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const time = new Date(row.created_at).getTime();
    if (Number.isFinite(time) && time > newest) newest = time;
  }
  return Number.isFinite(newest) ? new Date(newest).toISOString() : null;
}

function localToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dueStatus(value: string | null) {
  if (!value) return { label: 'Sem prazo', overdue: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: 'Prazo inválido', overdue: false };
  const overdue = date.getTime() < Date.now();
  return { label: `${overdue ? 'Vencida · ' : ''}${formatDateTime(value)}`, overdue };
}

export function LeadDetail({
  initialLead,
  initialMessages,
  initialActivities,
  initialTasks,
  teamMembers,
  whatsappConnected,
  canEdit,
}: {
  initialLead: Lead;
  initialMessages: Message[];
  initialActivities: Activity[];
  initialTasks: LeadTask[];
  teamMembers: TeamMember[];
  whatsappConnected: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [messages, setMessages] = useState(initialMessages);
  const [activities, setActivities] = useState(initialActivities);
  const [tasks, setTasks] = useState(initialTasks);
  const [tab, setTab] = useState<Tab>('whatsapp');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDue, setNextActionDue] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskPriority, setTaskPriority] = useState('normal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const updateClock = () => setClock(Date.now());
    const initialTimer = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  // Rolagem no estilo WhatsApp Web: a conversa abre e permanece na última
  // mensagem, mas nunca arranca o usuário do lugar enquanto ele lê o histórico.
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottom = useRef(true);
  const pendingScroll = useRef(false);
  const openedConversation = useRef(false);
  const [unseenCount, setUnseenCount] = useState(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    pinnedToBottom.current = true;
    setUnseenCount(0);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const node = messagesRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    pinnedToBottom.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    if (pinnedToBottom.current) setUnseenCount(0);
  }, []);

  // Guarda o que já está na tela para que Realtime, sincronização incremental e
  // respostas otimistas do próprio usuário nunca dupliquem nem reprocessem.
  const knownMessages = useRef(new Map(initialMessages.map((message) => [message.id, messageSignature(message)])));
  const knownActivities = useRef(new Map(initialActivities.map((activity) => [activity.id, activity.created_at])));
  const knownTasks = useRef(new Set(initialTasks.map((task) => task.id)));
  const latestMessageAt = useRef(newestCreatedAt(initialMessages));
  const latestActivityAt = useRef(newestCreatedAt(initialActivities));

  const applyMessages = useCallback((incoming: Message[]) => {
    const fresh = incoming.filter((message) => knownMessages.current.get(message.id) !== messageSignature(message));
    if (!fresh.length) return;
    // `fresh` também traz confirmação de entrega de mensagem já visível. Só as
    // linhas realmente novas contam para a rolagem e para o aviso de não lidas.
    const added = fresh.filter((message) => !knownMessages.current.has(message.id));
    fresh.forEach((message) => knownMessages.current.set(message.id, messageSignature(message)));

    if (added.length) {
      pendingScroll.current = true;
      const unread = added.filter((message) => message.direction === 'in').length;
      if (unread && !pinnedToBottom.current) setUnseenCount((current) => current + unread);
    }

    const newest = newestCreatedAt(fresh);
    if (newest && (!latestMessageAt.current || newest > latestMessageAt.current)) {
      latestMessageAt.current = newest;
    }

    setMessages((current) => {
      const merged = [...current];
      for (const message of fresh) {
        const index = merged.findIndex((item) => item.id === message.id);
        if (index >= 0) merged[index] = message;
        else merged.push(message);
      }
      return merged.sort(byCreatedAt);
    });

    const newestInbound = newestCreatedAt(fresh.filter((message) => message.direction === 'in'));
    if (!newestInbound) return;
    setLead((current) => {
      const known = current.last_inbound_at ? new Date(current.last_inbound_at).getTime() : Number.NEGATIVE_INFINITY;
      if (known >= new Date(newestInbound).getTime()) return current;
      return {
        ...current,
        last_inbound_at: newestInbound,
        metadata: {
          ...(current.metadata || {}),
          whatsapp_window_expires_at: windowExpiresFromInbound(newestInbound),
        },
      };
    });
    setClock(Date.now());
  }, []);

  const applyActivities = useCallback((incoming: Activity[]) => {
    const fresh = incoming.filter((activity) => !knownActivities.current.has(activity.id));
    if (!fresh.length) return;
    fresh.forEach((activity) => knownActivities.current.set(activity.id, activity.created_at));

    const newest = newestCreatedAt(fresh);
    if (newest && (!latestActivityAt.current || newest > latestActivityAt.current)) {
      latestActivityAt.current = newest;
    }

    setActivities((current) => [...fresh, ...current].sort((a, b) => byCreatedAt(b, a)));
  }, []);

  const applyTaskInsert = useCallback((task: LeadTask) => {
    if (knownTasks.current.has(task.id)) return;
    knownTasks.current.add(task.id);
    setTasks((current) => [task, ...current]);
  }, []);

  const applyTaskUpdate = useCallback((task: LeadTask) => {
    knownTasks.current.add(task.id);
    setTasks((current) => current.some((item) => item.id === task.id)
      ? current.map((item) => item.id === task.id ? task : item)
      : [task, ...current]);
  }, []);

  // A rolagem acontece depois da pintura, com `useLayoutEffect`, para a
  // mensagem nova nunca chegar a piscar fora da área visível.
  useLayoutEffect(() => {
    if (tab !== 'whatsapp') return;
    const node = messagesRef.current;
    if (!node) return;
    if (!openedConversation.current) {
      // Primeira pintura da aba: cai direto na última mensagem, sem animação.
      openedConversation.current = true;
      scrollToBottom('auto');
      pendingScroll.current = false;
      return;
    }
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    if (pinnedToBottom.current) scrollToBottom('smooth');
  }, [tab, messages, scrollToBottom]);

  useEffect(() => {
    if (tab !== 'whatsapp') openedConversation.current = false;
  }, [tab]);

  const feedStatus = useLeadLiveFeed(lead.id, {
    onMessages: applyMessages,
    onActivities: applyActivities,
    onTaskInsert: applyTaskInsert,
    onTaskUpdate: applyTaskUpdate,
    latestMessageAt: () => latestMessageAt.current,
    latestActivityAt: () => latestActivityAt.current,
  });

  const persona = lead.kind === 'cliente' ? 'Nara' : 'Plantão';
  const owner = teamMembers.find((member) => member.user_id === lead.owner_id);
  const backup = teamMembers.find((member) => member.user_id === lead.backup_owner_id);
  const pendingTasks = tasks.filter((task) => task.status === 'pending' || task.status === 'overdue');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const usage = useMemo(() => readAiUsage(lead.metadata), [lead.metadata]);
  const adAttribution = useMemo(() => readMetaAdAttribution(lead.metadata), [lead.metadata]);
  const sourceLabel = useMemo(() => metaAdSourceLabel(lead.metadata) || lead.source || 'Origem não informada', [lead.metadata, lead.source]);
  const metaEntries = useMemo(() => Object.entries(lead.metadata || {}).filter(([key, value]) => ![
    'ad',
    'ad_history',
    'ai_usage',
    'hybrid_last_decision',
    'whatsapp_channel_id',
    'whatsapp_conversation_id',
    'whatsapp_window_expires_at',
  ].includes(key) && value !== null && value !== ''), [lead.metadata]);
  const lastContact = messages.length ? formatDateTime(messages[messages.length - 1].created_at) : '—';
  const canReactivateAi = !['fechado_ganho', 'encerrado'].includes(lead.stage) && !lead.opt_out;
  const windowExpiresAt = useMemo(() => leadWindowExpiresAt(lead), [lead]);
  const windowOpen = clock === 0
    ? Boolean(windowExpiresAt)
    : isCustomerServiceWindowOpen(windowExpiresAt, clock);

  async function requestJson(url: string, method: string, body: unknown) {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a ação.');
    return payload;
  }

  async function changeStage(stage: string) {
    if (!canEdit) return;
    setError('');
    try {
      const payload = await requestJson(`/api/leads/${lead.id}/stage`, 'POST', { stage });
      setLead((current) => ({ ...current, stage, owner_mode: payload.owner_mode ?? current.owner_mode, ai_enabled: payload.ai_enabled ?? current.ai_enabled }));
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a etapa.'); }
  }

  async function toggleAi(enabled: boolean) {
    if (!canEdit) return;
    setError('');
    try {
      const payload = await requestJson(`/api/leads/${lead.id}/ai`, 'POST', { enabled });
      setLead((current) => ({ ...current, ...payload, id: current.id }));
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o atendimento.'); }
  }

  async function acceptHandoff() {
    if (!canEdit) return;
    setLoading(true);
    setError('');
    try {
      const payload = await requestJson(`/api/leads/${lead.id}/handoff`, 'POST', { action: 'accept' });
      setLead((current) => ({ ...current, owner_id: payload.owner_id, owner_mode: 'human', ai_enabled: false, stage: 'humano_ativo', next_action_due_at: payload.due_at }));
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível aceitar a passagem.'); }
    setLoading(false);
  }

  async function releaseToAi() {
    if (!canEdit) return;
    setLoading(true);
    setError('');
    try {
      await requestJson(`/api/leads/${lead.id}/handoff`, 'POST', { action: 'release' });
      setLead((current) => ({ ...current, owner_id: null, owner_mode: 'ai', ai_enabled: true, stage: 'nutricao_ativa' }));
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível devolver para a IA.'); }
    setLoading(false);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!canEdit || !body) return;
    if (!windowOpen) {
      setError(OUTSIDE_WINDOW_MESSAGE);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await requestJson('/api/whatsapp/send', 'POST', { leadId: lead.id, body });
      setText('');
      if (payload.message) applyMessages([payload.message]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao enviar mensagem.'); }
    setLoading(false);
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    const description = note.trim();
    if (!canEdit || !description) return;
    setLoading(true);
    setError('');
    try {
      const payload = await requestJson('/api/activities', 'POST', {
        leadId: lead.id,
        title: 'Registro do atendimento comercial',
        description,
        nextAction: nextAction.trim(),
        nextActionType: 'followup_humano',
        nextActionDueAt: localToIso(nextActionDue),
      });
      setNote('');
      setNextAction('');
      setNextActionDue('');
      if (payload.activity) applyActivities([payload.activity]);
      if (payload.task) applyTaskInsert(payload.task);
      setLead((current) => ({ ...current, next_action: payload.task?.title ?? current.next_action, next_action_due_at: payload.task?.due_at ?? current.next_action_due_at }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o registro.'); }
    setLoading(false);
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !taskTitle.trim()) return;
    setLoading(true);
    setError('');
    try {
      const payload = await requestJson(`/api/leads/${lead.id}/tasks`, 'POST', { title: taskTitle.trim(), description: taskDescription.trim(), dueAt: localToIso(taskDue), priority: taskPriority });
      setTaskTitle(''); setTaskDescription(''); setTaskDue(''); setTaskPriority('normal');
      if (payload.task) applyTaskInsert(payload.task);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a tarefa.'); }
    setLoading(false);
  }

  async function completeTask(taskId: string) {
    if (!canEdit) return;
    setError('');
    try {
      const payload = await requestJson(`/api/leads/${lead.id}/tasks`, 'PATCH', { taskId, action: 'complete' });
      if (payload.task) applyTaskUpdate(payload.task);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a tarefa.'); }
  }

  return <>
    {error && <div className="error-box">{error}</div>}
    <section className="detail-top">
      <div className="profile-head">
        <div className="profile-avatar">{initials(lead.name)}</div>
        <div><div className="profile-name">{lead.name}</div><div className="profile-meta">{displayPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ''}<br />{lead.kind === 'cliente' ? `${lead.enterprise || 'Empreendimento não informado'} · ${sourceLabel}` : `${lead.company || 'Autônomo'} · ${lead.group_name || 'Sem grupo'}`}</div></div>
        <div className="profile-actions">
          <select className="select" style={{ width: 230 }} value={lead.stage} disabled={!canEdit} onChange={(event) => void changeStage(event.target.value)}>{stagesFor(lead.kind).map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select>
          {canEdit && lead.stage === 'passagem_pendente' && <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => void acceptHandoff()}>✅ Aceitar lead</button>}
          {canEdit && lead.owner_mode === 'human' && <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void releaseToAi()}>🤖 Devolver para {persona}</button>}
          {canEdit && lead.owner_mode !== 'human' && !lead.ai_enabled && canReactivateAi && <button className="btn btn-primary btn-sm" onClick={() => void toggleAi(true)}>🤖 Reativar {persona}</button>}
        </div>
      </div>
      <div className="tabs"><button className={`tab ${tab === 'whatsapp' ? 'on' : ''}`} onClick={() => setTab('whatsapp')}>💬 WhatsApp</button><button className={`tab ${tab === 'historico' ? 'on' : ''}`} onClick={() => setTab('historico')}>🕘 Histórico</button><button className={`tab ${tab === 'tarefas' ? 'on' : ''}`} onClick={() => setTab('tarefas')}>✅ Tarefas ({pendingTasks.length})</button><button className={`tab ${tab === 'dados' ? 'on' : ''}`} onClick={() => setTab('dados')}>👤 Dados</button></div>
    </section>

    <div className="detail-grid">
      <section className="card">
        {tab === 'whatsapp' && <div className="whatsapp-panel"><div className="wa-head"><div className="wa-icon">☏</div><div><strong>Conversa no WhatsApp</strong><div className="faint" style={{ fontSize: 11 }}>IA e humano compartilham o histórico</div></div><span className={`connection-pill ${whatsappConnected ? '' : 'off'}`}>{whatsappConnected ? 'Canal conectado' : 'Aguardando integração'}</span><span className={`connection-pill ${windowOpen ? '' : 'off'}`}>{windowOpen ? 'Janela de 24h aberta' : 'Janela fechada'}</span><span className={`connection-pill ${feedStatus === 'live' ? '' : 'off'}`} title="Mensagens recebidas aparecem sozinhas, sem recarregar a página.">{feedStatus === 'live' ? 'Tempo real ativo' : feedStatus === 'connecting' ? 'Conectando…' : 'Reconectando…'}</span></div><div className="messages-wrap"><div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>{messages.length === 0 ? <div className="empty-state">As mensagens aparecerão aqui.</div> : messages.map((message) => <div className={`message ${messageClass(message)}`} key={message.id}><small style={{ fontWeight: 700, display: 'block', marginBottom: 3 }}>{senderLabel(message)}</small><MessageContent message={message} /><span className="message-meta">{formatDateTime(message.created_at)}{message.status ? ` · ${message.status}` : ''}</span></div>)}</div>{unseenCount > 0 && <button type="button" className="btn btn-primary btn-sm new-messages-jump" onClick={() => scrollToBottom('smooth')}>↓ {unseenCount} {unseenCount === 1 ? 'nova mensagem' : 'novas mensagens'}</button>}</div>{!canEdit ? <div className="blocked"><span><strong>Acesso somente para consulta.</strong></span></div> : lead.owner_mode === 'ai' && lead.ai_enabled ? <div className="blocked"><span><strong>{persona} é a dona deste contato.</strong><br />Aceite a passagem ou assuma para enviar mensagens humanas.</span><button className="btn btn-primary btn-sm" onClick={() => void toggleAi(false)}>Assumir conversa</button></div> : !whatsappConnected ? <div className="blocked"><span><strong>WhatsApp ainda não conectado.</strong></span></div> : !windowOpen ? <div className="blocked"><span><strong>{OUTSIDE_WINDOW_MESSAGE}</strong><br />Aguarde uma mensagem do contato ou envie um template pela área de Transmissões.</span></div> : <form className="composer" onSubmit={sendMessage}><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Escreva uma mensagem…" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="btn btn-primary" disabled={loading}>{loading ? 'Enviando…' : 'Enviar'}</button></form>}</div>}

        {tab === 'historico' && <div><div className="card-head"><h3>Histórico e próxima ação</h3></div><div className="card-body">{canEdit && <form onSubmit={addNote} style={{ marginBottom: 20 }}><div className="field"><label>O que aconteceu</label><textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: avaliou o fluxo, vai conversar com a esposa e pediu retorno na sexta." /></div><div className="grid grid-2"><div className="field"><label>Próxima ação {lead.owner_mode === 'human' ? '(obrigatória)' : ''}</label><input className="input" value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></div><div className="field"><label>Data e hora</label><input className="input" type="datetime-local" value={nextActionDue} onChange={(event) => setNextActionDue(event.target.value)} /></div></div><button className="btn btn-secondary btn-sm" disabled={loading}>Salvar registro e tarefa</button></form>}<div className="timeline">{activities.length === 0 ? <div className="empty-state">Nenhum histórico registrado.</div> : activities.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-icon">•</div><div><div className="timeline-title">{item.title}</div>{item.description && <div className="timeline-desc">{item.description}</div>}<div className="timeline-time">{formatDateTime(item.created_at)}</div></div></div>)}</div></div></div>}

        {tab === 'tarefas' && <div><div className="card-head"><h3>Próximas ações e SLAs</h3></div><div className="card-body">{canEdit && <form onSubmit={createTask} className="grid grid-2" style={{ marginBottom: 22 }}><div className="field"><label>Tarefa</label><input className="input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /></div><div className="field"><label>Prazo</label><input className="input" type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} /></div><div className="field"><label>Descrição</label><textarea className="textarea" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /></div><div className="field"><label>Prioridade</label><select className="select" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select><button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={loading}>Criar tarefa</button></div></form>}<h4>Pendentes</h4><div className="info-list">{pendingTasks.length === 0 && <div className="empty-state">Nenhuma tarefa pendente.</div>}{pendingTasks.map((task) => { const due = dueStatus(task.due_at); return <div className="info-row" key={task.id} style={{ alignItems: 'flex-start' }}><span><strong>{task.priority === 'urgent' ? '🚨 ' : task.priority === 'high' ? '⚡ ' : ''}{task.title}</strong><br /><small>{task.description || 'Sem descrição'} · <span style={{ color: due.overdue ? 'var(--red)' : undefined }}>{due.label}</span></small></span>{canEdit && <button className="btn btn-primary btn-sm" onClick={() => void completeTask(task.id)}>Concluir</button>}</div>; })}</div>{completedTasks.length > 0 && <><h4 style={{ marginTop: 22 }}>Concluídas</h4><div className="info-list">{completedTasks.slice(0, 10).map((task) => <div className="info-row" key={task.id}><span>✓ {task.title}</span><strong>{task.completed_at ? formatDateTime(task.completed_at) : 'Concluída'}</strong></div>)}</div></>}</div></div>}

        {tab === 'dados' && <div><div className="card-head"><h3>Dados e qualificação</h3></div><div className="card-body grid grid-2"><div className="info-list"><div className="info-row"><span>Nome</span><strong>{lead.name}</strong></div><div className="info-row"><span>WhatsApp</span><strong>{displayPhone(lead.phone)}</strong></div><div className="info-row"><span>E-mail</span><strong>{lead.email || '—'}</strong></div><div className="info-row"><span>Etapa</span><strong>{stageLabel(lead.kind, lead.stage)}</strong></div></div><div className="info-list"><div className="info-row"><span>{lead.kind === 'cliente' ? 'Empreendimento' : 'Imobiliária'}</span><strong>{lead.kind === 'cliente' ? lead.enterprise || '—' : lead.company || '—'}</strong></div><div className="info-row"><span>CRECI</span><strong>{lead.creci || '—'}</strong></div><div className="info-row"><span>Score</span><strong>{lead.temperature}/100</strong></div><div className="info-row"><span>Criado em</span><strong>{formatDateTime(lead.created_at)}</strong></div></div>{adAttribution && <div style={{ gridColumn: '1 / -1' }}><h4>Origem do anúncio Meta</h4><div className="info-list"><div className="info-row"><span>Origem</span><strong>{sourceLabel}</strong></div><div className="info-row"><span>ID do anúncio</span><strong>{adAttribution.source_id || '—'}</strong></div><div className="info-row"><span>Tipo</span><strong>{adAttribution.source_type || '—'}</strong></div><div className="info-row"><span>URL</span><strong style={{ overflowWrap: 'anywhere' }}>{adAttribution.source_url || '—'}</strong></div><div className="info-row"><span>Título</span><strong>{adAttribution.headline || '—'}</strong></div><div className="info-row"><span>Texto</span><strong>{adAttribution.body || '—'}</strong></div><div className="info-row"><span>Capturado em</span><strong>{formatDateTime(adAttribution.captured_at)}</strong></div></div></div>}{metaEntries.length > 0 && <div style={{ gridColumn: '1 / -1' }}><h4>Campos identificados</h4><div className="table-wrap"><table><tbody>{metaEntries.map(([key, value]) => <tr key={key}><td className="faint">{key}</td><td>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</td></tr>)}</tbody></table></div></div>}</div></div>}
      </section>

      <aside className="side-stack">
        <section className="card"><div className="card-head"><h3>Dono do lead</h3></div><div className="card-body">{lead.owner_mode === 'human' ? <div className="ai-state off"><strong>👤 {owner?.full_name || 'Comercial humano'}</strong><br />A IA está em silêncio e continua analisando.</div> : lead.owner_mode === 'none' ? <div className="ai-state off"><strong>Encerrado</strong></div> : <div className="ai-state on"><strong>🤖 {persona}</strong><br />A IA responde até a passagem ser aceita.</div>}{backup && <div className="faint" style={{ marginTop: 9 }}>Backup: {backup.full_name}</div>}</div></section>
        <section className="card"><div className="card-head"><h3>Controle comercial</h3></div><div className="card-body info-list"><div className="info-row"><span>Classe</span><strong>{lead.priority_class || '—'}</strong></div><div className="info-row"><span>Classificação IA</span><strong>{lead.ai_classification || '—'}</strong></div><div className="info-row"><span>Score</span><strong>{scoreLabel(lead.temperature)} · {lead.temperature}/100</strong></div><div className="info-row"><span>Próxima ação</span><strong>{lead.next_action || lead.ai_next_action || '—'}</strong></div><div className="info-row"><span>Prazo</span><strong>{lead.next_action_due_at ? formatDateTime(lead.next_action_due_at) : '—'}</strong></div><div className="info-row"><span>Resumo</span><strong>{lead.ai_summary || '—'}</strong></div></div></section>
        <section className="card"><div className="card-head"><h3>Consumo da IA</h3></div><div className="card-body info-list">{usage ? <><div className="info-row"><span>Custo estimado</span><strong>US$ {usage.estimated_cost_usd.toFixed(4)}</strong></div><div className="info-row"><span>Chamadas</span><strong>{usage.calls}</strong></div><div className="info-row"><span>Entrada / cache</span><strong>{usage.input_tokens} / {usage.cached_tokens}</strong></div><div className="info-row"><span>Saída</span><strong>{usage.output_tokens}</strong></div><div className="info-row"><span>Último modelo</span><strong>{usage.last_model || '—'}</strong></div><div className="info-row"><span>Última análise</span><strong>{usage.last_at ? formatDateTime(usage.last_at) : '—'}</strong></div></> : <div className="empty-state">Ainda sem consumo registrado.</div>}</div></section>
        <section className="card"><div className="card-head"><h3>Resumo</h3></div><div className="card-body info-list"><div className="info-row"><span>Etapa</span><strong>{stageLabel(lead.kind, lead.stage)}</strong></div><div className="info-row"><span>Mensagens</span><strong>{messages.filter((message) => message.direction !== 'system').length}</strong></div><div className="info-row"><span>Tarefas pendentes</span><strong>{pendingTasks.length}</strong></div><div className="info-row"><span>Último contato</span><strong>{lastContact}</strong></div><div className="info-row"><span>WhatsApp</span><strong>{whatsappConnected ? 'Conectado' : 'Não conectado'}</strong></div><div className="info-row"><span>Janela 24h</span><strong>{windowOpen ? `Aberta até ${windowExpiresAt ? formatDateTime(windowExpiresAt) : '—'}` : 'Fechada'}</strong></div></div></section>
      </aside>
    </div>
  </>;
}
