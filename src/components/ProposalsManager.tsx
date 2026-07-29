'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export type ProposalLead = {
  id: string;
  kind: 'cliente' | 'corretor';
  name: string;
  phone: string | null;
  enterprise: string | null;
  company: string | null;
  group_name: string | null;
};

export type ProposalDevelopment = {
  id: string;
  name: string;
  delivery_date: string | null;
  default_payment_plan: Record<string, unknown>;
};

export type ProposalUnit = {
  id: string;
  development_id: string;
  unit_code: string;
  status: string;
  list_price: number;
  entry_amount: number;
  installment_count: number;
  installment_amount: number;
  reinforcement_count: number;
  reinforcement_amount: number;
  keys_amount: number;
  payment_plan: Record<string, unknown>;
};

type StoredStatus = 'rascunho' | 'enviada' | 'aprovada' | 'recusada' | 'expirada' | 'cancelada';
type WorkflowStatus = 'rascunho' | 'enviada' | 'negociacao' | 'contraproposta' | 'aprovada' | 'recusada' | 'expirada' | 'convertida';
type Origin = 'cliente' | 'corretor';

type ProposalSnapshot = Record<string, unknown> & {
  workflow_status?: WorkflowStatus;
  origin?: Origin;
  lead_name?: string;
  client_name?: string;
  development_name?: string;
  unit_code?: string;
  responsible_name?: string;
  paid_until_keys_amount?: number;
  paid_until_keys_percent?: number;
  nominal_total?: number;
  discount_percent?: number;
  next_action?: string;
  next_action_due_at?: string | null;
};

export type Proposal = {
  id: string;
  organization_id: string;
  development_id: string;
  unit_id: string | null;
  lead_id: string | null;
  status: StoredStatus;
  proposal_number: number;
  list_price: number;
  proposed_price: number;
  discount_amount: number;
  valid_until: string | null;
  notes: string | null;
  payment_plan: Record<string, unknown>;
  snapshot: ProposalSnapshot;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ProposalForm = {
  origin: Origin;
  leadId: string;
  clientName: string;
  developmentId: string;
  unitId: string;
  workflowStatus: WorkflowStatus;
  validUntil: string;
  listPrice: string;
  proposedPrice: string;
  entryInstallments: string;
  entryTotal: string;
  untilKeysCount: string;
  untilKeysAmount: string;
  reinforcementCount: string;
  reinforcementAmount: string;
  keysAmount: string;
  postKeysCount: string;
  postKeysAmount: string;
  correctionIndex: string;
  monthlyInterestPercent: string;
  nextAction: string;
  nextActionDueAt: string;
  notes: string;
};

const statusLabels: Record<WorkflowStatus, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  negociacao: 'Em negociação',
  contraproposta: 'Contraproposta',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  convertida: 'Convertida em venda',
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR');

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function planText(plan: Record<string, unknown> | null | undefined, key: string): string {
  const value = plan?.[key];
  return value === null || value === undefined ? '' : String(value);
}

function localDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function workflowOf(proposal: Proposal): WorkflowStatus {
  const value = proposal.snapshot?.workflow_status;
  if (value && value in statusLabels) return value;
  if (proposal.status === 'cancelada') return 'recusada';
  return proposal.status as WorkflowStatus;
}

function storedStatusOf(status: WorkflowStatus): StoredStatus {
  if (status === 'negociacao' || status === 'contraproposta') return 'enviada';
  if (status === 'convertida') return 'aprovada';
  return status;
}

function blankForm(initialLead?: ProposalLead): ProposalForm {
  return {
    origin: initialLead?.kind ?? 'cliente',
    leadId: initialLead?.id ?? '',
    clientName: initialLead?.kind === 'cliente' ? initialLead.name : '',
    developmentId: '',
    unitId: '',
    workflowStatus: 'rascunho',
    validUntil: '',
    listPrice: '',
    proposedPrice: '',
    entryInstallments: '1',
    entryTotal: '',
    untilKeysCount: '',
    untilKeysAmount: '',
    reinforcementCount: '',
    reinforcementAmount: '',
    keysAmount: '',
    postKeysCount: '',
    postKeysAmount: '',
    correctionIndex: 'INCC',
    monthlyInterestPercent: '',
    nextAction: '',
    nextActionDueAt: '',
    notes: '',
  };
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? 'Erro inesperado.');
  return 'Erro inesperado.';
}

export function ProposalsManager({
  organizationId,
  currentUserId,
  currentUserName,
  canEdit,
  initialProposals,
  developments,
  units,
  leads,
}: {
  organizationId: string;
  currentUserId: string;
  currentUserName: string;
  canEdit: boolean;
  initialProposals: Proposal[];
  developments: ProposalDevelopment[];
  units: ProposalUnit[];
  leads: ProposalLead[];
}) {
  const searchParams = useSearchParams();
  const initialLead = leads.find((lead) => lead.id === searchParams.get('lead'));
  const supabase = useMemo(() => createClient(), []);
  const [proposals, setProposals] = useState(initialProposals);
  const [mode, setMode] = useState<'list' | 'form'>(initialLead ? 'form' : 'list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProposalForm>(() => blankForm(initialLead));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [developmentFilter, setDevelopmentFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedLead = leads.find((lead) => lead.id === form.leadId) ?? null;
  const selectedDevelopment = developments.find((item) => item.id === form.developmentId) ?? null;
  const selectedUnit = units.find((item) => item.id === form.unitId) ?? null;
  const availableLeads = leads.filter((lead) => lead.kind === form.origin);
  const developmentUnits = units.filter((unit) => unit.development_id === form.developmentId);

  const calculations = useMemo(() => {
    const listPrice = numberValue(form.listPrice);
    const proposedPrice = numberValue(form.proposedPrice);
    const entryTotal = numberValue(form.entryTotal);
    const untilKeysTotal = numberValue(form.untilKeysCount) * numberValue(form.untilKeysAmount);
    const reinforcementTotal = numberValue(form.reinforcementCount) * numberValue(form.reinforcementAmount);
    const keysAmount = numberValue(form.keysAmount);
    const postKeysTotal = numberValue(form.postKeysCount) * numberValue(form.postKeysAmount);
    const paidUntilKeys = entryTotal + untilKeysTotal + reinforcementTotal + keysAmount;
    const nominalTotal = paidUntilKeys + postKeysTotal;
    const discountAmount = Math.max(0, listPrice - proposedPrice);
    return {
      listPrice,
      proposedPrice,
      entryTotal,
      paidUntilKeys,
      paidUntilKeysPercent: proposedPrice > 0 ? (paidUntilKeys / proposedPrice) * 100 : 0,
      nominalTotal,
      discountAmount,
      discountPercent: listPrice > 0 ? (discountAmount / listPrice) * 100 : 0,
      difference: nominalTotal - proposedPrice,
    };
  }, [form]);

  const filteredProposals = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return proposals.filter((proposal) => {
      const snapshot = proposal.snapshot ?? {};
      const haystack = [proposal.proposal_number, snapshot.lead_name, snapshot.client_name, snapshot.development_name, snapshot.unit_code]
        .filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return (!term || haystack.includes(term))
        && (!statusFilter || workflowOf(proposal) === statusFilter)
        && (!developmentFilter || proposal.development_id === developmentFilter);
    });
  }, [developmentFilter, proposals, search, statusFilter]);

  const sentCount = proposals.filter((proposal) => ['enviada', 'negociacao', 'contraproposta'].includes(workflowOf(proposal))).length;
  const activeValue = proposals.filter((proposal) => !['recusada', 'expirada'].includes(workflowOf(proposal)))
    .reduce((sum, proposal) => sum + numberValue(proposal.proposed_price), 0);
  const approvedValue = proposals.filter((proposal) => ['aprovada', 'convertida'].includes(workflowOf(proposal)))
    .reduce((sum, proposal) => sum + numberValue(proposal.proposed_price), 0);

  function setField<K extends keyof ProposalForm>(key: K, value: ProposalForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNew() {
    setEditingId(null);
    setForm(blankForm());
    setError('');
    setNotice('');
    setMode('form');
  }

  function chooseOrigin(origin: Origin) {
    setForm((current) => ({ ...current, origin, leadId: '', clientName: '' }));
  }

  function chooseLead(leadId: string) {
    const lead = leads.find((item) => item.id === leadId);
    setForm((current) => ({
      ...current,
      leadId,
      clientName: lead?.kind === 'cliente' ? lead.name : current.clientName,
    }));
  }

  function chooseDevelopment(developmentId: string) {
    const development = developments.find((item) => item.id === developmentId);
    const plan = development?.default_payment_plan ?? {};
    setForm((current) => ({
      ...current,
      developmentId,
      unitId: '',
      correctionIndex: planText(plan, 'correction_index') || current.correctionIndex,
      monthlyInterestPercent: planText(plan, 'monthly_interest_percent') || current.monthlyInterestPercent,
    }));
  }

  function chooseUnit(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    if (!unit) { setField('unitId', ''); return; }
    const plan = unit.payment_plan ?? {};
    setForm((current) => ({
      ...current,
      unitId,
      listPrice: String(numberValue(unit.list_price) || ''),
      proposedPrice: String(numberValue(unit.list_price) || ''),
      entryTotal: String(numberValue(unit.entry_amount) || ''),
      untilKeysCount: String(numberValue(unit.installment_count) || ''),
      untilKeysAmount: String(numberValue(unit.installment_amount) || ''),
      reinforcementCount: String(numberValue(unit.reinforcement_count) || ''),
      reinforcementAmount: String(numberValue(unit.reinforcement_amount) || ''),
      keysAmount: String(numberValue(unit.keys_amount) || ''),
      postKeysCount: planText(plan, 'post_keys_count'),
      postKeysAmount: planText(plan, 'post_keys_amount'),
    }));
  }

  function editProposal(proposal: Proposal) {
    const plan = proposal.payment_plan ?? {};
    const snapshot = proposal.snapshot ?? {};
    const linkedLead = leads.find((lead) => lead.id === proposal.lead_id);
    setEditingId(proposal.id);
    setForm({
      origin: snapshot.origin === 'corretor' || linkedLead?.kind === 'corretor' ? 'corretor' : 'cliente',
      leadId: proposal.lead_id ?? '',
      clientName: String(snapshot.client_name ?? (linkedLead?.kind === 'cliente' ? linkedLead.name : '')),
      developmentId: proposal.development_id,
      unitId: proposal.unit_id ?? '',
      workflowStatus: workflowOf(proposal),
      validUntil: proposal.valid_until ?? '',
      listPrice: String(numberValue(proposal.list_price) || ''),
      proposedPrice: String(numberValue(proposal.proposed_price) || ''),
      entryInstallments: planText(plan, 'entry_installments') || '1',
      entryTotal: planText(plan, 'entry_total'),
      untilKeysCount: planText(plan, 'until_keys_count'),
      untilKeysAmount: planText(plan, 'until_keys_amount'),
      reinforcementCount: planText(plan, 'reinforcement_count'),
      reinforcementAmount: planText(plan, 'reinforcement_amount'),
      keysAmount: planText(plan, 'keys_amount'),
      postKeysCount: planText(plan, 'post_keys_count'),
      postKeysAmount: planText(plan, 'post_keys_amount'),
      correctionIndex: planText(plan, 'correction_index'),
      monthlyInterestPercent: planText(plan, 'monthly_interest_percent'),
      nextAction: String(snapshot.next_action ?? ''),
      nextActionDueAt: localDateTime(typeof snapshot.next_action_due_at === 'string' ? snapshot.next_action_due_at : null),
      notes: proposal.notes ?? '',
    });
    setError('');
    setNotice('');
    setMode('form');
  }

  async function saveProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setError('');
    setNotice('');
    if (!form.leadId || !form.developmentId || !form.proposedPrice) {
      setError('Selecione o lead, o empreendimento e informe o valor proposto.');
      return;
    }
    if (form.origin === 'corretor' && !form.clientName.trim()) {
      setError('Informe o nome do cliente final apresentado pelo corretor.');
      return;
    }
    setSaving(true);
    const leadName = selectedLead?.name ?? 'Lead não identificado';
    const clientName = form.origin === 'cliente' ? leadName : form.clientName.trim();
    const nextActionDueAt = form.nextActionDueAt ? new Date(form.nextActionDueAt).toISOString() : null;
    const paymentPlan = {
      entry_installments: numberValue(form.entryInstallments),
      entry_total: calculations.entryTotal,
      until_keys_count: numberValue(form.untilKeysCount),
      until_keys_amount: numberValue(form.untilKeysAmount),
      reinforcement_count: numberValue(form.reinforcementCount),
      reinforcement_amount: numberValue(form.reinforcementAmount),
      keys_amount: numberValue(form.keysAmount),
      post_keys_count: numberValue(form.postKeysCount),
      post_keys_amount: numberValue(form.postKeysAmount),
      correction_index: form.correctionIndex.trim() || null,
      monthly_interest_percent: numberValue(form.monthlyInterestPercent),
    };
    const snapshot: ProposalSnapshot = {
      workflow_status: form.workflowStatus,
      origin: form.origin,
      lead_name: leadName,
      client_name: clientName,
      development_name: selectedDevelopment?.name ?? '',
      unit_code: selectedUnit?.unit_code ?? '',
      responsible_name: currentUserName,
      paid_until_keys_amount: calculations.paidUntilKeys,
      paid_until_keys_percent: calculations.paidUntilKeysPercent,
      nominal_total: calculations.nominalTotal,
      discount_percent: calculations.discountPercent,
      next_action: form.nextAction.trim(),
      next_action_due_at: nextActionDueAt,
    };
    const payload = {
      organization_id: organizationId,
      development_id: form.developmentId,
      unit_id: form.unitId || null,
      lead_id: form.leadId,
      status: storedStatusOf(form.workflowStatus),
      list_price: calculations.listPrice,
      proposed_price: calculations.proposedPrice,
      discount_amount: calculations.discountAmount,
      valid_until: form.validUntil || null,
      notes: form.notes.trim() || null,
      payment_plan: paymentPlan,
      snapshot,
      updated_by: currentUserId,
    };

    try {
      let saved: Proposal;
      if (editingId) {
        const current = proposals.find((proposal) => proposal.id === editingId);
        const { data, error: updateError } = await supabase.from('proposals')
          .update({ ...payload, version: (current?.version ?? 1) + 1 })
          .eq('id', editingId).eq('organization_id', organizationId).select('*').single();
        if (updateError) throw updateError;
        saved = data as Proposal;
      } else {
        const { data, error: insertError } = await supabase.from('proposals')
          .insert({ ...payload, created_by: currentUserId }).select('*').single();
        if (insertError) throw insertError;
        saved = data as Proposal;
      }

      const { error: deleteItemsError } = await supabase.from('proposal_payment_items').delete().eq('proposal_id', saved.id);
      if (deleteItemsError) throw deleteItemsError;
      const paymentItems = [
        calculations.entryTotal > 0 ? { kind: 'entrada', label: `${numberValue(form.entryInstallments) || 1}x entrada`, quantity: numberValue(form.entryInstallments) || 1, amount: calculations.entryTotal / (numberValue(form.entryInstallments) || 1), interval_months: 1, sort_order: 1 } : null,
        numberValue(form.untilKeysCount) > 0 ? { kind: 'parcela_ate_chaves', label: 'Mensais até as chaves', quantity: numberValue(form.untilKeysCount), amount: numberValue(form.untilKeysAmount), interval_months: 1, sort_order: 2 } : null,
        numberValue(form.reinforcementCount) > 0 ? { kind: 'reforco_anual', label: 'Reforços', quantity: numberValue(form.reinforcementCount), amount: numberValue(form.reinforcementAmount), interval_months: 12, sort_order: 3 } : null,
        numberValue(form.keysAmount) > 0 ? { kind: 'chaves', label: 'Parcela nas chaves', quantity: 1, amount: numberValue(form.keysAmount), interval_months: null, sort_order: 4 } : null,
        numberValue(form.postKeysCount) > 0 ? { kind: 'parcela_pos_chaves', label: 'Mensais pós-chaves', quantity: numberValue(form.postKeysCount), amount: numberValue(form.postKeysAmount), interval_months: 1, sort_order: 5 } : null,
      ].filter(Boolean).map((item) => ({ ...item!, organization_id: organizationId, proposal_id: saved.id }));
      if (paymentItems.length) {
        const { error: itemsError } = await supabase.from('proposal_payment_items').insert(paymentItems);
        if (itemsError) throw itemsError;
      }

      const activityTitle = editingId ? `Proposta #${saved.proposal_number} atualizada` : `Proposta #${saved.proposal_number} criada`;
      const activityDescription = `${selectedDevelopment?.name ?? 'Empreendimento'}${selectedUnit ? ` · unidade ${selectedUnit.unit_code}` : ''} · ${money.format(calculations.proposedPrice)} · ${statusLabels[form.workflowStatus]}.`;
      const { error: activityError } = await supabase.from('activities').insert({
        organization_id: organizationId,
        lead_id: form.leadId,
        user_id: currentUserId,
        type: 'proposta',
        title: activityTitle,
        description: activityDescription,
        metadata: { proposal_id: saved.id, proposal_number: saved.proposal_number, ...snapshot },
      });
      if (activityError) throw activityError;

      setProposals((current) => editingId
        ? current.map((proposal) => proposal.id === saved.id ? saved : proposal)
        : [saved, ...current]);
      setNotice(editingId ? 'Proposta atualizada e registrada no histórico do lead.' : 'Proposta criada e registrada no histórico do lead.');
      setEditingId(saved.id);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(proposal: Proposal, workflowStatus: WorkflowStatus) {
    if (!canEdit) return;
    setError('');
    const snapshot = { ...(proposal.snapshot ?? {}), workflow_status: workflowStatus };
    try {
      const { data, error: updateError } = await supabase.from('proposals')
        .update({ status: storedStatusOf(workflowStatus), snapshot, updated_by: currentUserId, version: proposal.version + 1 })
        .eq('id', proposal.id).eq('organization_id', organizationId).select('*').single();
      if (updateError) throw updateError;
      const updated = data as Proposal;
      setProposals((current) => current.map((item) => item.id === proposal.id ? updated : item));
      if (proposal.lead_id) {
        await supabase.from('activities').insert({
          organization_id: organizationId,
          lead_id: proposal.lead_id,
          user_id: currentUserId,
          type: 'proposta',
          title: `Proposta #${proposal.proposal_number}: ${statusLabels[workflowStatus]}`,
          description: `${String(snapshot.development_name ?? 'Empreendimento')} · ${money.format(numberValue(proposal.proposed_price))}.`,
          metadata: { proposal_id: proposal.id, proposal_number: proposal.proposal_number, workflow_status: workflowStatus },
        });
      }
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const rows = filteredProposals.map((proposal) => ({
      'Nº': proposal.proposal_number,
      Data: date.format(new Date(proposal.created_at)),
      Lead: String(proposal.snapshot?.lead_name ?? ''),
      'Cliente final': String(proposal.snapshot?.client_name ?? ''),
      Origem: proposal.snapshot?.origin === 'corretor' ? 'Corretor' : 'Cliente direto',
      Empreendimento: String(proposal.snapshot?.development_name ?? ''),
      Unidade: String(proposal.snapshot?.unit_code ?? ''),
      'Valor de tabela': numberValue(proposal.list_price),
      'Valor proposto': numberValue(proposal.proposed_price),
      'Desconto %': numberValue(proposal.snapshot?.discount_percent),
      'Pago até chaves': numberValue(proposal.snapshot?.paid_until_keys_amount),
      '% até chaves': numberValue(proposal.snapshot?.paid_until_keys_percent),
      'Total nominal': numberValue(proposal.snapshot?.nominal_total),
      Status: statusLabels[workflowOf(proposal)],
      Responsável: String(proposal.snapshot?.responsible_name ?? ''),
      Validade: proposal.valid_until ? date.format(new Date(`${proposal.valid_until}T12:00:00`)) : '',
      'Próxima ação': String(proposal.snapshot?.next_action ?? ''),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Propostas');
    XLSX.writeFile(workbook, `propostas-bossa-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return <div className="page-content">
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    {mode === 'list' ? <>
      <div className="page-head">
        <div><h2>Controle de propostas</h2><p>Cada proposta fica vinculada ao lead e aparece também nesta planilha geral.</p></div>
        <div className="page-actions">{canEdit && <button className="btn btn-primary" onClick={startNew}>+ Nova proposta</button>}<button className="btn btn-ghost" onClick={() => void exportXlsx()}>⬇ Exportar Excel</button></div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Propostas</div><div className="kpi-value">{proposals.length}</div><div className="kpi-note">base geral</div></div>
        <div className="kpi"><div className="kpi-label">Em andamento</div><div className="kpi-value">{sentCount}</div><div className="kpi-note">enviadas e negociando</div></div>
        <div className="kpi"><div className="kpi-label">Pipeline proposto</div><div className="kpi-value" style={{ fontSize: 21 }}>{money.format(activeValue)}</div><div className="kpi-note">sem recusadas e expiradas</div></div>
        <div className="kpi"><div className="kpi-label">Aprovado</div><div className="kpi-value" style={{ fontSize: 21 }}>{money.format(approvedValue)}</div><div className="kpi-note">aprovadas e convertidas</div></div>
      </div>

      <section className="card">
        <div className="card-head"><h3>Planilha geral de propostas</h3></div>
        <div className="card-body">
          <div className="grid grid-3" style={{ marginBottom: 16 }}>
            <div className="field"><label>Buscar</label><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, corretor, unidade ou número" /></div>
            <div className="field"><label>Status</label><select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <div className="field"><label>Empreendimento</label><select className="select" value={developmentFilter} onChange={(event) => setDevelopmentFilter(event.target.value)}><option value="">Todos</option>{developments.map((development) => <option value={development.id} key={development.id}>{development.name}</option>)}</select></div>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Nº</th><th>Lead / cliente</th><th>Empreendimento</th><th>Valor proposto</th><th>Até chaves</th><th>Status</th><th>Atualização</th><th></th></tr></thead><tbody>
            {filteredProposals.length === 0 && <tr><td colSpan={8}><div className="empty-state">Nenhuma proposta encontrada.</div></td></tr>}
            {filteredProposals.map((proposal) => <tr key={proposal.id}>
              <td className="mono">#{proposal.proposal_number}</td>
              <td><strong>{String(proposal.snapshot?.client_name ?? proposal.snapshot?.lead_name ?? '—')}</strong><br /><small className="faint">{proposal.snapshot?.origin === 'corretor' ? `Corretor: ${String(proposal.snapshot?.lead_name ?? '—')}` : 'Cliente direto'}</small></td>
              <td><strong>{String(proposal.snapshot?.development_name ?? '—')}</strong><br /><small className="faint">{proposal.snapshot?.unit_code ? `Unidade ${String(proposal.snapshot.unit_code)}` : 'Sem unidade'}</small></td>
              <td><strong>{money.format(numberValue(proposal.proposed_price))}</strong><br /><small className="faint">{numberValue(proposal.snapshot?.discount_percent).toFixed(2)}% desc.</small></td>
              <td><strong>{numberValue(proposal.snapshot?.paid_until_keys_percent).toFixed(1)}%</strong><br /><small className="faint">{money.format(numberValue(proposal.snapshot?.paid_until_keys_amount))}</small></td>
              <td>{canEdit ? <select className="select" style={{ minWidth: 155, padding: '7px 9px' }} value={workflowOf(proposal)} onChange={(event) => void changeStatus(proposal, event.target.value as WorkflowStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : statusLabels[workflowOf(proposal)]}</td>
              <td><small>{date.format(new Date(proposal.updated_at))}</small><br /><small className="faint">{String(proposal.snapshot?.responsible_name ?? '—')}</small></td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => editProposal(proposal)}>Abrir</button></td>
            </tr>)}
          </tbody></table></div>
        </div>
      </section>
    </> : <>
      <div className="page-head">
        <div><h2>{editingId ? 'Editar proposta' : 'Nova proposta'}</h2><p>Monte o fluxo, confira o percentual pago até as chaves e salve no histórico do lead.</p></div>
        <button className="btn btn-ghost" onClick={() => setMode('list')}>← Voltar para propostas</button>
      </div>

      <form onSubmit={saveProposal} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 330px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="card"><div className="card-head"><h3>1. Origem e produto</h3></div><div className="card-body">
            <div className="grid grid-2">
              <div className="field"><label>Origem da proposta</label><select className="select" value={form.origin} onChange={(event) => chooseOrigin(event.target.value as Origin)} disabled={!canEdit}><option value="cliente">Cliente direto</option><option value="corretor">Corretor / imobiliária</option></select></div>
              <div className="field"><label>{form.origin === 'cliente' ? 'Lead do cliente' : 'Lead do corretor'}</label><select className="select" value={form.leadId} onChange={(event) => chooseLead(event.target.value)} disabled={!canEdit}><option value="">Selecione</option>{availableLeads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name}{lead.kind === 'corretor' && lead.company ? ` · ${lead.company}` : ''}</option>)}</select></div>
              {form.origin === 'corretor' && <div className="field" style={{ gridColumn: '1 / -1' }}><label>Nome do cliente final</label><input className="input" value={form.clientName} onChange={(event) => setField('clientName', event.target.value)} placeholder="Cliente apresentado pelo corretor" disabled={!canEdit} /></div>}
              <div className="field"><label>Empreendimento</label><select className="select" value={form.developmentId} onChange={(event) => chooseDevelopment(event.target.value)} disabled={!canEdit}><option value="">Selecione</option>{developments.map((development) => <option value={development.id} key={development.id}>{development.name}</option>)}</select></div>
              <div className="field"><label>Unidade</label><select className="select" value={form.unitId} onChange={(event) => chooseUnit(event.target.value)} disabled={!canEdit || !form.developmentId}><option value="">Sem unidade específica</option>{developmentUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.unit_code} · {money.format(numberValue(unit.list_price))} · {unit.status}</option>)}</select></div>
            </div>
          </div></section>

          <section className="card"><div className="card-head"><h3>2. Valores e fluxo de pagamento</h3></div><div className="card-body">
            <div className="grid grid-3">
              <div className="field"><label>Valor de tabela</label><input className="input" type="number" step="0.01" value={form.listPrice} onChange={(event) => setField('listPrice', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Valor proposto</label><input className="input" type="number" step="0.01" value={form.proposedPrice} onChange={(event) => setField('proposedPrice', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Validade</label><input className="input" type="date" value={form.validUntil} onChange={(event) => setField('validUntil', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Parcelas da entrada</label><input className="input" type="number" min="1" value={form.entryInstallments} onChange={(event) => setField('entryInstallments', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Entrada total</label><input className="input" type="number" step="0.01" value={form.entryTotal} onChange={(event) => setField('entryTotal', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Parcela nas chaves</label><input className="input" type="number" step="0.01" value={form.keysAmount} onChange={(event) => setField('keysAmount', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Mensais até chaves · quantidade</label><input className="input" type="number" value={form.untilKeysCount} onChange={(event) => setField('untilKeysCount', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Mensais até chaves · valor</label><input className="input" type="number" step="0.01" value={form.untilKeysAmount} onChange={(event) => setField('untilKeysAmount', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Reforços · quantidade</label><input className="input" type="number" value={form.reinforcementCount} onChange={(event) => setField('reinforcementCount', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Reforços · valor</label><input className="input" type="number" step="0.01" value={form.reinforcementAmount} onChange={(event) => setField('reinforcementAmount', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Pós-chaves · quantidade</label><input className="input" type="number" value={form.postKeysCount} onChange={(event) => setField('postKeysCount', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Pós-chaves · valor</label><input className="input" type="number" step="0.01" value={form.postKeysAmount} onChange={(event) => setField('postKeysAmount', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Índice de correção</label><input className="input" value={form.correctionIndex} onChange={(event) => setField('correctionIndex', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Juros mensais (%)</label><input className="input" type="number" step="0.01" value={form.monthlyInterestPercent} onChange={(event) => setField('monthlyInterestPercent', event.target.value)} disabled={!canEdit} /></div>
            </div>
          </div></section>

          <section className="card"><div className="card-head"><h3>3. Acompanhamento</h3></div><div className="card-body">
            <div className="grid grid-2">
              <div className="field"><label>Status</label><select className="select" value={form.workflowStatus} onChange={(event) => setField('workflowStatus', event.target.value as WorkflowStatus)} disabled={!canEdit}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
              <div className="field"><label>Próxima ação</label><input className="input" value={form.nextAction} onChange={(event) => setField('nextAction', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Data da próxima ação</label><input className="input" type="datetime-local" value={form.nextActionDueAt} onChange={(event) => setField('nextActionDueAt', event.target.value)} disabled={!canEdit} /></div>
              <div className="field"><label>Observações e condições especiais</label><textarea className="textarea" value={form.notes} onChange={(event) => setField('notes', event.target.value)} disabled={!canEdit} /></div>
            </div>
          </div></section>
        </div>

        <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 86 }}>
          <section className="card"><div className="card-head"><h3>Resumo financeiro</h3></div><div className="card-body info-list">
            <div className="info-row"><span>Valor de tabela</span><strong>{money.format(calculations.listPrice)}</strong></div>
            <div className="info-row"><span>Valor proposto</span><strong>{money.format(calculations.proposedPrice)}</strong></div>
            <div className="info-row"><span>Desconto</span><strong>{money.format(calculations.discountAmount)} · {calculations.discountPercent.toFixed(2)}%</strong></div>
            <div className="info-row"><span>Pago até chaves</span><strong>{money.format(calculations.paidUntilKeys)}</strong></div>
            <div className="info-row"><span>% até chaves</span><strong>{calculations.paidUntilKeysPercent.toFixed(2)}%</strong></div>
            <div className="info-row"><span>Total nominal</span><strong>{money.format(calculations.nominalTotal)}</strong></div>
            <div className="info-row"><span>Diferença do fluxo</span><strong style={{ color: Math.abs(calculations.difference) > 0.01 ? 'var(--red)' : 'var(--green)' }}>{money.format(calculations.difference)}</strong></div>
          </div></section>
          <section className="card"><div className="card-body">
            <div className="faint" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>Ao salvar, a proposta entra nesta planilha e no histórico de <strong>{selectedLead?.name ?? 'selecione um lead'}</strong>.</div>
            {selectedLead && <Link className="btn btn-ghost btn-block" href={`/leads/${selectedLead.id}`}>Abrir ficha do lead</Link>}
            {canEdit && <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={saving}>{saving ? 'Salvando…' : editingId ? 'Salvar nova versão' : 'Criar proposta'}</button>}
          </div></section>
        </aside>
      </form>
    </>}
  </div>;
}
