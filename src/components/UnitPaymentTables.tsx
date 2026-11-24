'use client';

import { useState } from 'react';
import { cashPriceCents, PAYMENT_TABLE_LABELS, PAYMENT_TABLE_TERMS, readPaymentTablePolicy, unitPaymentTables, type PaymentTableId } from '@/lib/unit-payment-tables';
import type { Development, DevelopmentUnit } from './DevelopmentsManager';

const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function UnitPaymentTables({ development, units }: { development: Development; units: DevelopmentUnit[] }) {
  const [mode, setMode] = useState<PaymentTableId>('cash');
  const policy = readPaymentTablePolicy(development.default_payment_plan);
  if (!policy) return null;
  const available = units.filter((unit) => unit.status === 'disponivel');
  const discount = 100 * (1 - policy.cash_basis_cents / policy.list_basis_cents);
  const month = new Date(`${policy.handover_month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  return <section className="card" style={{ marginBottom: 16 }}>
    <div className="card-head"><div><h3>Quatro condições de venda</h3><small className="muted">{development.name} · {available.length} unidades disponíveis</small></div><span className="chip chip-green">Consulta da Nara atualizada</span></div>
    <div className="card-body" style={{ display: 'grid', gap: 14 }}>
      <div role="group" aria-label="Condição de pagamento" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(PAYMENT_TABLE_LABELS) as PaymentTableId[]).map((id) => <button key={id} type="button" aria-pressed={mode === id} className={`btn ${mode === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode(id)}>{PAYMENT_TABLE_LABELS[id]}</button>)}
      </div>
      <div className="info-box" style={{ margin: 0 }}>
        {mode === 'cash' ? `Pagamento integral. Desconto de ${discount.toLocaleString('pt-BR', { maximumFractionDigits: 5 })}% sobre a tabela parcelada do CRM.`
          : <>{PAYMENT_TABLE_TERMS} Chaves previstas: {month}. {mode === 'months36' ? 'Esta modalidade não tem pagamento nas chaves.' : ''}</>}
      </div>
      <div className="table-wrap" style={{ overflowX: 'auto' }}><table>
        <thead><tr><th>Unidade</th><th>{mode === 'cash' ? 'Valor à vista' : 'Total-base'}</th><th>Entrada</th><th>Mensais</th><th>Reforços anuais</th><th>Chaves</th></tr></thead>
        <tbody>{available.map((unit) => {
          const quote = unitPaymentTables(unit, policy).find((item) => item.id === mode);
          if (!quote) return null;
          const canShow = quote.complete || mode === 'current';
          return <tr key={unit.id}>
            <td><strong>{unit.unit_code}</strong></td>
            <td><strong>{quote.totalCents > 0 ? brl(quote.totalCents) : 'A confirmar'}</strong>{!quote.complete && <small style={{ display: 'block', maxWidth: 240 }}>{quote.issue}</small>}{mode === 'cash' && <small className="muted" style={{ display: 'block' }}>Economia: {brl(Math.round(Number(unit.list_price) * 100) - (cashPriceCents(unit, policy) ?? 0))}</small>}</td>
            <td>{canShow ? brl(quote.entryCents) : '—'}</td>
            <td>{canShow && quote.installmentCount > 0 ? <>{quote.installmentCount} × {brl(quote.installmentCents)}{quote.lastInstallmentCents !== quote.installmentCents && <small className="muted" style={{ display: 'block' }}>Última: {brl(quote.lastInstallmentCents)}</small>}</> : '—'}</td>
            <td>{canShow && quote.reinforcementCount > 0 ? `${quote.reinforcementCount} × ${brl(quote.reinforcementCents)}` : '—'}</td>
            <td>{canShow && quote.keysCents > 0 ? brl(quote.keysCents) : '—'}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <small className="muted">Base de cálculo: {policy.valuation_date.split('-').reverse().join('/')}. Reforços mantidos por unidade. A última mensal ajusta os centavos. A impressão das quatro modalidades está disponível no painel de impressão ao final desta página.</small>
    </div>
  </section>;
}
