'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ProposalEditor } from './proposals/ProposalEditor';
import { ProposalList } from './proposals/ProposalList';
import {
  addMonthsIso,
  blankForm,
  calculateProposal,
  countOccurrencesUntil,
  date,
  errorText,
  integerValue,
  localDateTime,
  money,
  numberValue,
  planText,
  proposalScheduleWarnings,
  scheduleItemsTotal,
  statusLabels,
  storedStatusOf,
  suggestedReinforcementDate,
  workflowOf,
  type MonthlyMode,
  type Origin,
  type Proposal,
  type ProposalDevelopment,
  type ProposalForm,
  type ProposalLead,
  type ProposalSnapshot,
  type ProposalUnit,
  type ReinforcementFrequency,
  type WorkflowStatus,
} from './proposals/model';

export type { Proposal, ProposalDevelopment, ProposalLead, ProposalUnit } from './proposals/model';

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
  const deliveryDate = selectedDevelopment?.delivery_date ?? null;
  const firstMonthlyDate = addMonthsIso(form.proposalDate, 1);
  const firstAfterKeysDate = deliveryDate ? addMonthsIso(deliveryDate, 1) : '';
  const maxBeforeKeysCount = deliveryDate
    ? countOccurrencesUntil(firstMonthlyDate, 1, 600, deliveryDate)
    : 0;

  const calculations = useMemo(
    () => calculateProposal(form, deliveryDate, firstMonthlyDate, firstAfterKeysDate),
    [deliveryDate, firstAfterKeysDate, firstMonthlyDate, form],
  );
  const scheduleWarnings = useMemo(
    () => proposalScheduleWarnings(form, deliveryDate, firstAfterKeysDate, calculations.monthlyAfterCount),
    [calculations.monthlyAfterCount, deliveryDate, firstAfterKeysDate, form],
  );

  const filteredProposals = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return proposals.filter((proposal) => {
      const snapshot = proposal.snapshot ?? {};
      const haystack = [
        proposal.proposal_number,
        snapshot.lead_name,
        snapshot.client_name,
        snapshot.development_name,
        snapshot.unit_code,
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return (!term || haystack.includes(term))
        && (!statusFilter || workflowOf(proposal) === statusFilter)
        && (!developmentFilter || proposal.development_id === developmentFilter);
    });
  }, [developmentFilter, proposals, search, statusFilter]);

  const sentCount = proposals.filter((proposal) => ['enviada', 'negociacao', 'contraproposta'].includes(workflowOf(proposal))).length;
  const activeValue = proposals
    .filter((proposal) => !['recusada', 'expirada'].includes(workflowOf(proposal)))
    .reduce((sum, proposal) => sum + numberValue(proposal.proposed_price), 0);
  const approvedValue = proposals
    .filter((proposal) => ['aprovada', 'convertida'].includes(workflowOf(proposal)))
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
    setForm((current) => ({
      ...current,
      developmentId,
      unitId: '',
      listPrice: '',
      entryTotal: '',
      monthlyMode: 'unificado',
      monthlyCount: '',
      monthlyAmount: '',
      beforeKeysCount: '',
      beforeKeysAmount: '',
      afterKeysCount: '',
      afterKeysAmount: '',
      reinforcementFrequency: 'anual',
      reinforcementCount: '',
      reinforcementAmount: '',
      firstReinforcementDate: suggestedReinforcementDate(current.proposalDate, 'anual'),
      keysAmount: '',
    }));
  }

  function chooseUnit(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    if (!unit) {
      setField('unitId', '');
      return;
    }
    const plan = unit.payment_plan ?? {};
    const storedMode = planText(plan, 'monthly_mode');
    const storedAfterCount = numberValue(plan.after_keys_count ?? plan.post_keys_count);
    const storedAfterAmount = numberValue(plan.after_keys_amount ?? plan.post_keys_amount);
    const unitMonthlyAmount = numberValue(unit.installment_amount);
    const useSplitMode = storedMode === 'dividido'
      || (!storedMode && storedAfterCount > 0 && storedAfterAmount > 0 && storedAfterAmount !== unitMonthlyAmount);
    const frequency: ReinforcementFrequency = planText(plan, 'reinforcement_frequency') === 'semestral' ? 'semestral' : 'anual';

    setForm((current) => ({
      ...current,
      unitId,
      listPrice: String(numberValue(unit.list_price) || ''),
      entryTotal: String(numberValue(unit.entry_amount) || ''),
      monthlyMode: useSplitMode ? 'dividido' : 'unificado',
      monthlyCount: useSplitMode ? '' : String(numberValue(plan.monthly_count ?? unit.installment_count) || ''),
      monthlyAmount: useSplitMode ? '' : String(numberValue(plan.monthly_amount ?? unit.installment_amount) || ''),
      beforeKeysCount: useSplitMode ? String(numberValue(plan.before_keys_count ?? unit.installment_count) || '') : '',
      beforeKeysAmount: useSplitMode ? String(numberValue(plan.before_keys_amount ?? unit.installment_amount) || '') : '',
      afterKeysCount: useSplitMode ? String(storedAfterCount || '') : '',
      afterKeysAmount: useSplitMode ? String(storedAfterAmount || '') : '',
      reinforcementCount: String(numberValue(unit.reinforcement_count) || ''),
      reinforcementAmount: String(numberValue(unit.reinforcement_amount) || ''),
      reinforcementFrequency: frequency,
      firstReinforcementDate: planText(plan, 'first_reinforcement_date')
        || suggestedReinforcementDate(current.proposalDate, frequency),
      keysAmount: String(numberValue(unit.keys_amount) || ''),
    }));
  }

  function chooseMonthlyMode(monthlyMode: MonthlyMode) {
    setForm((current) => {
      if (monthlyMode === current.monthlyMode) return current;
      if (monthlyMode === 'dividido') {
        const totalCount = integerValue(current.monthlyCount);
        const beforeCount = Math.min(totalCount, maxBeforeKeysCount);
        const afterCount = Math.max(0, totalCount - beforeCount);
        return {
          ...current,
          monthlyMode,
          beforeKeysCount: String(beforeCount || ''),
          beforeKeysAmount: current.monthlyAmount,
          afterKeysCount: String(afterCount || ''),
          afterKeysAmount: current.monthlyAmount,
        };
      }
      return {
        ...current,
        monthlyMode,
        monthlyCount: String(integerValue(current.beforeKeysCount) + integerValue(current.afterKeysCount) || ''),
        monthlyAmount: current.beforeKeysAmount || current.afterKeysAmount,
      };
    });
  }

  function chooseReinforcementFrequency(frequency: ReinforcementFrequency) {
    setForm((current) => ({
      ...current,
      reinforcementFrequency: frequency,
      firstReinforcementDate: suggestedReinforcementDate(current.proposalDate, frequency),
    }));
  }

  function editProposal(proposal: Proposal) {
    const plan = proposal.payment_plan ?? {};
    const snapshot = proposal.snapshot ?? {};
    const linkedLead = leads.find((lead) => lead.id === proposal.lead_id);
    const oldBeforeCount = numberValue(plan.before_keys_count ?? plan.until_keys_count);
    const oldAfterCount = numberValue(plan.after_keys_count ?? plan.post_keys_count);
    const oldBeforeAmount = numberValue(plan.before_keys_amount ?? plan.until_keys_amount);
    const oldAfterAmount = numberValue(plan.after_keys_amount ?? plan.post_keys_amount);
    const storedMode = planText(plan, 'monthly_mode');
    const monthlyMode: MonthlyMode = storedMode === 'dividido'
      ? 'dividido'
      : storedMode === 'unificado'
        ? 'unificado'
        : oldAfterCount > 0
          ? 'dividido'
          : 'unificado';
    const frequency: ReinforcementFrequency = planText(plan, 'reinforcement_frequency') === 'semestral' ? 'semestral' : 'anual';
    const proposalDate = planText(plan, 'proposal_date') || String(snapshot.proposal_date ?? proposal.created_at).slice(0, 10);

    setEditingId(proposal.id);
    setForm({
      origin: snapshot.origin === 'corretor' || linkedLead?.kind === 'corretor' ? 'corretor' : 'cliente',
      leadId: proposal.lead_id ?? '',
      clientName: String(snapshot.client_name ?? (linkedLead?.kind === 'cliente' ? linkedLead.name : '')),
      developmentId: proposal.development_id,
      unitId: proposal.unit_id ?? '',
      workflowStatus: workflowOf(proposal),
      proposalDate,
      validUntil: proposal.valid_until ?? '',
      listPrice: String(numberValue(proposal.list_price) || ''),
      entryTotal: planText(plan, 'entry_total'),
      monthlyMode,
      monthlyCount: monthlyMode === 'unificado'
        ? planText(plan, 'monthly_count') || String(oldBeforeCount + oldAfterCount || '')
        : '',
      monthlyAmount: monthlyMode === 'unificado'
        ? planText(plan, 'monthly_amount') || String(oldBeforeAmount || oldAfterAmount || '')
        : '',
      beforeKeysCount: monthlyMode === 'dividido' ? String(oldBeforeCount || '') : '',
      beforeKeysAmount: monthlyMode === 'dividido' ? String(oldBeforeAmount || '') : '',
      afterKeysCount: monthlyMode === 'dividido' ? String(oldAfterCount || '') : '',
      afterKeysAmount: monthlyMode === 'dividido' ? String(oldAfterAmount || '') : '',
      reinforcementFrequency: frequency,
      reinforcementCount: planText(plan, 'reinforcement_count'),
      reinforcementAmount: planText(plan, 'reinforcement_amount'),
      firstReinforcementDate: planText(plan, 'first_reinforcement_date')
        || suggestedReinforcementDate(proposalDate, frequency),
      keysAmount: planText(plan, 'keys_amount'),
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
    if (!form.leadId || !form.developmentId) {
      setError('Selecione o lead e o empreendimento.');
      return;
    }
    if (scheduleWarnings.length > 0) {
      setError(scheduleWarnings[0]);
      return;
    }
    if (calculations.proposedPrice <= 0) {
      setError('Preencha o fluxo de pagamento.');
      return;
    }
    const calculatedScheduleTotal = scheduleItemsTotal(calculations.scheduleItems);
    if (Math.abs(calculatedScheduleTotal - calculations.nominalTotal) > 0.01) {
      setError('O cronograma não confere com o valor total da proposta. Revise o fluxo de pagamento antes de salvar.');
      return;
    }
    if (form.origin === 'corretor' && !form.clientName.trim()) {
      setError('Informe o cliente final apresentado pelo corretor.');
      return;
    }
    if (form.monthlyMode === 'dividido' && integerValue(form.beforeKeysCount) > maxBeforeKeysCount) {
      setError(`Há no máximo ${maxBeforeKeysCount} parcelas mensais entre a proposta e as chaves.`);
      return;
    }
    if (integerValue(form.reinforcementCount) > 0 && !form.firstReinforcementDate) {
      setError('Informe a data do primeiro reforço.');
      return;
    }

    const pdfWindow = window.open('', '_blank');
    if (pdfWindow) {
      pdfWindow.document.title = 'Gerando proposta';
      pdfWindow.document.body.innerHTML = '<p style="font-family:Arial;padding:24px">Gerando PDF da proposta…</p>';
    }
    setSaving(true);

    try {
      const leadName = selectedLead?.name ?? 'Lead não identificado';
      const clientName = form.origin === 'cliente' ? leadName : form.clientName.trim();
      const nextActionDueAt = form.nextActionDueAt ? new Date(form.nextActionDueAt).toISOString() : null;
      const beforeItem = calculations.scheduleItems.find((item) => item.kind === 'parcela_ate_chaves');
      const afterItem = calculations.scheduleItems.find((item) => item.kind === 'parcela_pos_chaves');
      const paymentPlan = {
        proposal_date: form.proposalDate,
        delivery_date: deliveryDate,
        entry_total: calculations.entryTotal,
        monthly_mode: form.monthlyMode,
        monthly_count: form.monthlyMode === 'unificado' ? integerValue(form.monthlyCount) : calculations.monthlyBeforeCount + calculations.monthlyAfterCount,
        monthly_amount: form.monthlyMode === 'unificado' ? numberValue(form.monthlyAmount) : null,
        has_before_keys_monthly: calculations.monthlyBeforeCount > 0,
        before_keys_count: beforeItem?.quantity ?? 0,
        before_keys_amount: beforeItem?.amount ?? 0,
        before_keys_first_date: beforeItem?.startDate || null,
        has_after_keys_monthly: calculations.monthlyAfterCount > 0,
        after_keys_count: afterItem?.quantity ?? 0,
        after_keys_amount: afterItem?.amount ?? 0,
        after_keys_first_date: afterItem?.startDate || null,
        reinforcement_frequency: form.reinforcementFrequency,
        reinforcement_count: integerValue(form.reinforcementCount),
        reinforcement_amount: numberValue(form.reinforcementAmount),
        first_reinforcement_date: form.firstReinforcementDate || null,
        keys_amount: numberValue(form.keysAmount),
      };
      const snapshot: ProposalSnapshot = {
        workflow_status: form.workflowStatus,
        origin: form.origin,
        lead_name: leadName,
        client_name: clientName,
        development_name: selectedDevelopment?.name ?? '',
        unit_code: selectedUnit?.unit_code ?? '',
        responsible_name: currentUserName,
        proposal_date: form.proposalDate,
        delivery_date: deliveryDate,
        paid_until_keys_amount: calculations.paidUntilKeys,
        paid_until_keys_percent: calculations.paidUntilKeysPercent,
        nominal_total: calculations.nominalTotal,
        discount_percent: calculations.discountPercent,
        schedule_items: calculations.scheduleItems,
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

      let saved: Proposal;
      if (editingId) {
        const current = proposals.find((proposal) => proposal.id === editingId);
        const { data, error: updateError } = await supabase.from('proposals')
          .update({ ...payload, version: (current?.version ?? 1) + 1 })
          .eq('id', editingId)
          .eq('organization_id', organizationId)
          .select('*')
          .single();
        if (updateError) throw updateError;
        saved = data as Proposal;
      } else {
        const { data, error: insertError } = await supabase.from('proposals')
          .insert({ ...payload, created_by: currentUserId })
          .select('*')
          .single();
        if (insertError) throw insertError;
        saved = data as Proposal;
      }

      const { error: deleteItemsError } = await supabase.from('proposal_payment_items').delete().eq('proposal_id', saved.id);
      if (deleteItemsError) throw deleteItemsError;
      const items = calculations.scheduleItems.map((item, index) => ({
        organization_id: organizationId,
        proposal_id: saved.id,
        kind: item.kind,
        label: item.label,
        quantity: item.quantity,
        amount: item.amount,
        start_date: item.startDate || null,
        interval_months: item.intervalMonths,
        sort_order: index + 1,
        metadata: {
          paid_until_keys_quantity: item.paidUntilKeysQuantity,
          paid_until_keys_amount: item.paidUntilKeysAmount,
        },
      }));
      if (items.length) {
        const { error: itemsError } = await supabase.from('proposal_payment_items').insert(items);
        if (itemsError) throw itemsError;
      }

      const activityTitle = editingId
        ? `Proposta #${saved.proposal_number} atualizada`
        : `Proposta #${saved.proposal_number} criada`;
      const unitDescription = selectedUnit ? ` · unidade ${selectedUnit.unit_code}` : '';
      const { error: activityError } = await supabase.from('activities').insert({
        organization_id: organizationId,
        lead_id: form.leadId,
        user_id: currentUserId,
        type: 'proposta',
        title: activityTitle,
        description: `${selectedDevelopment?.name ?? 'Empreendimento'}${unitDescription} · ${money.format(calculations.proposedPrice)} · ${statusLabels[form.workflowStatus]}.`,
        metadata: { proposal_id: saved.id, proposal_number: saved.proposal_number, ...snapshot },
      });
      if (activityError) throw activityError;

      setProposals((current) => editingId
        ? current.map((proposal) => proposal.id === saved.id ? saved : proposal)
        : [saved, ...current]);
      setEditingId(saved.id);
      setNotice('Proposta salva, registrada no histórico e PDF gerado.');
      const pdfUrl = `/api/propostas/${saved.id}/pdf`;
      if (pdfWindow) pdfWindow.location.href = pdfUrl;
      else window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      if (pdfWindow) pdfWindow.close();
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
        .eq('id', proposal.id)
        .eq('organization_id', organizationId)
        .select('*')
        .single();
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
      Status: statusLabels[workflowOf(proposal)],
      Responsável: String(proposal.snapshot?.responsible_name ?? ''),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Propostas');
    XLSX.writeFile(workbook, `propostas-bossa-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return <div className="page-content">
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    {mode === 'list'
      ? <ProposalList
          proposals={proposals}
          filteredProposals={filteredProposals}
          developments={developments}
          canEdit={canEdit}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          developmentFilter={developmentFilter}
          setDevelopmentFilter={setDevelopmentFilter}
          sentCount={sentCount}
          activeValue={activeValue}
          approvedValue={approvedValue}
          onNew={startNew}
          onExport={() => void exportXlsx()}
          onEdit={editProposal}
          onChangeStatus={(proposal, status) => void changeStatus(proposal, status)}
        />
      : <ProposalEditor
          form={form}
          setField={setField}
          chooseOrigin={chooseOrigin}
          chooseLead={chooseLead}
          chooseDevelopment={chooseDevelopment}
          chooseUnit={chooseUnit}
          chooseMonthlyMode={chooseMonthlyMode}
          chooseReinforcementFrequency={chooseReinforcementFrequency}
          developments={developments}
          availableLeads={availableLeads}
          developmentUnits={developmentUnits}
          selectedLead={selectedLead}
          selectedDevelopment={selectedDevelopment}
          selectedUnit={selectedUnit}
          deliveryDate={deliveryDate}
          firstMonthlyDate={firstMonthlyDate}
          firstAfterKeysDate={firstAfterKeysDate}
          maxBeforeKeysCount={maxBeforeKeysCount}
          calculations={calculations}
          scheduleWarnings={scheduleWarnings}
          canEdit={canEdit}
          saving={saving}
          editingId={editingId}
          onCancel={() => setMode('list')}
          onSubmit={saveProposal}
        />}
  </div>;
}
