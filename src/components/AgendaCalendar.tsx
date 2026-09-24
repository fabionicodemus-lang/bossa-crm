'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Member = { user_id: string; full_name: string; email: string; role: string };
type ViewMode = 'month' | 'week' | 'day';
type AgendaEvent = {
  id: string;
  lead_id: string | null;
  assigned_to: string | null;
  created_by_kind: 'human' | 'ai' | 'system';
  agent: 'nara' | 'plantao' | null;
  title: string;
  description: string | null;
  event_type: 'reuniao_cliente' | 'apresentacao' | 'visita' | 'ligacao' | 'tarefa' | 'outro';
  meeting_mode: 'presencial' | 'video' | 'telefone';
  location: string | null;
  video_url: string | null;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'completed' | 'cancelled';
};

type FormState = {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  event_type: AgendaEvent['event_type'];
  meeting_mode: AgendaEvent['meeting_mode'];
  location: string;
  video_url: string;
  date: string;
  start_time: string;
  end_time: string;
};

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const eventLabels: Record<AgendaEvent['event_type'], string> = {
  reuniao_cliente: 'Reunião com cliente',
  apresentacao: 'Apresentação',
  visita: 'Visita',
  ligacao: 'Ligação',
  tarefa: 'Tarefa',
  outro: 'Outro',
};
const modeLabels: Record<AgendaEvent['meeting_mode'], string> = {
  presencial: 'Presencial',
  video: 'Videochamada',
  telefone: 'Telefone',
};

function pad(value: number) { return String(value).padStart(2, '0'); }
function ymd(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function localIso(date: string, time: string) { return new Date(`${date}T${time}:00`).toISOString(); }
function hhmm(value: string) { const date = new Date(value); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function startOfWeek(date: Date) { const d = startOfDay(date); return addDays(d, -d.getDay()); }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function dateTitle(date: Date) { return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }

function initialForm(date = new Date(), memberId = ''): FormState {
  const rounded = new Date(date);
  rounded.setMinutes(rounded.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (rounded.getMinutes() === 0) rounded.setHours(rounded.getHours() + 1);
  const end = new Date(rounded.getTime() + 60 * 60 * 1000);
  return {
    id: '', title: '', description: '', assigned_to: memberId,
    event_type: 'reuniao_cliente', meeting_mode: 'presencial', location: '', video_url: '',
    date: ymd(rounded), start_time: `${pad(rounded.getHours())}:${pad(rounded.getMinutes())}`,
    end_time: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
}

export function AgendaCalendar({ members, currentUserId, canEdit }: { members: Member[]; currentUserId: string; canEdit: boolean }) {
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [view, setView] = useState<ViewMode>('month');
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState | null>(null);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const range = useMemo(() => {
    if (view === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const start = addDays(first, -first.getDay());
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const end = addDays(last, 6 - last.getDay() + 1);
      return { start, end };
    }
    if (view === 'week') {
      const start = startOfWeek(cursor);
      return { start, end: addDays(start, 7) };
    }
    const start = startOfDay(cursor);
    return { start, end: addDays(start, 1) };
  }, [cursor, view]);

  const rangeStartMs = range.start.getTime();
  const rangeEndMs = range.end.getTime();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        start: new Date(rangeStartMs).toISOString(),
        end: new Date(rangeEndMs).toISOString(),
      });
      if (assigneeFilter !== 'all') params.set('assigned_to', assigneeFilter);
      const response = await fetch(`/api/agenda?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as { events?: AgendaEvent[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a agenda.');
      setEvents(payload.events ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a agenda.');
    } finally { setLoading(false); }
  }, [rangeStartMs, rangeEndMs, assigneeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleEvents = useMemo(() => events.filter((event) => event.status !== 'cancelled'), [events]);

  function openNew(date = cursor, hour?: number) {
    if (!canEdit) return;
    const base = new Date(date);
    if (hour !== undefined) base.setHours(hour, 0, 0, 0);
    setForm(initialForm(base, currentUserId));
  }

  function openEdit(event: AgendaEvent) {
    if (!canEdit) return;
    const start = new Date(event.starts_at);
    void event.ends_at;
    setForm({
      id: event.id, title: event.title, description: event.description || '', assigned_to: event.assigned_to || currentUserId,
      event_type: event.event_type, meeting_mode: event.meeting_mode, location: event.location || '', video_url: event.video_url || '',
      date: ymd(start), start_time: hhmm(event.starts_at), end_time: hhmm(event.ends_at),
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true); setError('');
    try {
      const startsAt = localIso(form.date, form.start_time);
      let endsAt = localIso(form.date, form.end_time);
      if (new Date(endsAt) <= new Date(startsAt)) {
        const end = new Date(endsAt); end.setDate(end.getDate() + 1); endsAt = end.toISOString();
      }
      const response = await fetch('/api/agenda', {
        method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id || undefined, title: form.title, description: form.description, assigned_to: form.assigned_to,
          event_type: form.event_type, meeting_mode: form.meeting_mode, location: form.location, video_url: form.video_url,
          starts_at: startsAt, ends_at: endsAt,
        }),
      });
      const payload = await response.json() as { event?: AgendaEvent; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar o compromisso.');
      setForm(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o compromisso.'); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!form?.id || !window.confirm('Excluir este compromisso?')) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/agenda?id=${encodeURIComponent(form.id)}`, { method: 'DELETE' });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível excluir.');
      setForm(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir.'); }
    finally { setSaving(false); }
  }

  function move(direction: number) {
    const next = new Date(cursor);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    else if (view === 'week') next.setDate(next.getDate() + direction * 7);
    else next.setDate(next.getDate() + direction);
    setCursor(next);
  }

  const monthDays = useMemo(() => {
    const values: Date[] = [];
    let d = new Date(rangeStartMs);
    while (d.getTime() < rangeEndMs) { values.push(new Date(d)); d = addDays(d, 1); }
    return values;
  }, [rangeStartMs, rangeEndMs]);

  function eventsForDay(day: Date) {
    return visibleEvents.filter((event) => sameDay(new Date(event.starts_at), day));
  }

  function eventCard(event: AgendaEvent, compact = false) {
    const member = event.assigned_to ? memberMap.get(event.assigned_to) : null;
    return <button key={event.id} type="button" onClick={(e) => { e.stopPropagation(); openEdit(event); }} style={{
      width: '100%', textAlign: 'left', border: '1px solid var(--line)', background: event.created_by_kind === 'ai' ? 'var(--sand)' : 'var(--paper)',
      borderRadius: 8, padding: compact ? '5px 7px' : '8px 9px', cursor: canEdit ? 'pointer' : 'default', marginBottom: 5,
    }}>
      <div style={{ fontWeight: 800, fontSize: compact ? 11 : 12 }}>{hhmm(event.starts_at)} · {event.title}</div>
      {!compact && <div className="faint" style={{ fontSize: 10, marginTop: 3 }}>{member?.full_name || 'Sem responsável'} · {modeLabels[event.meeting_mode]}{event.created_by_kind === 'ai' ? ` · ${event.agent === 'plantao' ? 'Plantão IA' : 'Nara'}` : ''}</div>}
    </button>;
  }

  return <div className="grid" style={{ gap: 14 }}>
    {error && <div className="error-box">{error}</div>}

    <section className="card">
      <div className="card-body" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && <button className="btn btn-primary" onClick={() => openNew()}>+ Criar</button>}
          <button className="btn btn-ghost" onClick={() => setCursor(startOfDay(new Date()))}>Hoje</button>
          <button className="btn btn-ghost" onClick={() => move(-1)}>‹</button>
          <button className="btn btn-ghost" onClick={() => move(1)}>›</button>
          <strong style={{ textTransform: 'capitalize', minWidth: 180 }}>{view === 'day' ? cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : dateTitle(cursor)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="select" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ minWidth: 180 }}>
            <option value="all">Toda a equipe</option>
            {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['month','week','day'] as ViewMode[]).map((item) => <button key={item} className={`btn btn-sm ${view === item ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setView(item)}>{item === 'month' ? 'Mês' : item === 'week' ? 'Semana' : 'Dia'}</button>)}
          </div>
        </div>
      </div>
    </section>

    {loading ? <div className="empty-state">Carregando agenda...</div> : view === 'month' ? <section className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', borderBottom: '1px solid var(--line)' }}>
        {weekdays.map((day) => <div key={day} style={{ padding: 9, textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'var(--ink-soft)' }}>{day}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
        {monthDays.map((day) => {
          const isCurrentMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, new Date());
          const dayEvents = eventsForDay(day);
          return <div key={day.toISOString()} onDoubleClick={() => openNew(day)} onClick={() => setCursor(day)} style={{ minHeight: 120, padding: 8, borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: isCurrentMonth ? 'transparent' : 'rgba(0,0,0,.018)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 99, fontSize: 11, fontWeight: 800, background: isToday ? 'var(--ink)' : 'transparent', color: isToday ? 'white' : isCurrentMonth ? 'var(--ink)' : 'var(--ink-faint)' }}>{day.getDate()}</span>
              {dayEvents.length > 3 && <span className="faint" style={{ fontSize: 10 }}>+{dayEvents.length - 3}</span>}
            </div>
            {dayEvents.slice(0, 3).map((event) => eventCard(event, true))}
          </div>;
        })}
      </div>
    </section> : <section className="card" style={{ overflow: 'auto' }}>
      <div style={{ minWidth: view === 'week' ? 900 : 480 }}>
        <div style={{ display: 'grid', gridTemplateColumns: view === 'week' ? '70px repeat(7, minmax(110px,1fr))' : '70px minmax(300px,1fr)', borderBottom: '1px solid var(--line)' }}>
          <div />
          {(view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)) : [cursor]).map((day) => <div key={day.toISOString()} style={{ padding: 10, textAlign: 'center', fontWeight: 800, fontSize: 12 }}>{weekdays[day.getDay()]} {day.getDate()}</div>)}
        </div>
        {Array.from({ length: 14 }, (_, i) => i + 7).map((hour) => <div key={hour} style={{ display: 'grid', gridTemplateColumns: view === 'week' ? '70px repeat(7, minmax(110px,1fr))' : '70px minmax(300px,1fr)', minHeight: 64, borderBottom: '1px solid var(--line)' }}>
          <div className="faint" style={{ fontSize: 10, padding: '7px 8px', textAlign: 'right' }}>{pad(hour)}:00</div>
          {(view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)) : [cursor]).map((day) => {
            const slotEvents = eventsForDay(day).filter((event) => new Date(event.starts_at).getHours() === hour);
            return <div key={`${day.toISOString()}-${hour}`} onDoubleClick={() => openNew(day, hour)} style={{ padding: 5, borderLeft: '1px solid var(--line)', cursor: 'pointer' }}>
              {slotEvents.map((event) => eventCard(event))}
            </div>;
          })}
        </div>)}
      </div>
    </section>}

    {form && <div onMouseDown={(e) => { if (e.currentTarget === e.target) setForm(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.35)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 20 }}>
      <section className="card" style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="card-head"><h3>{form.id ? 'Editar compromisso' : 'Novo compromisso'}</h3><button className="btn btn-ghost btn-sm" onClick={() => setForm(null)}>✕</button></div>
        <div className="card-body grid" style={{ gap: 12 }}>
          <div className="field"><label>Título</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Apresentação do Flow para João" /></div>
          <div className="grid grid-2">
            <div className="field"><label>Responsável</label><select className="select" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}><option value="">Selecione</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></div>
            <div className="field"><label>Tipo</label><select className="select" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value as AgendaEvent['event_type'] })}>{Object.entries(eventLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <div className="grid grid-3">
            <div className="field"><label>Data</label><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label>Início</label><input className="input" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div className="field"><label>Fim</label><input className="input" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
          </div>
          <div className="grid grid-2">
            <div className="field"><label>Formato</label><select className="select" value={form.meeting_mode} onChange={(e) => setForm({ ...form, meeting_mode: e.target.value as AgendaEvent['meeting_mode'] })}>{Object.entries(modeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>{form.meeting_mode === 'video' ? 'Link da videochamada' : form.meeting_mode === 'telefone' ? 'Telefone / observação' : 'Local'}</label><input className="input" value={form.meeting_mode === 'video' ? form.video_url : form.location} onChange={(e) => setForm(form.meeting_mode === 'video' ? { ...form, video_url: e.target.value } : { ...form, location: e.target.value })} placeholder={form.meeting_mode === 'video' ? 'https://meet.google.com/...' : 'Local ou observação'} /></div>
          </div>
          <div className="field"><label>Descrição</label><textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Contexto, pauta ou observações" /></div>
          <div className="info-box"><strong>Conflitos:</strong> o CRM bloqueia automaticamente dois compromissos sobrepostos para o mesmo responsável. A mesma regra é usada pela Nara e pelo Plantão.</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>{form.id && <button className="btn btn-ghost" onClick={() => void remove()} disabled={saving}>Excluir</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn btn-primary" onClick={() => void save()} disabled={saving || !form.title.trim() || !form.assigned_to}>{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      </section>
    </div>}
  </div>;
}
