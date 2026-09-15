'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, LeadKind } from '@/lib/types';
import { defaultStage, isAiStage, isHumanStage, stagesFor } from '@/lib/stages';
import { displayPhone, normalizePhone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { usePipelineLeadsFeed } from '@/lib/use-pipeline-leads-feed';
import { metaAdSourceLabel, readMetaAdAttribution } from '@/lib/meta-ad-attribution';

function updatedAtTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function maxUpdatedAt(rows: Lead[]): string | null {
  let bestIso: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const time = updatedAtTime(row.updated_at);
    if (time > bestTime) {
      bestTime = time;
      bestIso = row.updated_at;
    }
  }
  return bestIso;
}

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
  const [showBulk, setShowBulk] = useState(false);
  const [bulkFromStage, setBulkFromStage] = useState('novo_triagem');
  const [bulkToStage, setBulkToStage] = useState('futuro');
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pipelineTarget, setPipelineTarget] = useState<LeadKind>(kind === 'corretor' ? 'cliente' : 'geral');
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
    if (newest && updatedAtTime(newest) > updatedAtTime(latestUpdatedAt.current)) {
      latestUpdatedAt.current = newest;
    }

    setLeads((current) => {
      const map = new Map(current.map((lead) => [lead.id, lead]));
      for (const lead of changed) {
        if (lead.archived_at || lead.kind !== kind) map.delete(lead.id);
        else map.set(lead.id, lead);
      }
      return [...map.values()];
    });
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const lead of rows) if (lead.archived_at || lead.kind !== kind) next.delete(lead.id);
      return next;
    });
  }, [kind]);

  usePipelineLeadsFeed({
    organizationId,
    kind,
    latestUpdatedAt: () => latestUpdatedAt.current,
    onLeads: applyLeads,
  });

  const stages = stagesFor(kind);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => [lead.name, lead.phone, lead.enterprise, lead.company, lead.source, metaAdSourceLabel(lead.metadata), lead.priority_class, lead.next_action]
      .some((value) => String(value ?? '').toLowerCase().includes(q)));
  }, [leads, query]);
  const bulkCount = leads.filter((lead) => lead.stage === bulkFromStage).length;
  const fromLabel = stages.find((stage) => stage.id === bulkFromStage)?.label ?? bulkFromStage;
  const toLabel = stages.find((stage) => stage.id === bulkToStage)?.label ?? bulkToStage;
  const transferTargets = kind === 'corretor'
    ? [{ id: 'cliente' as LeadKind, label: 'Pipeline Clientes' }, { id: 'geral' as LeadKind, label: 'Pipeline Geral' }]
    : [];

  function toggleSelectMode() {
    const next = !selectMode;
    setSelectMode(next);
    if (!next) setSelectedIds(new Set());
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
    if (kind === 'cliente') {
      setError('Clientes são protegidos: seguindo a regra do CRM, um cliente que já comprou não sai do pipeline de Clientes em massa.');
      return;
    }
    const ids = [...selectedIds];
    const targetLabel = transferTargets.find((item) => item.id === pipelineTarget)?.label || pipelineTarget;
    if (!window.confirm(`Transferir ${ids.length} ${ids.length === 1 ? 'contato' : 'contatos'} para ${targetLabel}?`)) return;
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
    if (!canEdit || selectMode) return;
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

  async function moveAllFromStage() {
    if (!canEdit || bulkSaving || bulkCount === 0) return;
    setError('');
    setNotice('');
    if (bulkFromStage === bulkToStage) {
      setError('Escolha etapas diferentes.');
      return;
    }
    const confirmed = window.confirm(`Mover ${bulkCount} ${bulkCount === 1 ? 'registro' : 'registros'} de “${fromLabel}” para “${toLabel}”?`);
    if (!confirmed) return;

    setBulkSaving(true);
    try {
      const response = await fetch('/api/leads/bulk-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, fromStage: bulkFromStage, toStage: bulkToStage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível movimentar os leads.');

      const ownerMode = isAiStage(bulkToStage) ? 'ai' : isHumanStage(bulkToStage) ? 'human' : 'none';
      setLeads((items) => items.map((lead) => lead.stage === bulkFromStage ? {
        ...lead,
        stage: bulkToStage,
        owner_mode: ownerMode,
        ai_enabled: isAiStage(bulkToStage) && !lead.opt_out && !lead.automation_paused,
        next_action: bulkToStage === 'futuro' ? 'Aguardar inclusão em campanha de reativação comercial.' : lead.next_action,
        next_action_due_at: bulkToStage === 'futuro' ? null : lead.next_action_due_at,
      } : lead));
      setNotice(payload.message || `${payload.updated || bulkCount} registros movimentados.`);
      setShowBulk(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível movimentar os leads.');
    } finally {
      setBulkSaving(false);
    }
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

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const rows = filtered.map((lead) => {
      const ad = readMetaAdAttribution(lead.metadata);
      return {
        Tipo: lead.kind === 'cliente' ? 'Cliente' : 'Corretor',
        Nome: lead.name,
        WhatsApp: displayPhone(lead.phone),
        Email: lead.email || '',
        Etapa: stages.find((stage) => stage.id === lead.stage)?.label || lead.stage,
        Origem: metaAdSourceLabel(lead.metadata) || lead.source || '',
        Empreendimento: lead.enterprise || '',
        Imobiliária: lead.company || '',
        CRECI: lead.creci || '',
        Score: lead.temperature,
        'ID do anúncio Meta': ad?.source_id || '',
        'URL do anúncio Meta': ad?.source_url || '',
        'Título do anúncio Meta': ad?.headline || '',
        'Texto do anúncio Meta': ad?.body || '',
        'Tipo da origem Meta': ad?.source_type || '',
        'Origem capturada em': ad?.captured_at || '',
        'Criado em': lead.created_at,
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, kind === 'cliente' ? 'Clientes' : 'Corretores');
    XLSX.writeFile(workbook, `${kind === 'cliente' ? 'clientes' : 'corretores'}-bossa-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{kind === 'cliente' ? 'Pipeline de Clientes' : 'Pipeline de Corretores'}</h2>
          <p>A IA lê as conversas, atualiza classificação e estado; o humano aceita a passagem e registra a próxima ação. O quadro atualiza sozinho conforme os leads mudam.</p>
        </div>
        <div className="page-actions">
          <input className="input" style={{ width: 230 }} placeholder="Buscar nome, ação, prioridade…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={() => void exportXlsx()}>⬇ Exportar XLSX</button>
          {canEdit && <>
            <button className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleSelectMode}>{selectMode ? '✓ Selecionando' : '☑ Selecionar vários'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk((value) => !value)}>⇄ Mover em massa</button>
            <Link className="btn btn-ghost btn-sm" href={`/importar?tipo=${kind}`}>📥 Importar XLSX</Link>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNew((value) => !value)}>+ {kind === 'cliente' ? 'Novo lead' : 'Novo corretor'}</button>
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
          {kind === 'corretor' ? <>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Transferir para:</label>
            <select className="select" style={{ width: 180 }} value={pipelineTarget} onChange={(event) => setPipelineTarget(event.target.value as LeadKind)}>
              {transferTargets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={pipelineSaving || selectedIds.size === 0} onClick={() => void transferSelected()}>{pipelineSaving ? 'Transferindo…' : `Transferir ${selectedIds.size}`}</button>
          </> : <div className="info-box" style={{ margin: 0, flexBasis: '100%' }}>Clientes já compradores permanecem protegidos e não saem deste pipeline em massa. A seleção múltipla fica disponível aqui sem quebrar essa regra.</div>}
        </div>
      </section>}

      {canEdit && showBulk && <section className="card" style={{ marginBottom: 15 }}>
        <div className="card-head"><h3>Movimentação em massa</h3><button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(false)}>Fechar</button></div>
        <div className="card-body">
          <div className="grid grid-3">
            <div className="field"><label>Etapa de origem</label><select className="select" value={bulkFromStage} onChange={(event) => setBulkFromStage(event.target.value)}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select></div>
            <div className="field"><label>Etapa de destino</label><select className="select" value={bulkToStage} onChange={(event) => setBulkToStage(event.target.value)}>{stages.filter((stage) => stage.id !== 'passagem_pendente').map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select></div>
            <div className="field"><label>Registros que serão movidos</label><div className="input" style={{ background: 'var(--bg)', fontWeight: 800 }}>{bulkCount} {bulkCount === 1 ? 'registro' : 'registros'}</div></div>
          </div>
          <div className="info-box">A ação considera todos os registros ativos da etapa de origem, mesmo que a busca da pipeline esteja filtrada. Cada ficha receberá um registro no histórico.</div>
          <button className="btn btn-primary" disabled={bulkSaving || bulkCount === 0 || bulkFromStage === bulkToStage} onClick={() => void moveAllFromStage()}>{bulkSaving ? 'Movendo…' : `Mover ${bulkCount} para ${toLabel}`}</button>
        </div>
      </section>}

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
        {stages.map((stage) => {
          const stageLeads = filtered.filter((lead) => lead.stage === stage.id);
          return <section key={stage.id} className={`pipeline-column ${overStage === stage.id ? 'dragover' : ''}`}
            onDragOver={(event) => { if (!canEdit || selectMode) return; event.preventDefault(); setOverStage(stage.id); }}
            onDragLeave={() => setOverStage(null)}
            onDrop={(event) => { if (!canEdit || selectMode) return; event.preventDefault(); void moveLead(stage.id); }}>
            <div className="column-head"><span className="stage-dot" style={{ background: stage.color }} /><span className="stage-name">{stage.label}</span><span className="stage-count">{stageLeads.length}</span></div>
            <div className="column-body">
              {stageLeads.map((lead) => {
                const due = dueLabel(lead.next_action_due_at);
                const overdue = Boolean(due?.startsWith('⚠️'));
                const readableSource = kind === 'cliente' ? metaAdSourceLabel(lead.metadata) || lead.source : lead.group_name;
                const selected = selectedIds.has(lead.id);
                return <div key={lead.id} style={{ position: 'relative' }}>
                  {selectMode && <label style={{ position: 'absolute', top: 10, right: 10, zIndex: 3, width: 24, height: 24, borderRadius: 7, background: '#fff', border: '1px solid #cfc8bf', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected} onChange={() => toggleSelection(lead.id)} style={{ width: 15, height: 15 }} />
                  </label>}
                  <Link href={`/leads/${lead.id}`} className="lead-card" draggable={canEdit && !selectMode}
                    style={selected ? { outline: '2px solid #1f6b52', background: '#f2f8f5', paddingRight: selectMode ? 42 : undefined } : selectMode ? { paddingRight: 42 } : undefined}
                    onClick={(event) => { if (selectMode) { event.preventDefault(); toggleSelection(lead.id); } }}
                    onDragStart={(event) => { if (selectMode) return; setDragId(lead.id); event.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div className="lead-name">{lead.name}</div>
                      {lead.priority_class && <span className={`chip ${lead.priority_class === 'A1' ? 'chip-orange' : ''}`}>{lead.priority_class}</span>}
                    </div>
                    <div className="lead-sub">{kind === 'cliente' ? lead.enterprise || 'Empreendimento não informado' : lead.company || 'Autônomo'}</div>
                    <div className="lead-meta">
                      <span className="chip">{readableSource || (kind === 'cliente' ? 'Sem origem' : 'Sem grupo')}</span>
                      <span className={`chip ${lead.owner_mode === 'human' ? '' : 'chip-orange'}`}>{lead.owner_mode === 'human' ? '👤 Humano' : lead.owner_mode === 'none' ? 'Encerrado' : `🤖 ${kind === 'cliente' ? 'Nara' : 'Plantão'}`}</span>
                      {lead.ai_classification && <span className="chip">{lead.ai_classification}</span>}
                    </div>
                    {lead.next_action && <div className="muted" style={{ fontSize: 10, marginBottom: 5 }}><strong>Próxima:</strong> {lead.next_action}</div>}
                    {due && <div style={{ fontSize: 10, marginBottom: 7, fontWeight: 700, color: overdue ? 'var(--red)' : 'var(--ink-soft)' }}>{due}</div>}
                    <div className="muted" style={{ fontSize: 10, marginBottom: 7 }}>{displayPhone(lead.phone)}</div>
                    <div className="temp-row"><div className="temp-track"><div className="temp-fill" style={{ width: `${lead.temperature}%`, background: temperatureColor(lead.temperature) }} /></div><span className="temp-label" style={{ color: temperatureColor(lead.temperature) }}>{lead.ai_classification?.toUpperCase() || temperatureName(lead.temperature)} {lead.temperature}/100</span></div>
                  </Link>
                </div>;
              })}
              {stageLeads.length === 0 && <div className="empty-state">Nenhum registro</div>}
            </div>
          </section>;
        })}
      </div>
    </>
  );
}
