'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { displayPhone, normalizePhone } from '@/lib/format';
import { usePipelineLeadsFeed } from '@/lib/use-pipeline-leads-feed';
import type { Lead } from '@/lib/types';
import { GENERAL_STAGES } from '@/lib/stages';

function updatedAtTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function maxUpdatedAt(rows: Lead[]): string | null {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const time = updatedAtTime(row.updated_at);
    if (time > bestTime) {
      best = row.updated_at;
      bestTime = time;
    }
  }
  return best;
}

export function GeneralPipelineBoard({
  initialLeads,
  organizationId,
  canEdit,
}: {
  initialLeads: Lead[];
  organizationId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pipelineTarget, setPipelineTarget] = useState<'cliente' | 'corretor'>('cliente');
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const knownLeads = useRef(new Map(initialLeads.map((lead) => [lead.id, lead.updated_at])));
  const latestUpdatedAt = useRef(maxUpdatedAt(initialLeads));

  const applyLeads = useCallback((rows: Lead[]) => {
    const changed = rows.filter((lead) => knownLeads.current.get(lead.id) !== lead.updated_at);
    if (!changed.length) return;
    changed.forEach((lead) => knownLeads.current.set(lead.id, lead.updated_at));
    const newest = maxUpdatedAt(changed);
    if (newest && updatedAtTime(newest) > updatedAtTime(latestUpdatedAt.current)) latestUpdatedAt.current = newest;
    setLeads((current) => {
      const map = new Map(current.map((lead) => [lead.id, lead]));
      for (const lead of changed) {
        if (lead.archived_at || lead.kind !== 'geral') map.delete(lead.id);
        else map.set(lead.id, lead);
      }
      return [...map.values()];
    });
    setSelectedIds((current) => {
      const valid = new Set(current);
      for (const lead of rows) if (lead.archived_at || lead.kind !== 'geral') valid.delete(lead.id);
      return valid;
    });
  }, []);

  usePipelineLeadsFeed({
    organizationId,
    kind: 'geral',
    latestUpdatedAt: () => latestUpdatedAt.current,
    onLeads: applyLeads,
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return leads;
    return leads.filter((lead) => [lead.name, lead.phone, lead.email, lead.company, lead.source]
      .some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [leads, query]);

  function toggleSelectMode() {
    setSelectMode((value) => {
      if (value) setSelectedIds(new Set());
      return !value;
    });
    setError('');
    setNotice('');
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelectedIds(new Set(filtered.slice(0, 300).map((lead) => lead.id)));
  }

  async function transferSelected() {
    if (!canEdit || pipelineSaving || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const destination = pipelineTarget === 'cliente' ? 'Clientes' : 'Corretores';
    if (!window.confirm(`Transferir ${ids.length} ${ids.length === 1 ? 'contato' : 'contatos'} para o pipeline de ${destination}?`)) return;
    setPipelineSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/leads/bulk-kind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, kind: pipelineTarget }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; updated?: number; errors?: string[] };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível transferir os contatos.');
      setLeads((items) => items.filter((lead) => !selectedIds.has(lead.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      setNotice(payload.message || `${payload.updated || ids.length} contatos transferidos.`);
      if (payload.errors?.length) setError(`Alguns contatos não foram movidos: ${payload.errors.join(' | ')}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível transferir os contatos.');
    } finally {
      setPipelineSaving(false);
    }
  }

  async function moveLead(stage: string) {
    if (!canEdit || !dragId || selectMode) return;
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    const current = leads.find((lead) => lead.id === id);
    if (!current || current.stage === stage) return;

    const before = leads;
    setLeads((items) => items.map((lead) => lead.id === id ? {
      ...lead,
      stage,
      owner_mode: stage === 'encerrado' ? 'none' : 'human',
      ai_enabled: false,
      automation_paused: true,
    } : lead));

    const response = await fetch(`/api/leads/${id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (!response.ok) {
      setLeads(before);
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setError(payload.error || 'Não foi possível mover o contato.');
    } else {
      setError('');
      router.refresh();
    }
  }

  async function classify(lead: Lead, kind: 'cliente' | 'corretor') {
    if (!canEdit || classifyingId || selectMode) return;
    const label = kind === 'cliente' ? 'CLIENTE' : 'CORRETOR';
    if (!window.confirm(`Classificar “${lead.name}” como ${label}?`)) return;
    setClassifyingId(lead.id);
    setError('');
    try {
      const response = await fetch(`/api/leads/${lead.id}/kind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível classificar o contato.');
      setLeads((items) => items.filter((item) => item.id !== lead.id));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível classificar o contato.');
    } finally {
      setClassifyingId(null);
    }
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const phone = normalizePhone(form.get('phone'));
    const { data, error: insertError } = await supabase.from('leads').insert({
      organization_id: organizationId,
      kind: 'geral',
      name: String(form.get('name') || '').trim(),
      phone: phone || null,
      email: String(form.get('email') || '').trim() || null,
      company: String(form.get('company') || '').trim() || null,
      stage: 'novo_triagem',
      source: 'Cadastro manual',
      temperature: 0,
      ai_enabled: false,
      automation_paused: true,
      owner_mode: 'human',
      priority_class: null,
      metadata: { general_pipeline_reason: 'Cadastro manual' },
    }).select('*').single();
    if (insertError) setError(insertError.message);
    else {
      setLeads((items) => [data as Lead, ...items]);
      setShowNew(false);
      router.refresh();
    }
    setSaving(false);
  }

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const rows = filtered.map((lead) => ({
      Nome: lead.name,
      WhatsApp: displayPhone(lead.phone),
      Email: lead.email || '',
      Empresa: lead.company || '',
      Etapa: GENERAL_STAGES.find((stage) => stage.id === lead.stage)?.label || lead.stage,
      Origem: lead.source || '',
      'Última entrada': lead.last_inbound_at || '',
      'Criado em': lead.created_at,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Geral');
    XLSX.writeFile(workbook, `contatos-gerais-bossa-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return <>
    <div className="page-head">
      <div>
        <h2>Pipeline Geral</h2>
        <p>Números ainda não classificados. O Plantão pergunta primeiro se é corretor; clientes só são classificados manualmente pela equipe.</p>
      </div>
      <div className="page-actions">
        <input className="input" style={{ width: 250 }} placeholder="Buscar nome, número ou empresa…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => void exportXlsx()}>⬇ Exportar XLSX</button>
        {canEdit && <>
          <button className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleSelectMode}>{selectMode ? '✓ Selecionando' : '☑ Selecionar vários'}</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew((value) => !value)}>+ Novo contato</button>
        </>}
      </div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    {canEdit && selectMode && <section className="card" style={{ marginBottom: 15 }}>
      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong>{selectedIds.size} {selectedIds.size === 1 ? 'selecionado' : 'selecionados'}</strong>
        <button className="btn btn-ghost btn-sm" onClick={selectVisible}>Selecionar visíveis ({Math.min(filtered.length, 300)})</button>
        <button className="btn btn-ghost btn-sm" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set())}>Limpar</button>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Transferir para:</label>
        <select className="select" style={{ width: 180 }} value={pipelineTarget} onChange={(event) => setPipelineTarget(event.target.value as 'cliente' | 'corretor')}>
          <option value="cliente">Pipeline Clientes</option>
          <option value="corretor">Pipeline Corretores</option>
        </select>
        <button className="btn btn-primary btn-sm" disabled={pipelineSaving || selectedIds.size === 0} onClick={() => void transferSelected()}>{pipelineSaving ? 'Transferindo…' : `Transferir ${selectedIds.size}`}</button>
      </div>
    </section>}

    {canEdit && showNew && <section className="card" style={{ marginBottom: 15 }}>
      <div className="card-head"><h3>Novo contato geral</h3><button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>Fechar</button></div>
      <form className="card-body grid grid-4" onSubmit={createContact}>
        <div className="field"><label>Nome</label><input name="name" className="input" required /></div>
        <div className="field"><label>WhatsApp</label><input name="phone" className="input" placeholder="(47) 99999-9999" /></div>
        <div className="field"><label>E-mail</label><input name="email" type="email" className="input" /></div>
        <div className="field"><label>Empresa / identificação</label><input name="company" className="input" placeholder="Fornecedor, prestador, empresa…" /></div>
        <div><button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Cadastrar'}</button></div>
      </form>
    </section>}

    <div className="pipeline">
      {GENERAL_STAGES.map((stage) => {
        const stageLeads = filtered.filter((lead) => lead.stage === stage.id);
        return <section
          key={stage.id}
          className={`pipeline-column ${overStage === stage.id ? 'dragover' : ''}`}
          onDragOver={(event) => { if (!canEdit || selectMode) return; event.preventDefault(); setOverStage(stage.id); }}
          onDragLeave={() => setOverStage(null)}
          onDrop={(event) => { if (!canEdit || selectMode) return; event.preventDefault(); void moveLead(stage.id); }}
        >
          <div className="column-head"><span className="stage-dot" style={{ background: stage.color }} /><span className="stage-name">{stage.label}</span><span className="stage-count">{stageLeads.length}</span></div>
          <div className="column-body">
            {stageLeads.map((lead) => {
              const selected = selectedIds.has(lead.id);
              return <div key={lead.id} style={{ position: 'relative' }}>
                {selectMode && <label style={{ position: 'absolute', top: 10, right: 10, zIndex: 3, width: 24, height: 24, borderRadius: 7, background: '#fff', border: '1px solid #cfc8bf', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected} onChange={() => toggleSelection(lead.id)} style={{ width: 15, height: 15 }} />
                </label>}
                <div
                  className="lead-card"
                  style={selected ? { outline: '2px solid #1f6b52', background: '#f2f8f5' } : undefined}
                  draggable={canEdit && !selectMode}
                  onClick={() => { if (selectMode) toggleSelection(lead.id); }}
                  onDragStart={(event) => { if (selectMode) return; setDragId(lead.id); event.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragId(null); setOverStage(null); }}
                >
                  <Link href={`/leads/${lead.id}`} onClick={(event) => { if (selectMode) event.preventDefault(); }} style={{ color: 'inherit', textDecoration: 'none', display: 'block', paddingRight: selectMode ? 30 : 0 }}>
                    <div className="lead-name">{lead.name}</div>
                    <div className="lead-sub">{lead.company || 'Contato geral'}</div>
                    <div className="lead-meta">
                      <span className="chip">{lead.source || 'WhatsApp'}</span>
                      <span className="chip">👤 Aguardando classificação</span>
                    </div>
                    <div className="muted" style={{ fontSize: 10 }}>{displayPhone(lead.phone)}</div>
                  </Link>
                  {canEdit && !selectMode && <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 10 }} disabled={classifyingId === lead.id} onClick={() => void classify(lead, 'cliente')}>✓ Cliente</button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 10 }} disabled={classifyingId === lead.id} onClick={() => void classify(lead, 'corretor')}>🤝 Corretor</button>
                  </div>}
                </div>
              </div>;
            })}
            {stageLeads.length === 0 && <div className="empty-state">Nenhum contato</div>}
          </div>
        </section>;
      })}
    </div>
  </>;
}
