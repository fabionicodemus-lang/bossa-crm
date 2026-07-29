'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type DevelopmentStatus = 'planejamento' | 'lancamento' | 'em_construcao' | 'entregue' | 'pausado' | 'arquivado' | 'ativo';
type UnitStatus = 'disponivel' | 'reservado' | 'vendido' | 'oculto' | 'bloqueado';
type Tab = 'cadastro' | 'tipologias' | 'tabela' | 'arquivos';

export type Development = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  slug: string;
  status: DevelopmentStatus;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  description: string | null;
  launch_date: string | null;
  delivery_date: string | null;
  total_units: number | null;
  default_payment_plan: Record<string, unknown>;
  metadata: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DevelopmentTypology = {
  id: string;
  organization_id: string;
  development_id: string;
  code: string;
  name: string;
  private_area_m2: number | null;
  bedrooms: number | null;
  suites: number | null;
  parking_spaces: number | null;
  description: string | null;
  active: boolean;
};

export type DevelopmentUnit = {
  id: string;
  organization_id: string;
  development_id: string;
  typology_id: string | null;
  unit_code: string;
  floor: number | null;
  status: UnitStatus;
  private_area_m2: number | null;
  list_price: number;
  entry_amount: number;
  installment_count: number;
  installment_amount: number;
  reinforcement_count: number;
  reinforcement_amount: number;
  keys_amount: number;
  payment_plan: Record<string, unknown>;
  price_updated_at: string;
  notes: string | null;
};

export type DevelopmentFile = {
  id: string;
  organization_id: string;
  development_id: string;
  category: string;
  title: string;
  description: string | null;
  storage_bucket: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  active: boolean;
  created_at: string;
};

const statusLabels: Record<DevelopmentStatus, string> = {
  planejamento: 'Planejamento',
  lancamento: 'Lançamento',
  em_construcao: 'Em construção',
  entregue: 'Entregue',
  pausado: 'Pausado',
  arquivado: 'Arquivado',
  ativo: 'Ativo',
};

const unitStatusLabels: Record<UnitStatus, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservada',
  vendido: 'Vendida',
  oculto: 'Oculta',
  bloqueado: 'Bloqueada',
};

const fileCategories = [
  ['book', 'Book de vendas'],
  ['tabela', 'Tabela de vendas'],
  ['planta', 'Planta'],
  ['imagem', 'Imagem'],
  ['video', 'Vídeo'],
  ['memorial', 'Memorial'],
  ['contrato', 'Contrato'],
  ['obra', 'Obra'],
  ['outros', 'Outros'],
] as const;

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function planNumber(plan: Record<string, unknown> | null | undefined, key: string): number {
  return numberValue(plan?.[key]);
}

function planText(plan: Record<string, unknown> | null | undefined, key: string): string {
  return typeof plan?.[key] === 'string' ? String(plan[key]) : '';
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function safeFilename(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? 'Erro inesperado.');
  return 'Erro inesperado.';
}

function unitSort(a: DevelopmentUnit, b: DevelopmentUnit) {
  return (b.floor ?? 0) - (a.floor ?? 0) || a.unit_code.localeCompare(b.unit_code, 'pt-BR', { numeric: true });
}

export function DevelopmentsManager({
  organizationId,
  canEdit,
  initialDevelopments,
  initialTypologies,
  initialUnits,
  initialFiles,
}: {
  organizationId: string;
  canEdit: boolean;
  initialDevelopments: Development[];
  initialTypologies: DevelopmentTypology[];
  initialUnits: DevelopmentUnit[];
  initialFiles: DevelopmentFile[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [developments, setDevelopments] = useState(initialDevelopments);
  const [typologies, setTypologies] = useState(initialTypologies);
  const [units, setUnits] = useState(initialUnits);
  const [files, setFiles] = useState(initialFiles);
  const [selectedId, setSelectedId] = useState(initialDevelopments[0]?.id ?? '');
  const [tab, setTab] = useState<Tab>('cadastro');
  const [showNewDevelopment, setShowNewDevelopment] = useState(initialDevelopments.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileCategory, setFileCategory] = useState('book');
  const [fileDescription, setFileDescription] = useState('');

  const selected = developments.find((item) => item.id === selectedId) ?? null;
  const selectedTypologies = typologies.filter((item) => item.development_id === selectedId && item.active);
  const selectedUnits = units.filter((item) => item.development_id === selectedId).sort(unitSort);
  const selectedFiles = files.filter((item) => item.development_id === selectedId && item.active);

  const availableUnits = selectedUnits.filter((item) => item.status === 'disponivel');
  const reservedUnits = selectedUnits.filter((item) => item.status === 'reservado');
  const stockValue = availableUnits.reduce((sum, item) => sum + numberValue(item.list_price), 0);

  useEffect(() => {
    if (!selectedId && developments[0]) setSelectedId(developments[0].id);
  }, [developments, selectedId]);

  function clearMessages() {
    setError('');
    setNotice('');
  }

  async function saveDevelopment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    clearMessages();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    if (!name) {
      setError('Informe o nome do empreendimento.');
      setSaving(false);
      return;
    }
    const payload = {
      organization_id: organizationId,
      name,
      code: String(form.get('code') ?? '').trim() || null,
      slug: selected && !showNewDevelopment ? selected.slug : slugify(name),
      status: String(form.get('status') ?? 'ativo') as DevelopmentStatus,
      city: String(form.get('city') ?? '').trim() || null,
      neighborhood: String(form.get('neighborhood') ?? '').trim() || null,
      address: String(form.get('address') ?? '').trim() || null,
      description: String(form.get('description') ?? '').trim() || null,
      launch_date: String(form.get('launch_date') ?? '').trim() || null,
      delivery_date: String(form.get('delivery_date') ?? '').trim() || null,
      total_units: nullableNumber(form.get('total_units')),
      default_payment_plan: {
        ...((selected && !showNewDevelopment ? selected.default_payment_plan : {}) || {}),
        currency: 'BRL',
        entry_percent: numberValue(form.get('entry_percent')),
        installment_count: numberValue(form.get('default_installment_count')),
        reinforcement_count: numberValue(form.get('default_reinforcement_count')),
        keys_percent: numberValue(form.get('keys_percent')),
        correction_index: String(form.get('correction_index') ?? '').trim() || null,
        monthly_interest_percent: numberValue(form.get('monthly_interest_percent')),
      },
      active: true,
    };

    try {
      if (selected && !showNewDevelopment) {
        const { data, error: updateError } = await supabase.from('developments')
          .update(payload).eq('id', selected.id).eq('organization_id', organizationId)
          .select('*').single();
        if (updateError) throw updateError;
        setDevelopments((current) => current.map((item) => item.id === data.id ? data as Development : item));
        setNotice('Empreendimento atualizado.');
      } else {
        const { data, error: insertError } = await supabase.from('developments')
          .insert(payload).select('*').single();
        if (insertError) throw insertError;
        setDevelopments((current) => [...current, data as Development].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedId(data.id);
        setShowNewDevelopment(false);
        setNotice('Empreendimento cadastrado.');
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function addTypology(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !selected) return;
    setSaving(true);
    clearMessages();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      organization_id: organizationId,
      development_id: selected.id,
      code: String(form.get('code') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      private_area_m2: nullableNumber(form.get('private_area_m2')),
      bedrooms: nullableNumber(form.get('bedrooms')),
      suites: nullableNumber(form.get('suites')),
      parking_spaces: nullableNumber(form.get('parking_spaces')),
      description: String(form.get('description') ?? '').trim() || null,
      active: true,
    };
    if (!payload.code || !payload.name) {
      setError('Informe código e nome da tipologia.');
      setSaving(false);
      return;
    }
    try {
      const { data, error: insertError } = await supabase.from('development_typologies')
        .insert(payload).select('*').single();
      if (insertError) throw insertError;
      setTypologies((current) => [...current, data as DevelopmentTypology]);
      formElement.reset();
      setNotice('Tipologia cadastrada.');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function addUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !selected) return;
    setSaving(true);
    clearMessages();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const typologyId = String(form.get('typology_id') ?? '') || null;
    const typology = selectedTypologies.find((item) => item.id === typologyId);
    const payload = {
      organization_id: organizationId,
      development_id: selected.id,
      typology_id: typologyId,
      unit_code: String(form.get('unit_code') ?? '').trim(),
      floor: nullableNumber(form.get('floor')),
      status: String(form.get('status') ?? 'disponivel') as UnitStatus,
      private_area_m2: nullableNumber(form.get('private_area_m2')) ?? typology?.private_area_m2 ?? null,
      list_price: numberValue(form.get('list_price')),
      entry_amount: numberValue(form.get('entry_amount')),
      installment_count: numberValue(form.get('installment_count')),
      installment_amount: numberValue(form.get('installment_amount')),
      reinforcement_count: numberValue(form.get('reinforcement_count')),
      reinforcement_amount: numberValue(form.get('reinforcement_amount')),
      keys_amount: numberValue(form.get('keys_amount')),
      notes: String(form.get('notes') ?? '').trim() || null,
      payment_plan: {},
      metadata: {},
    };
    if (!payload.unit_code) {
      setError('Informe o número da unidade.');
      setSaving(false);
      return;
    }
    try {
      const { data, error: insertError } = await supabase.from('development_units')
        .insert(payload).select('*').single();
      if (insertError) throw insertError;
      setUnits((current) => [...current, data as DevelopmentUnit]);
      formElement.reset();
      setNotice('Unidade cadastrada.');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveUnit(item: DevelopmentUnit, patch: Partial<DevelopmentUnit>) {
    if (!canEdit) return;
    clearMessages();
    const payload = {
      status: patch.status ?? item.status,
      typology_id: patch.typology_id ?? item.typology_id,
      private_area_m2: nullableNumber(patch.private_area_m2 ?? item.private_area_m2),
      list_price: numberValue(patch.list_price ?? item.list_price),
      entry_amount: numberValue(patch.entry_amount ?? item.entry_amount),
      installment_count: numberValue(patch.installment_count ?? item.installment_count),
      installment_amount: numberValue(patch.installment_amount ?? item.installment_amount),
      reinforcement_count: numberValue(patch.reinforcement_count ?? item.reinforcement_count),
      reinforcement_amount: numberValue(patch.reinforcement_amount ?? item.reinforcement_amount),
      keys_amount: numberValue(patch.keys_amount ?? item.keys_amount),
      notes: patch.notes ?? item.notes,
    };
    const { data, error: updateError } = await supabase.from('development_units')
      .update(payload).eq('id', item.id).eq('organization_id', organizationId)
      .select('*').single();
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setUnits((current) => current.map((row) => row.id === item.id ? data as DevelopmentUnit : row));
    setNotice(`Unidade ${item.unit_code} atualizada.`);
  }

  async function applyAdjustment() {
    if (!canEdit || !selected) return;
    const percentage = numberValue(adjustment.replace(',', '.'));
    if (!percentage || percentage <= -100) {
      setError('Informe um percentual válido. Ex.: 3,5.');
      return;
    }
    if (!window.confirm(`Aplicar reajuste de ${percentage}% em todas as unidades disponíveis e reservadas do ${selected.name}?`)) return;
    setSaving(true);
    clearMessages();
    try {
      const { data, error: rpcError } = await supabase.rpc('adjust_development_prices', {
        target_development_id: selected.id,
        percentage,
        adjustment_reason: adjustmentReason.trim() || `Reajuste geral de ${percentage}%`,
      });
      if (rpcError) throw rpcError;
      const changed = (data ?? []) as DevelopmentUnit[];
      const map = new Map(changed.map((item) => [item.id, item]));
      setUnits((current) => current.map((item) => map.get(item.id) ?? item));
      setAdjustment('');
      setAdjustmentReason('');
      setNotice(`${changed.length} unidades reajustadas em ${percentage}%.`);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !selected || !selectedFile) return;
    setSaving(true);
    clearMessages();
    try {
      if (selectedFile.size > 100 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 100 MB.');
      if (!fileTitle.trim()) throw new Error('Informe o título do arquivo.');
      const path = `${organizationId}/${selected.id}/${crypto.randomUUID()}-${safeFilename(selectedFile.name)}`;
      const { error: uploadError } = await supabase.storage.from('development-files').upload(path, selectedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: selectedFile.type || undefined,
      });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await supabase.from('development_files').insert({
        organization_id: organizationId,
        development_id: selected.id,
        category: fileCategory,
        title: fileTitle.trim(),
        description: fileDescription.trim() || null,
        storage_bucket: 'development-files',
        storage_path: path,
        original_name: selectedFile.name,
        mime_type: selectedFile.type || null,
        size_bytes: selectedFile.size,
        active: true,
      }).select('*').single();
      if (insertError) {
        await supabase.storage.from('development-files').remove([path]);
        throw insertError;
      }
      setFiles((current) => [data as DevelopmentFile, ...current]);
      setSelectedFile(null);
      setFileTitle('');
      setFileDescription('');
      const input = document.getElementById('development-file-input') as HTMLInputElement | null;
      if (input) input.value = '';
      setNotice('Arquivo adicionado ao empreendimento.');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function previewFile(item: DevelopmentFile) {
    clearMessages();
    const { data, error: signedError } = await supabase.storage.from(item.storage_bucket).createSignedUrl(item.storage_path, 600);
    if (signedError) {
      setError(signedError.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function removeFile(item: DevelopmentFile) {
    if (!canEdit || !window.confirm(`Excluir “${item.title}”?`)) return;
    clearMessages();
    const { error: storageError } = await supabase.storage.from(item.storage_bucket).remove([item.storage_path]);
    if (storageError) {
      setError(storageError.message);
      return;
    }
    const { error: deleteError } = await supabase.from('development_files')
      .delete().eq('id', item.id).eq('organization_id', organizationId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setFiles((current) => current.filter((row) => row.id !== item.id));
  }

  return <div className="page-content">
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    <div className="page-head">
      <div><h2>Empreendimentos</h2><p>Cadastro comercial, tipologias, materiais e estoque de unidades.</p></div>
      {canEdit && <button className="btn btn-primary btn-sm" onClick={() => { setShowNewDevelopment(true); setTab('cadastro'); clearMessages(); }}>+ Novo empreendimento</button>}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '290px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <aside className="card" style={{ position: 'sticky', top: 88 }}>
        <div className="card-head"><h3>Portfólio</h3><span className="chip">{developments.length}</span></div>
        <div className="card-body" style={{ display: 'grid', gap: 9 }}>
          {developments.map((item) => {
            const itemUnits = units.filter((unit) => unit.development_id === item.id);
            const available = itemUnits.filter((unit) => unit.status === 'disponivel').length;
            return <button key={item.id} type="button" className="btn btn-ghost" onClick={() => { setSelectedId(item.id); setShowNewDevelopment(false); clearMessages(); }}
              style={{ justifyContent: 'flex-start', textAlign: 'left', background: item.id === selectedId && !showNewDevelopment ? 'var(--orange-soft)' : '#fff', color: item.id === selectedId && !showNewDevelopment ? 'var(--orange)' : undefined }}>
              <span style={{ fontSize: 20 }}>🏢</span>
              <span><strong style={{ display: 'block' }}>{item.name}</strong><small>{available} disponíveis · {itemUnits.length} unidades</small></span>
            </button>;
          })}
          {developments.length === 0 && <div className="empty-state">Cadastre o primeiro empreendimento.</div>}
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        {(selected || showNewDevelopment) && <section className="detail-top">
          <div className="profile-head">
            <div className="profile-avatar">🏢</div>
            <div>
              <div className="profile-name">{showNewDevelopment ? 'Novo empreendimento' : selected?.name}</div>
              {!showNewDevelopment && selected && <div className="profile-meta">{statusLabels[selected.status]} · {[selected.neighborhood, selected.city].filter(Boolean).join(', ') || 'Localização não informada'}</div>}
            </div>
            {!showNewDevelopment && selected && <div className="profile-actions"><span className="chip chip-green">{availableUnits.length} disponíveis</span><span className="chip">{reservedUnits.length} reservadas</span><span className="chip">{money.format(stockValue)}</span></div>}
          </div>
          {!showNewDevelopment && <div className="tabs">
            {([
              ['cadastro', '🏢 Cadastro'],
              ['tipologias', `📐 Tipologias (${selectedTypologies.length})`],
              ['tabela', `📊 Tabela de vendas (${selectedUnits.length})`],
              ['arquivos', `🗂️ Arquivos (${selectedFiles.length})`],
            ] as Array<[Tab, string]>).map(([value, label]) => <button key={value} className={`tab ${tab === value ? 'on' : ''}`} onClick={() => setTab(value)}>{label}</button>)}
          </div>}
        </section>}

        {(tab === 'cadastro' || showNewDevelopment) && <section className="card">
          <div className="card-head"><h3>{showNewDevelopment ? 'Cadastrar empreendimento' : 'Informações do empreendimento'}</h3></div>
          <form className="card-body" onSubmit={saveDevelopment} key={showNewDevelopment ? 'new' : selected?.id}>
            <div className="grid grid-3">
              <div className="field"><label>Nome</label><input className="input" name="name" required defaultValue={showNewDevelopment ? '' : selected?.name} disabled={!canEdit} /></div>
              <div className="field"><label>Código</label><input className="input" name="code" defaultValue={showNewDevelopment ? '' : selected?.code ?? ''} placeholder="ALMA" disabled={!canEdit} /></div>
              <div className="field"><label>Status</label><select className="select" name="status" defaultValue={showNewDevelopment ? 'planejamento' : selected?.status} disabled={!canEdit}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="field"><label>Cidade</label><input className="input" name="city" defaultValue={showNewDevelopment ? '' : selected?.city ?? ''} disabled={!canEdit} /></div>
              <div className="field"><label>Bairro</label><input className="input" name="neighborhood" defaultValue={showNewDevelopment ? '' : selected?.neighborhood ?? ''} disabled={!canEdit} /></div>
              <div className="field"><label>Total de unidades</label><input className="input" type="number" name="total_units" defaultValue={showNewDevelopment ? '' : selected?.total_units ?? ''} disabled={!canEdit} /></div>
              <div className="field"><label>Lançamento</label><input className="input" type="date" name="launch_date" defaultValue={showNewDevelopment ? '' : selected?.launch_date ?? ''} disabled={!canEdit} /></div>
              <div className="field"><label>Entrega</label><input className="input" type="date" name="delivery_date" defaultValue={showNewDevelopment ? '' : selected?.delivery_date ?? ''} disabled={!canEdit} /></div>
              <div className="field"><label>Endereço</label><input className="input" name="address" defaultValue={showNewDevelopment ? '' : selected?.address ?? ''} disabled={!canEdit} /></div>
            </div>
            <div className="field"><label>Descrição comercial</label><textarea className="textarea" name="description" defaultValue={showNewDevelopment ? '' : selected?.description ?? ''} disabled={!canEdit} /></div>
            <div className="card" style={{ boxShadow: 'none', marginBottom: 16 }}>
              <div className="card-head"><h3>Condição comercial padrão</h3><span className="chip">Base da futura simulação</span></div>
              <div className="card-body grid grid-3">
                <div className="field"><label>Entrada padrão (%)</label><input className="input" type="number" step="0.01" name="entry_percent" defaultValue={showNewDevelopment ? '' : planNumber(selected?.default_payment_plan, 'entry_percent')} disabled={!canEdit} /></div>
                <div className="field"><label>Quantidade de parcelas</label><input className="input" type="number" name="default_installment_count" defaultValue={showNewDevelopment ? '' : planNumber(selected?.default_payment_plan, 'installment_count')} disabled={!canEdit} /></div>
                <div className="field"><label>Quantidade de reforços</label><input className="input" type="number" name="default_reinforcement_count" defaultValue={showNewDevelopment ? '' : planNumber(selected?.default_payment_plan, 'reinforcement_count')} disabled={!canEdit} /></div>
                <div className="field"><label>Chaves padrão (%)</label><input className="input" type="number" step="0.01" name="keys_percent" defaultValue={showNewDevelopment ? '' : planNumber(selected?.default_payment_plan, 'keys_percent')} disabled={!canEdit} /></div>
                <div className="field"><label>Índice de correção</label><input className="input" name="correction_index" placeholder="Ex.: CUB/SC ou IPCA" defaultValue={showNewDevelopment ? '' : planText(selected?.default_payment_plan, 'correction_index')} disabled={!canEdit} /></div>
                <div className="field"><label>Juros mensais após chaves (%)</label><input className="input" type="number" step="0.001" name="monthly_interest_percent" defaultValue={showNewDevelopment ? '' : planNumber(selected?.default_payment_plan, 'monthly_interest_percent')} disabled={!canEdit} /></div>
              </div>
            </div>
            {canEdit && <div className="page-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar empreendimento'}</button>{showNewDevelopment && developments.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => setShowNewDevelopment(false)}>Cancelar</button>}</div>}
          </form>
        </section>}

        {!showNewDevelopment && selected && tab === 'tipologias' && <div className="grid grid-2">
          <section className="card">
            <div className="card-head"><h3>Tipologias cadastradas</h3></div>
            <div className="card-body">
              <div className="info-list">
                {selectedTypologies.map((item) => <div className="info-row" key={item.id}><span><strong>{item.name}</strong><br /><small>{item.code} · {item.private_area_m2 ? `${decimal.format(item.private_area_m2)} m²` : 'área não informada'}</small></span><strong>{item.suites ? `${item.suites} suítes` : item.bedrooms ? `${item.bedrooms} quartos` : '—'}</strong></div>)}
                {selectedTypologies.length === 0 && <div className="empty-state">Nenhuma tipologia cadastrada.</div>}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Adicionar tipologia</h3></div>
            <form className="card-body" onSubmit={addTypology}>
              <div className="grid grid-2"><div className="field"><label>Código</label><input className="input" name="code" placeholder="01" required disabled={!canEdit} /></div><div className="field"><label>Nome</label><input className="input" name="name" placeholder="Tipo 01" required disabled={!canEdit} /></div></div>
              <div className="grid grid-4"><div className="field"><label>Área privativa</label><input className="input" name="private_area_m2" type="number" step="0.01" disabled={!canEdit} /></div><div className="field"><label>Quartos</label><input className="input" name="bedrooms" type="number" disabled={!canEdit} /></div><div className="field"><label>Suítes</label><input className="input" name="suites" type="number" disabled={!canEdit} /></div><div className="field"><label>Vagas</label><input className="input" name="parking_spaces" type="number" disabled={!canEdit} /></div></div>
              <div className="field"><label>Descrição</label><textarea className="textarea" name="description" disabled={!canEdit} /></div>
              {canEdit && <button className="btn btn-primary" disabled={saving}>Adicionar tipologia</button>}
            </form>
          </section>
        </div>}

        {!showNewDevelopment && selected && tab === 'tabela' && <>
          <div className="kpis">
            <div className="kpi"><div className="kpi-label">Disponíveis</div><div className="kpi-value">{availableUnits.length}</div><div className="kpi-note">unidades em estoque</div></div>
            <div className="kpi"><div className="kpi-label">Reservadas</div><div className="kpi-value">{reservedUnits.length}</div><div className="kpi-note">aguardando definição</div></div>
            <div className="kpi"><div className="kpi-label">Valor do estoque</div><div className="kpi-value" style={{ fontSize: 20 }}>{money.format(stockValue)}</div><div className="kpi-note">somente disponíveis</div></div>
            <div className="kpi"><div className="kpi-label">Tabela atualizada</div><div className="kpi-value" style={{ fontSize: 16 }}>{selectedUnits[0]?.price_updated_at ? new Date(Math.max(...selectedUnits.map((item) => new Date(item.price_updated_at).getTime()))).toLocaleDateString('pt-BR') : '—'}</div><div className="kpi-note">última alteração</div></div>
          </div>

          {canEdit && <section className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><h3>Reajuste geral da tabela</h3><span className="chip chip-orange">Histórico automático</span></div>
            <div className="card-body grid grid-3">
              <div className="field"><label>Percentual</label><input className="input" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder="Ex.: 3,5" /></div>
              <div className="field"><label>Motivo</label><input className="input" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Reajuste de agosto" /></div>
              <div style={{ alignSelf: 'end' }}><button className="btn btn-secondary btn-block" type="button" disabled={saving} onClick={() => void applyAdjustment()}>Aplicar nas disponíveis e reservadas</button></div>
            </div>
          </section>}

          <section className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><h3>Tabela de vendas</h3><span className="chip">{selectedUnits.length} unidades</span></div>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Unidade</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Entrada</th><th>Parcelas</th><th>Valor parcela</th><th>Reforços</th><th>Valor reforço</th><th>Chaves</th><th></th></tr></thead>
                <tbody>{selectedUnits.map((item) => <EditableUnitRow key={item.id} item={item} typologies={selectedTypologies} canEdit={canEdit} onSave={saveUnit} />)}</tbody>
              </table>
            </div>
          </section>

          {canEdit && <section className="card">
            <div className="card-head"><h3>Adicionar unidade</h3></div>
            <form className="card-body" onSubmit={addUnit}>
              <div className="grid grid-4">
                <div className="field"><label>Unidade</label><input className="input" name="unit_code" required /></div>
                <div className="field"><label>Andar</label><input className="input" name="floor" type="number" /></div>
                <div className="field"><label>Tipologia</label><select className="select" name="typology_id"><option value="">Sem tipologia</option>{selectedTypologies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div className="field"><label>Status</label><select className="select" name="status" defaultValue="disponivel">{Object.entries(unitStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="field"><label>Área m²</label><input className="input" name="private_area_m2" type="number" step="0.01" /></div>
                <div className="field"><label>Valor</label><input className="input" name="list_price" type="number" step="0.01" /></div>
                <div className="field"><label>Entrada</label><input className="input" name="entry_amount" type="number" step="0.01" /></div>
                <div className="field"><label>Qtd. parcelas</label><input className="input" name="installment_count" type="number" defaultValue={planNumber(selected.default_payment_plan, 'installment_count') || ''} /></div>
                <div className="field"><label>Valor parcela</label><input className="input" name="installment_amount" type="number" step="0.01" /></div>
                <div className="field"><label>Qtd. reforços</label><input className="input" name="reinforcement_count" type="number" defaultValue={planNumber(selected.default_payment_plan, 'reinforcement_count') || ''} /></div>
                <div className="field"><label>Valor reforço</label><input className="input" name="reinforcement_amount" type="number" step="0.01" /></div>
                <div className="field"><label>Chaves</label><input className="input" name="keys_amount" type="number" step="0.01" /></div>
              </div>
              <div className="field"><label>Observação</label><input className="input" name="notes" /></div>
              <button className="btn btn-primary" disabled={saving}>Adicionar unidade</button>
            </form>
          </section>}
        </>}

        {!showNewDevelopment && selected && tab === 'arquivos' && <div className="grid grid-2">
          <section className="card">
            <div className="card-head"><h3>Books, tabelas e materiais</h3><span className="chip">{selectedFiles.length}</span></div>
            <div className="card-body" style={{ display: 'grid', gap: 10 }}>
              {selectedFiles.map((item) => <div className="card" key={item.id} style={{ boxShadow: 'none' }}><div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ fontSize: 26 }}>📎</div><div style={{ flex: 1 }}><strong>{item.title}</strong><div className="muted" style={{ fontSize: 11 }}>{fileCategories.find(([value]) => value === item.category)?.[1] ?? item.category} · {formatBytes(item.size_bytes)}</div>{item.description && <div className="muted" style={{ marginTop: 4 }}>{item.description}</div>}</div><button className="btn btn-ghost btn-sm" onClick={() => void previewFile(item)}>Abrir</button>{canEdit && <button className="btn btn-danger btn-sm" onClick={() => void removeFile(item)}>Excluir</button>}</div></div>)}
              {selectedFiles.length === 0 && <div className="empty-state">Nenhum arquivo neste empreendimento.</div>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Adicionar arquivo</h3><span className="chip">Até 100 MB</span></div>
            <form className="card-body" onSubmit={uploadFile}>
              <div className="field"><label>Arquivo</label><input id="development-file-input" className="input" type="file" disabled={!canEdit} onChange={(event) => { const file = event.target.files?.[0] ?? null; setSelectedFile(file); if (file && !fileTitle) setFileTitle(file.name.replace(/\.[^.]+$/, '')); }} /></div>
              <div className="field"><label>Título</label><input className="input" value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Categoria</label><select className="select" value={fileCategory} onChange={(event) => setFileCategory(event.target.value)} disabled={!canEdit}>{fileCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="field"><label>Descrição</label><textarea className="textarea" value={fileDescription} onChange={(event) => setFileDescription(event.target.value)} disabled={!canEdit} /></div>
              {canEdit && <button className="btn btn-primary" disabled={saving || !selectedFile}>{saving ? 'Enviando…' : 'Enviar arquivo'}</button>}
            </form>
          </section>
        </div>}
      </div>
    </div>
  </div>;
}

function EditableUnitRow({
  item,
  typologies,
  canEdit,
  onSave,
}: {
  item: DevelopmentUnit;
  typologies: DevelopmentTypology[];
  canEdit: boolean;
  onSave: (item: DevelopmentUnit, patch: Partial<DevelopmentUnit>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(item);

  useEffect(() => setDraft(item), [item]);

  function field<K extends keyof DevelopmentUnit>(key: K, value: DevelopmentUnit[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const typology = typologies.find((row) => row.id === draft.typology_id);

  return <tr>
    <td><strong>{item.unit_code}</strong><div className="faint">{item.floor ? `${item.floor}º andar` : ''}</div></td>
    <td>{canEdit ? <select className="select" style={{ minWidth: 115 }} value={draft.typology_id ?? ''} onChange={(event) => field('typology_id', event.target.value || null)}><option value="">—</option>{typologies.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select> : typology?.code ?? '—'}</td>
    <td>{canEdit ? <select className="select" style={{ minWidth: 120 }} value={draft.status} onChange={(event) => field('status', event.target.value as UnitStatus)}>{Object.entries(unitStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : unitStatusLabels[item.status]}</td>
    <MoneyCell value={draft.list_price} disabled={!canEdit} onChange={(value) => field('list_price', value)} />
    <MoneyCell value={draft.entry_amount} disabled={!canEdit} onChange={(value) => field('entry_amount', value)} />
    <NumberCell value={draft.installment_count} disabled={!canEdit} onChange={(value) => field('installment_count', value)} />
    <MoneyCell value={draft.installment_amount} disabled={!canEdit} onChange={(value) => field('installment_amount', value)} />
    <NumberCell value={draft.reinforcement_count} disabled={!canEdit} onChange={(value) => field('reinforcement_count', value)} />
    <MoneyCell value={draft.reinforcement_amount} disabled={!canEdit} onChange={(value) => field('reinforcement_amount', value)} />
    <MoneyCell value={draft.keys_amount} disabled={!canEdit} onChange={(value) => field('keys_amount', value)} />
    <td>{canEdit && <button className="btn btn-primary btn-sm" onClick={() => void onSave(item, draft)}>Salvar</button>}</td>
  </tr>;
}

function MoneyCell({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <td>{disabled ? money.format(numberValue(value)) : <input className="input mono" style={{ width: 128 }} type="number" step="0.01" value={numberValue(value)} onChange={(event) => onChange(numberValue(event.target.value))} />}</td>;
}

function NumberCell({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <td>{disabled ? numberValue(value) : <input className="input mono" style={{ width: 75 }} type="number" value={numberValue(value)} onChange={(event) => onChange(numberValue(event.target.value))} />}</td>;
}
