'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, LeadKind } from '@/lib/types';
import { defaultStage, isAiStage, isHumanStage, stagesFor } from '@/lib/stages';
import { displayPhone, normalizePhone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';

function temperatureColor(value: number) {
  if (value >= 75) return 'var(--red)';
  if (value >= 40) return 'var(--amber)';
  return 'var(--bluegray)';
}

function temperatureName(value: number) {
  if (value >= 75) return 'QUENTE';
  if (value >= 40) return 'MORNO';
  return 'FRIO';
}

function dueLabel(value?: string | null) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  const minutes = Math.round((due.getTime() - Date.now()) / 60_000);
  if (minutes < 0) return `⚠️ vencida há ${Math.abs(minutes) < 60 ? `${Math.abs(minutes)} min` : `${Math.ceil(Math.abs(minutes) / 60)} h`}`;
  if (minutes < 60) return `⏱️ ${minutes} min`;
  if (minutes < 48 * 60) return `⏱️ ${Math.ceil(minutes / 60)} h`;
  return `📅 ${due.toLocaleDateString('pt-BR')}`;
}

export function PipelineBoard({ initialLeads, kind, organizationId, canEdit }: { initialLeads: Lead[]; kind: LeadKind; organizationId: string; canEdit: boolean }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => [lead.name, lead.phone, lead.enterprise, lead.company, lead.source, lead.priority_class, lead.next_action]
      .some((value) => String(value ?? '').toLowerCase().includes(q)));
  }, [leads, query]);

  async function moveLead(stage: string) {
    if (!canEdit) return;
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    if (!id) return;
    const current = leads.find((lead) => lead.id === id);
    if (!current || current.stage === stage) return;

    const before = leads;
    const optimisticOwnerMode = isAiStage(stage) ? 'ai' : isHumanStage(stage) ? 'human' : 'none';
    setLeads((items) => items.map((lead) => lead.id === id ? {
      ...lead,
      stage,
      owner_mode: optimisticOwnerMode,
      ai_enabled: isAiStage(stage) && !lead.opt_out && !lead.automation_paused,
    } : lead));
    const response = await fetch(`/api/leads/${id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (!response.ok) {
      setLeads(before);
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || 'Não foi possível mover o lead. Execute primeiro a migração SQL do sistema híbrido.');
    } else router.refresh();
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const phone = normalizePhone(form.get('phone'));
    const supabase = createClient();
    const payload = {
      organization_id: organizationId,
      kind,
      name,
      phone: phone || null,
      email: String(form.get('email') || '').trim() || null,
      stage: defaultStage(kind),
      source: kind === 'cliente' ? String(form.get('source') || '').trim() || 'Cadastro manual' : 'Cadastro manual',
      enterprise: kind === 'cliente' ? String(form.get('enterprise') || '').trim() || null : null,
      company: kind === 'corretor' ? String(form.get('company') || '').trim() || 'Autônomo' : null,
      group_name: kind === 'corretor' ? String(form.get('group_name') || '').trim() || 'Novos cadastros' : null,
      temperature: 0,
      ai_enabled: true,
      owner_mode: 'ai',
      priority_class: null,
      metadata: {},
    };
    const { data, error: insertError } = await supabase.from('leads').insert(payload).select('*').single();
    if (insertError) setError(insertError.message);
    else {
      setLeads((items) => [data as Lead, ...items]);
      setShowNew(false);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{kind === 'cliente' ? 'Pipeline de Clientes' : 'Pipeline de Corretores'}</h2>
          <p>A IA lê as conversas, atualiza classificação e estado; o humano aceita a passagem e registra a próxima ação.</p>
        </div>
        <div className="page-actions">
          <input className="input" style={{ width: 230 }} placeholder="Buscar nome, ação, prioridade…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {canEdit && <>
            <Link className="btn btn-ghost btn-sm" href={`/importar?tipo=${kind}`}>📥 Importar XLSX</Link>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNew((value) => !value)}>+ {kind === 'cliente' ? 'Novo lead' : 'Novo corretor'}</button>
          </>}
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {canEdit && showNew && <section className="card" style={{ marginBottom: 15 }}>
        <div className="card-head"><h3>Cadastro manual</h3><button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>Fechar</button></div>
        <form className="card-body grid grid-3" onSubmit={createLead}>
          <div className="field"><label>Nome</label><input name="name" className="input" required /></div>
          <div className="field"><label>WhatsApp</label><input name="phone" className="input" placeholder="(47) 99999-9999" /></div>
          <div className="field"><label>E-mail</label><input name="email" type="email" className="input" /></div>
          {kind === 'cliente'
            ? <><div className="field"><label>Empreendimento</label><input name="enterprise" className="input" placeholder="Flow / Alma / Soul" /></div><div className="field"><label>Origem</label><input name="source" className="input" placeholder="Meta Ads, Google, indicação…" /></div></>
            : <><div className="field"><label>Imobiliária</label><input name="company" className="input" /></div><div className="field"><label>Grupo</label><input name="group_name" className="input" /></div></>}
          <div style={{ alignSelf: 'end' }}><button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Salvando…' : 'Cadastrar'}</button></div>
        </form>
      </section>}

      <div className="pipeline">
        {stagesFor(kind).map((stage) => {
          const stageLeads = filtered.filter((lead) => lead.stage === stage.id);
          return <section key={stage.id} className={`pipeline-column ${overStage === stage.id ? 'dragover' : ''}`}
            onDragOver={(event) => { if (!canEdit) return; event.preventDefault(); setOverStage(stage.id); }}
            onDragLeave={() => setOverStage(null)}
            onDrop={(event) => { if (!canEdit) return; event.preventDefault(); void moveLead(stage.id); }}>
            <div className="column-head"><span className="stage-dot" style={{ background: stage.color }} /><span className="stage-name">{stage.label}</span><span className="stage-count">{stageLeads.length}</span></div>
            <div className="column-body">
              {stageLeads.map((lead) => {
                const due = dueLabel(lead.next_action_due_at);
                const overdue = Boolean(due?.startsWith('⚠️'));
                return <Link href={`/leads/${lead.id}`} key={lead.id} className="lead-card" draggable={canEdit}
                  onDragStart={(event) => { setDragId(lead.id); event.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragId(null); setOverStage(null); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div className="lead-name">{lead.name}</div>
                    {lead.priority_class && <span className={`chip ${lead.priority_class === 'A1' ? 'chip-orange' : ''}`}>{lead.priority_class}</span>}
                  </div>
                  <div className="lead-sub">{kind === 'cliente' ? lead.enterprise || 'Empreendimento não informado' : lead.company || 'Autônomo'}</div>
                  <div className="lead-meta">
                    <span className="chip">{kind === 'cliente' ? lead.source || 'Sem origem' : lead.group_name || 'Sem grupo'}</span>
                    <span className={`chip ${lead.owner_mode === 'human' ? '' : 'chip-orange'}`}>{lead.owner_mode === 'human' ? '👤 Humano' : lead.owner_mode === 'none' ? 'Encerrado' : `🤖 ${kind === 'cliente' ? 'Nara' : 'Plantão'}`}</span>
                    {lead.ai_classification && <span className="chip">{lead.ai_classification}</span>}
                  </div>
                  {lead.next_action && <div className="muted" style={{ fontSize: 10, marginBottom: 5 }}><strong>Próxima:</strong> {lead.next_action}</div>}
                  {due && <div style={{ fontSize: 10, marginBottom: 7, fontWeight: 700, color: overdue ? 'var(--red)' : 'var(--ink-soft)' }}>{due}</div>}
                  <div className="muted" style={{ fontSize: 10, marginBottom: 7 }}>{displayPhone(lead.phone)}</div>
                  <div className="temp-row"><div className="temp-track"><div className="temp-fill" style={{ width: `${lead.temperature}%`, background: temperatureColor(lead.temperature) }} /></div><span className="temp-label" style={{ color: temperatureColor(lead.temperature) }}>{lead.ai_classification?.toUpperCase() || temperatureName(lead.temperature)} {lead.temperature}/100</span></div>
                </Link>;
              })}
              {stageLeads.length === 0 && <div className="empty-state">Nenhum registro</div>}
            </div>
          </section>;
        })}
      </div>
    </>
  );
}
