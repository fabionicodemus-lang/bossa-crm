'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Activity, Lead, Message } from '@/lib/types';
import { displayPhone, formatDateTime, initials } from '@/lib/format';
import { stageLabel, stagesFor } from '@/lib/stages';
import { createClient } from '@/lib/supabase/client';

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

export function LeadDetail({ initialLead, initialMessages, initialActivities, whatsappConnected, canEdit }: { initialLead: Lead; initialMessages: Message[]; initialActivities: Activity[]; whatsappConnected: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [messages, setMessages] = useState(initialMessages);
  const [activities, setActivities] = useState(initialActivities);
  const [tab, setTab] = useState<'whatsapp' | 'historico' | 'dados'>('whatsapp');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`lead-${lead.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${lead.id}` }, (payload: any) => {
        const item = payload.new as Message;
        setMessages((current) => current.some((m) => m.id === item.id) ? current : [...current, item]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities', filter: `lead_id=eq.${lead.id}` }, (payload: any) => {
        const item = payload.new as Activity;
        setActivities((current) => current.some((a) => a.id === item.id) ? current : [item, ...current]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [lead.id]);

  const lastContact = messages.length ? formatDateTime(messages[messages.length - 1].created_at) : '—';
  const metaEntries = useMemo(() => Object.entries(lead.metadata || {}).filter(([, value]) => value !== null && value !== ''), [lead.metadata]);

  async function changeStage(stage: string) {
    if (!canEdit) return;
    setError('');
    const response = await fetch(`/api/leads/${lead.id}/stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || 'Não foi possível alterar a etapa.'); return; }
    setLead((current) => ({ ...current, stage, ai_enabled: current.kind === 'cliente' && stage === 'ia' }));
    router.refresh();
  }

  async function toggleAi(enabled: boolean) {
    if (!canEdit) return;
    setError('');
    const response = await fetch(`/api/leads/${lead.id}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || 'Não foi possível alterar o atendimento.'); return; }
    setLead((current) => ({ ...current, ai_enabled: enabled }));
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const body = text.trim();
    if (!body) return;
    setLoading(true);
    setError('');
    const response = await fetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, body }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'Falha ao enviar mensagem.');
    else {
      setText('');
      if (payload.message) setMessages((current) => current.some((m) => m.id === payload.message.id) ? current : [...current, payload.message]);
    }
    setLoading(false);
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const description = note.trim();
    if (!description) return;
    setLoading(true);
    const response = await fetch('/api/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, title: 'Anotação comercial', description }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'Não foi possível salvar a anotação.');
    else {
      setNote('');
      if (payload.activity) setActivities((current) => current.some((a) => a.id === payload.activity.id) ? current : [payload.activity, ...current]);
    }
    setLoading(false);
  }

  return (
    <>
      {error && <div className="error-box">{error}</div>}
      <section className="detail-top">
        <div className="profile-head">
          <div className="profile-avatar">{initials(lead.name)}</div>
          <div><div className="profile-name">{lead.name}</div><div className="profile-meta">{displayPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ''}<br />{lead.kind === 'cliente' ? `${lead.enterprise || 'Empreendimento não informado'} · ${lead.source || 'Origem não informada'}` : `${lead.company || 'Autônomo'} · ${lead.group_name || 'Sem grupo'}`}</div></div>
          <div className="profile-actions"><select className="select" style={{ width: 230 }} value={lead.stage} disabled={!canEdit} onChange={(e) => void changeStage(e.target.value)}>{stagesFor(lead.kind).map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select>{canEdit && (lead.ai_enabled ? <button className="btn btn-primary btn-sm" onClick={() => void toggleAi(false)}>👤 Assumir conversa</button> : lead.kind === 'cliente' && lead.stage === 'ia' ? <button className="btn btn-ghost btn-sm" onClick={() => void toggleAi(true)}>🤖 Reativar IA</button> : null)}</div>
        </div>
        <div className="tabs"><button className={`tab ${tab === 'whatsapp' ? 'on' : ''}`} onClick={() => setTab('whatsapp')}>💬 WhatsApp</button><button className={`tab ${tab === 'historico' ? 'on' : ''}`} onClick={() => setTab('historico')}>🕘 Histórico completo</button><button className={`tab ${tab === 'dados' ? 'on' : ''}`} onClick={() => setTab('dados')}>👤 Dados</button></div>
      </section>

      <div className="detail-grid">
        <section className="card">
          {tab === 'whatsapp' && <div className="whatsapp-panel">
            <div className="wa-head"><div className="wa-icon">☏</div><div><strong>Conversa no WhatsApp</strong><div className="faint" style={{ fontSize: 11 }}>Histórico persistido no banco</div></div><span className={`connection-pill ${whatsappConnected ? '' : 'off'}`}>{whatsappConnected ? 'Canal conectado' : 'Aguardando integração'}</span></div>
            <div className="messages">{messages.length === 0 ? <div className="empty-state">As mensagens recebidas e enviadas aparecerão aqui.</div> : messages.map((message) => <div className={`message ${messageClass(message)}`} key={message.id}><small style={{ fontWeight: 700, display: 'block', marginBottom: 3 }}>{senderLabel(message)}</small>{message.body}<span className="message-meta">{formatDateTime(message.created_at)}{message.status ? ` · ${message.status}` : ''}</span></div>)}</div>
            {!canEdit ? <div className="blocked"><span><strong>Acesso somente para consulta.</strong><br />Seu usuário não pode enviar mensagens ou assumir o atendimento.</span></div> : lead.ai_enabled ? <div className="blocked"><span><strong>A IA está atendendo este contato.</strong><br />Assuma a conversa antes de enviar uma mensagem humana.</span><button className="btn btn-primary btn-sm" onClick={() => void toggleAi(false)}>Assumir conversa</button></div> : !whatsappConnected ? <div className="blocked"><span><strong>WhatsApp ainda não conectado.</strong><br />Conecte o canal pela Meta para enviar e receber mensagens nesta tela.</span><button className="btn btn-ghost btn-sm" onClick={() => router.push('/configuracoes/whatsapp')}>Configurar</button></div> : <form className="composer" onSubmit={sendMessage}><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><button className="btn btn-primary" disabled={loading}>{loading ? 'Enviando…' : 'Enviar'}</button></form>}
          </div>}

          {tab === 'historico' && <div><div className="card-head"><h3>Todos os históricos do contato</h3></div><div className="card-body">{canEdit && <form onSubmit={addNote} style={{ marginBottom: 20 }}><div className="field"><label>Adicionar anotação comercial</label><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: cliente pediu retorno na sexta-feira; corretor está com proposta na unidade 1701…" /></div><button className="btn btn-secondary btn-sm" disabled={loading}>Salvar anotação</button></form>}<div className="timeline">{activities.length === 0 ? <div className="empty-state">Nenhum histórico registrado.</div> : activities.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-icon">•</div><div><div className="timeline-title">{item.title}</div>{item.description && <div className="timeline-desc">{item.description}</div>}<div className="timeline-time">{formatDateTime(item.created_at)}</div></div></div>)}</div></div></div>}

          {tab === 'dados' && <div><div className="card-head"><h3>Dados e qualificação</h3></div><div className="card-body grid grid-2"><div className="info-list"><div className="info-row"><span>Nome</span><strong>{lead.name}</strong></div><div className="info-row"><span>WhatsApp</span><strong>{displayPhone(lead.phone)}</strong></div><div className="info-row"><span>E-mail</span><strong>{lead.email || '—'}</strong></div><div className="info-row"><span>Etapa</span><strong>{stageLabel(lead.kind, lead.stage)}</strong></div><div className="info-row"><span>ID Kommo</span><strong>{lead.kommo_id || '—'}</strong></div></div><div className="info-list"><div className="info-row"><span>{lead.kind === 'cliente' ? 'Empreendimento' : 'Imobiliária'}</span><strong>{lead.kind === 'cliente' ? lead.enterprise || '—' : lead.company || '—'}</strong></div><div className="info-row"><span>{lead.kind === 'cliente' ? 'Origem' : 'Grupo'}</span><strong>{lead.kind === 'cliente' ? lead.source || '—' : lead.group_name || '—'}</strong></div><div className="info-row"><span>CRECI</span><strong>{lead.creci || '—'}</strong></div><div className="info-row"><span>Temperatura</span><strong>{lead.temperature}°</strong></div><div className="info-row"><span>Criado em</span><strong>{formatDateTime(lead.created_at)}</strong></div></div>{metaEntries.length > 0 && <div style={{ gridColumn: '1 / -1' }}><h4>Campos importados</h4><div className="table-wrap"><table><tbody>{metaEntries.map(([key, value]) => <tr key={key}><td className="faint">{key}</td><td>{String(value)}</td></tr>)}</tbody></table></div></div>}</div></div>}
        </section>

        <aside className="side-stack">
          <section className="card"><div className="card-head"><h3>Responsável</h3></div><div className="card-body">{lead.ai_enabled ? <div className="ai-state on"><strong>🤖 IA atendendo</strong><br />O envio humano está bloqueado para evitar mensagens duplicadas.</div> : <div className="ai-state off"><strong>👤 Comercial humano</strong><br />A IA está pausada para este contato.</div>}</div></section>
          <section className="card"><div className="card-head"><h3>Resumo</h3></div><div className="card-body info-list"><div className="info-row"><span>Tipo</span><strong>{lead.kind === 'cliente' ? 'Cliente final' : 'Corretor'}</strong></div><div className="info-row"><span>Etapa</span><strong>{stageLabel(lead.kind, lead.stage)}</strong></div><div className="info-row"><span>Mensagens</span><strong>{messages.filter((message) => message.direction !== 'system').length}</strong></div><div className="info-row"><span>Último contato</span><strong>{lastContact}</strong></div><div className="info-row"><span>WhatsApp</span><strong>{whatsappConnected ? 'Conectado' : 'Não conectado'}</strong></div></div></section>
        </aside>
      </div>
    </>
  );
}
