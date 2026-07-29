'use client';

import Link from 'next/link';
import type React from 'react';
import {
  date,
  dateFromIso,
  integerValue,
  money,
  MoneyInput,
  ToggleButton,
  type MonthlyMode,
  type Origin,
  type ProposalCalculations,
  type ProposalDevelopment,
  type ProposalForm,
  type ProposalLead,
  type ProposalUnit,
  type ReinforcementFrequency,
  statusLabels,
  type WorkflowStatus,
} from './model';

export function ProposalEditor({
  form,
  setField,
  chooseOrigin,
  chooseLead,
  chooseDevelopment,
  chooseUnit,
  chooseMonthlyMode,
  chooseReinforcementFrequency,
  developments,
  availableLeads,
  developmentUnits,
  selectedLead,
  selectedDevelopment,
  selectedUnit,
  deliveryDate,
  firstMonthlyDate,
  firstAfterKeysDate,
  maxBeforeKeysCount,
  calculations,
  canEdit,
  saving,
  editingId,
  onCancel,
  onSubmit,
}: {
  form: ProposalForm;
  setField: <K extends keyof ProposalForm>(key: K, value: ProposalForm[K]) => void;
  chooseOrigin: (origin: Origin) => void;
  chooseLead: (leadId: string) => void;
  chooseDevelopment: (developmentId: string) => void;
  chooseUnit: (unitId: string) => void;
  chooseMonthlyMode: (mode: MonthlyMode) => void;
  chooseReinforcementFrequency: (frequency: ReinforcementFrequency) => void;
  developments: ProposalDevelopment[];
  availableLeads: ProposalLead[];
  developmentUnits: ProposalUnit[];
  selectedLead: ProposalLead | null;
  selectedDevelopment: ProposalDevelopment | null;
  selectedUnit: ProposalUnit | null;
  deliveryDate: string | null;
  firstMonthlyDate: string;
  firstAfterKeysDate: string;
  maxBeforeKeysCount: number;
  calculations: ProposalCalculations;
  canEdit: boolean;
  saving: boolean;
  editingId: string | null;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <form onSubmit={onSubmit}>
    <div className="page-head">
      <div><h2>{editingId ? 'Editar proposta' : 'Nova proposta'}</h2><p>O valor da proposta e o percentual interno até as chaves são calculados automaticamente pelas datas.</p></div>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>← Voltar para propostas</button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 14, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <section className="card">
          <div className="card-head"><h3>1. Origem e produto</h3></div>
          <div className="card-body">
            <div className="grid grid-2">
              <div className="field"><label>Origem da proposta</label><select className="select" value={form.origin} onChange={(event) => chooseOrigin(event.target.value as Origin)} disabled={!canEdit}><option value="cliente">Cliente direto</option><option value="corretor">Corretor / imobiliária</option></select></div>
              <div className="field"><label>{form.origin === 'cliente' ? 'Lead do cliente' : 'Lead do corretor'}</label><select className="select" value={form.leadId} onChange={(event) => chooseLead(event.target.value)} disabled={!canEdit}><option value="">Selecione…</option>{availableLeads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` · ${lead.company}` : ''}</option>)}</select></div>
              {form.origin === 'corretor' && <div className="field"><label>Cliente final apresentado</label><input className="input" value={form.clientName} onChange={(event) => setField('clientName', event.target.value)} disabled={!canEdit} /></div>}
              <div className="field"><label>Data da proposta</label><input className="input" type="date" value={form.proposalDate} readOnly style={{ background: 'var(--bg)' }} /><small className="faint">Definida automaticamente no dia da criação.</small></div>
              <div className="field"><label>Empreendimento</label><select className="select" value={form.developmentId} onChange={(event) => chooseDevelopment(event.target.value)} disabled={!canEdit}><option value="">Selecione…</option>{developments.map((development) => <option key={development.id} value={development.id}>{development.name}{development.delivery_date ? '' : ' · sem entrega'}</option>)}</select></div>
              <div className="field"><label>Unidade</label><select className="select" value={form.unitId} onChange={(event) => chooseUnit(event.target.value)} disabled={!canEdit || !form.developmentId}><option value="">Sem unidade específica</option>{developmentUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_code} · {money.format(unit.list_price)} · {unit.status}</option>)}</select></div>
            </div>
            {selectedDevelopment && !deliveryDate && <div className="error-box" style={{ marginTop: 12 }}>O empreendimento não possui Data da Entrega. Cadastre-a antes de salvar a proposta.</div>}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>2. Valores e fluxo de pagamento</h3></div>
          <div className="card-body">
            <div className="grid grid-3">
              <div className="field"><label>Valor de tabela</label><MoneyInput value={form.listPrice} onChange={(value) => setField('listPrice', value)} disabled={!canEdit} /></div>
              <div className="field"><label>Valor proposto · calculado</label><MoneyInput value={String(calculations.proposedPrice || '')} onChange={() => undefined} readOnly /></div>
              <div className="field"><label>Validade</label><input className="input" type="date" value={form.validUntil} onChange={(event) => setField('validUntil', event.target.value)} disabled={!canEdit} /></div>
            </div>

            <div className="card" style={{ boxShadow: 'none', marginTop: 14 }}>
              <div className="card-head"><h3>Entrada e chaves</h3><span className="chip">Pagamentos diretos</span></div>
              <div className="card-body grid grid-2">
                <div className="field"><label>Entrada direta · vencimento na data da proposta</label><MoneyInput value={form.entryTotal} onChange={(value) => setField('entryTotal', value)} disabled={!canEdit} /></div>
                <div className="field"><label>Parcela nas chaves · {deliveryDate ? date.format(dateFromIso(deliveryDate)) : 'cadastre a entrega'}</label><MoneyInput value={form.keysAmount} onChange={(value) => setField('keysAmount', value)} disabled={!canEdit} /></div>
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none', marginTop: 14 }}>
              <div className="card-head">
                <div><h3>Parcelas mensais</h3><small className="faint">No padrão, informe uma única quantidade e um único valor.</small></div>
                <ToggleButton
                  active={form.monthlyMode === 'dividido'}
                  onClick={() => chooseMonthlyMode(form.monthlyMode === 'unificado' ? 'dividido' : 'unificado')}
                  disabled={!canEdit}
                >
                  {form.monthlyMode === 'unificado' ? 'Usar valores diferentes' : 'Voltar para valor único'}
                </ToggleButton>
              </div>
              <div className="card-body">
                {form.monthlyMode === 'unificado' ? <>
                  <div className="grid grid-3">
                    <div className="field"><label>Quantidade total de mensais</label><input className="input" type="number" min="0" value={form.monthlyCount} onChange={(event) => setField('monthlyCount', event.target.value)} disabled={!canEdit} /></div>
                    <div className="field"><label>Valor de cada mensal</label><MoneyInput value={form.monthlyAmount} onChange={(value) => setField('monthlyAmount', value)} disabled={!canEdit} /></div>
                    <div className="field"><label>Primeiro vencimento</label><input className="input" type="date" value={firstMonthlyDate} readOnly style={{ background: 'var(--bg)' }} /></div>
                  </div>
                  <div className="info-box" style={{ marginTop: 12 }}>
                    Pelo calendário atual, o sistema classificará automaticamente <strong>{calculations.monthlyBeforeCount}</strong> mensal(is) até as chaves e <strong>{calculations.monthlyAfterCount}</strong> depois das chaves.
                  </div>
                </> : <>
                  <div className="grid grid-3">
                    <div className="field"><label>Até as chaves · quantidade</label><input className="input" type="number" min="0" max={maxBeforeKeysCount || undefined} value={form.beforeKeysCount} onChange={(event) => setField('beforeKeysCount', event.target.value)} disabled={!canEdit} /></div>
                    <div className="field"><label>Até as chaves · valor</label><MoneyInput value={form.beforeKeysAmount} onChange={(value) => setField('beforeKeysAmount', value)} disabled={!canEdit} /></div>
                    <div className="field"><label>Primeiro vencimento</label><input className="input" type="date" value={firstMonthlyDate} readOnly style={{ background: 'var(--bg)' }} /></div>
                    <div className="field"><label>Depois das chaves · quantidade</label><input className="input" type="number" min="0" value={form.afterKeysCount} onChange={(event) => setField('afterKeysCount', event.target.value)} disabled={!canEdit} /></div>
                    <div className="field"><label>Depois das chaves · valor</label><MoneyInput value={form.afterKeysAmount} onChange={(value) => setField('afterKeysAmount', value)} disabled={!canEdit} /></div>
                    <div className="field"><label>Primeiro vencimento pós-chaves</label><input className="input" type="date" value={firstAfterKeysDate} readOnly style={{ background: 'var(--bg)' }} /></div>
                  </div>
                  <div className="info-box" style={{ marginTop: 12 }}>Use este modo somente quando o valor das parcelas mudar após a entrega. Até as chaves cabem no máximo <strong>{maxBeforeKeysCount}</strong> mensais.</div>
                </>}
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none', marginTop: 14 }}>
              <div className="card-head"><h3>Reforços</h3><div className="page-actions"><ToggleButton active={form.reinforcementFrequency === 'anual'} onClick={() => chooseReinforcementFrequency('anual')} disabled={!canEdit}>Anuais</ToggleButton><ToggleButton active={form.reinforcementFrequency === 'semestral'} onClick={() => chooseReinforcementFrequency('semestral')} disabled={!canEdit}>Semestrais</ToggleButton></div></div>
              <div className="card-body grid grid-3">
                <div className="field"><label>Quantidade</label><input className="input" type="number" min="0" value={form.reinforcementCount} onChange={(event) => setField('reinforcementCount', event.target.value)} disabled={!canEdit} /></div>
                <div className="field"><label>Valor de cada reforço</label><MoneyInput value={form.reinforcementAmount} onChange={(value) => setField('reinforcementAmount', value)} disabled={!canEdit} /></div>
                <div className="field"><label>Data do primeiro reforço {form.reinforcementFrequency}</label><input className="input" type="date" value={form.firstReinforcementDate} onChange={(event) => setField('firstReinforcementDate', event.target.value)} disabled={!canEdit || integerValue(form.reinforcementCount) === 0} /><small className="faint">Sugerida automaticamente em {form.reinforcementFrequency === 'anual' ? '12' : '6'} meses.</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3>3. Cronograma calculado</h3><span className="chip">Até a entrega entra no percentual interno</span></div>
          <div className="table-wrap"><table><thead><tr><th>Pagamento</th><th>Qtd.</th><th>Valor</th><th>Primeiro vencimento</th><th>Total</th><th>Até chaves</th></tr></thead><tbody>
            {calculations.scheduleItems.length === 0 && <tr><td colSpan={6}><div className="empty-state">Preencha o fluxo para visualizar o cronograma.</div></td></tr>}
            {calculations.scheduleItems.map((item) => <tr key={`${item.kind}-${item.startDate}`}><td><strong>{item.label}</strong></td><td>{item.quantity}</td><td>{money.format(item.amount)}</td><td>{item.startDate ? date.format(dateFromIso(item.startDate)) : '—'}</td><td><strong>{money.format(item.total)}</strong></td><td>{item.paidUntilKeysQuantity} · {money.format(item.paidUntilKeysAmount)}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="card">
          <div className="card-head"><h3>4. Acompanhamento</h3></div>
          <div className="card-body"><div className="grid grid-2">
            <div className="field"><label>Status</label><select className="select" value={form.workflowStatus} onChange={(event) => setField('workflowStatus', event.target.value as WorkflowStatus)} disabled={!canEdit}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
            <div className="field"><label>Próxima ação</label><input className="input" value={form.nextAction} onChange={(event) => setField('nextAction', event.target.value)} disabled={!canEdit} /></div>
            <div className="field"><label>Data da próxima ação</label><input className="input" type="datetime-local" value={form.nextActionDueAt} onChange={(event) => setField('nextActionDueAt', event.target.value)} disabled={!canEdit} /></div>
            <div className="field"><label>Observações e condições especiais</label><textarea className="textarea" value={form.notes} onChange={(event) => setField('notes', event.target.value)} disabled={!canEdit} /></div>
          </div></div>
        </section>
      </div>

      <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 86 }}>
        <section className="card"><div className="card-head"><h3>Resumo financeiro</h3></div><div className="card-body info-list">
          <div className="info-row"><span>Valor de tabela</span><strong>{money.format(calculations.listPrice)}</strong></div>
          <div className="info-row"><span>Valor proposto</span><strong>{money.format(calculations.proposedPrice)}</strong></div>
          <div className="info-row"><span>Desconto</span><strong>{money.format(calculations.discountAmount)} · {calculations.discountPercent.toFixed(2)}%</strong></div>
          <div className="info-row"><span>Pago até as chaves</span><strong>{money.format(calculations.paidUntilKeys)}</strong></div>
          <div className="info-row"><span>% até as chaves</span><strong>{calculations.paidUntilKeysPercent.toFixed(2)}%</strong></div>
          <div className="info-row"><span>Total do fluxo</span><strong>{money.format(calculations.nominalTotal)}</strong></div>
          <div className="info-row"><span>Diferença para tabela</span><strong style={{ color: calculations.differenceFromTable > 0.01 ? 'var(--red)' : 'var(--green)' }}>{money.format(calculations.differenceFromTable)}</strong></div>
        </div></section>
        <section className="card"><div className="card-body">
          <div className="faint" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>Ao salvar, a proposta entra na planilha, no histórico de <strong>{selectedLead?.name ?? 'selecione um lead'}</strong> e o PDF é aberto automaticamente.</div>
          {selectedLead && <Link className="btn btn-ghost btn-block" href={`/leads/${selectedLead.id}`}>Abrir ficha do lead</Link>}
          {editingId && <a className="btn btn-ghost btn-block" style={{ marginTop: 8 }} href={`/api/propostas/${editingId}/pdf`} target="_blank" rel="noreferrer">Abrir PDF atual</a>}
          {canEdit && <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={saving}>{saving ? 'Salvando e gerando PDF…' : editingId ? 'Salvar nova versão e abrir PDF' : 'Criar proposta e abrir PDF'}</button>}
        </div></section>
      </aside>
    </div>
  </form>;
}
