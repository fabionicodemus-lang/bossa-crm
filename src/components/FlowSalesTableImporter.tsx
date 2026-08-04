'use client';

import { useMemo, useState } from 'react';
import flowRowsData from '@/data/flow-sales-table-2026-05.json';
import { createClient } from '@/lib/supabase/client';
import type { Development, DevelopmentTypology, DevelopmentUnit } from './DevelopmentsManager';

type FlowSalesTableRow = {
  floor: number;
  unitCode: string;
  typologyCode: string;
  privateAreaM2: number;
  listPrice: number;
  entryAmount: number;
  installmentCount: number;
  installmentAmount: number;
  reinforcementCount: number;
  reinforcementAmount: number;
  keysAmount: number;
};

type LinkedProposalRow = { unit_id: string | null };
type AppliedUnitRow = { id: string; unit_code: string; list_price: number | string };

const flowRows = flowRowsData as FlowSalesTableRow[];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SOURCE_FILE = 'Flow Aptos · tabela vigente maio/2026 (imagem enviada)';
const TABLE_REFERENCE = '2026-05';
const LEGACY_DUPLICATE_CODES = new Set(['2302D', '2303D']);

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Erro inesperado.');
  }
  return 'Erro inesperado.';
}

export function FlowSalesTableImporter({
  organizationId,
  canEdit,
  developments,
  typologies,
  units,
}: {
  organizationId: string;
  canEdit: boolean;
  developments: Development[];
  typologies: DevelopmentTypology[];
  units: DevelopmentUnit[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const flow = developments.find((item) => item.slug === 'flow-aptos')
    ?? developments.find((item) => normalizeText(item.name).includes('flow'))
    ?? null;
  const flowUnits = flow ? units.filter((item) => item.development_id === flow.id) : [];
  const flowTypologies = flow ? typologies.filter((item) => item.development_id === flow.id && item.active) : [];
  const typologyByCode = new Map(flowTypologies.map((item) => [item.code.trim().toUpperCase(), item]));
  const listedCodes = new Set(flowRows.map((row) => row.unitCode));
  const requiredTypologyCodes = [...new Set(flowRows.map((row) => row.typologyCode))];
  const missingTypologies = requiredTypologyCodes.filter((code) => !typologyByCode.has(code));
  const currentlyAvailableButUnlisted = flowUnits.filter((item) => item.status === 'disponivel' && !listedCodes.has(item.unit_code.trim()));
  const legacyDuplicates = flowUnits.filter((item) => LEGACY_DUPLICATE_CODES.has(item.unit_code.trim()));
  const missingUnits = flowRows.filter((row) => !flowUnits.some((item) => item.unit_code.trim() === row.unitCode));
  const availableVgv = flowRows.reduce((total, row) => total + row.listPrice, 0);

  if (!canEdit || !flow) return null;
  const flowId = flow.id;
  const flowDefaultPaymentPlan = flow.default_payment_plan;

  async function applyTable() {
    if (missingTypologies.length > 0) {
      setError(`Cadastre primeiro as tipologias do Flow: ${missingTypologies.join(', ')}.`);
      return;
    }

    const hideMessage = currentlyAvailableButUnlisted.length > 0
      ? `\n\n${currentlyAvailableButUnlisted.length} unidade(s) atualmente disponíveis e ausentes nesta tabela serão ocultadas e terão os valores zerados.`
      : '';
    const createMessage = missingUnits.length > 0
      ? `\n${missingUnits.length} unidade(s) que não existem no cadastro serão criadas.`
      : '';

    if (!window.confirm(
      `Aplicar a tabela vigente de maio/2026 nas ${flowRows.length} unidades disponíveis do Flow?\n\n` +
      'Os valores de total, entrada, 60 parcelas, 5 reforços anuais e chaves serão copiados exatamente da imagem enviada.' +
      hideMessage + createMessage +
      '\nAs unidades legadas 2302D e 2303D serão removidas somente quando não estiverem vinculadas a propostas.',
    )) return;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const appliedAt = new Date().toISOString();
      const obsoleteIds = currentlyAvailableButUnlisted.map((item) => item.id);
      if (obsoleteIds.length > 0) {
        const { error: hideError } = await supabase.from('development_units').update({
          status: 'oculto',
          list_price: 0,
          entry_amount: 0,
          installment_count: 0,
          installment_amount: 0,
          reinforcement_count: 0,
          reinforcement_amount: 0,
          keys_amount: 0,
        }).eq('organization_id', organizationId).eq('development_id', flowId).in('id', obsoleteIds);
        if (hideError) throw hideError;
      }

      if (legacyDuplicates.length > 0) {
        const legacyIds = legacyDuplicates.map((item) => item.id);
        const { data: linkedRows, error: linkedError } = await supabase.from('proposals')
          .select('unit_id').eq('organization_id', organizationId).in('unit_id', legacyIds);
        if (linkedError) throw linkedError;
        const linkedIds = new Set<string>(
          ((linkedRows ?? []) as LinkedProposalRow[])
            .map((item) => item.unit_id)
            .filter((id): id is string => Boolean(id)),
        );
        const deletableIds = legacyIds.filter((id) => !linkedIds.has(id));
        if (deletableIds.length > 0) {
          const { error: deleteError } = await supabase.from('development_units')
            .delete().eq('organization_id', organizationId).eq('development_id', flowId).in('id', deletableIds);
          if (deleteError) throw deleteError;
        }
      }

      const currentByCode = new Map(flowUnits.map((item) => [item.unit_code.trim(), item]));
      const payload = flowRows.map((row) => {
        const existing = currentByCode.get(row.unitCode);
        const typology = typologyByCode.get(row.typologyCode)!;
        return {
          organization_id: organizationId,
          development_id: flowId,
          typology_id: typology.id,
          unit_code: row.unitCode,
          floor: row.floor,
          status: 'disponivel',
          private_area_m2: row.privateAreaM2,
          list_price: row.listPrice,
          entry_amount: row.entryAmount,
          installment_count: row.installmentCount,
          installment_amount: row.installmentAmount,
          reinforcement_count: row.reinforcementCount,
          reinforcement_amount: row.reinforcementAmount,
          keys_amount: row.keysAmount,
          payment_plan: {
            ...(existing?.payment_plan ?? {}),
            table_source: SOURCE_FILE,
            table_reference: TABLE_REFERENCE,
            entry_percent: 20,
            installment_total_percent: 30,
            reinforcement_total_percent: 30,
            keys_percent: 20,
            imported_at: appliedAt,
          },
          notes: existing?.notes ?? null,
        };
      });

      const { data, error: upsertError } = await supabase.from('development_units')
        .upsert(payload, { onConflict: 'development_id,unit_code' })
        .select('id,unit_code,list_price');
      if (upsertError) throw upsertError;
      if ((data ?? []).length !== flowRows.length) {
        throw new Error(`O banco confirmou ${(data ?? []).length} de ${flowRows.length} unidades do Flow.`);
      }

      const { error: developmentError } = await supabase.from('developments').update({
        default_payment_plan: {
          ...(flowDefaultPaymentPlan ?? {}),
          currency: 'BRL',
          entry_percent: 20,
          installment_count: 60,
          installment_total_percent: 30,
          reinforcement_count: 5,
          reinforcement_total_percent: 30,
          keys_percent: 20,
          table_source: SOURCE_FILE,
          table_reference: TABLE_REFERENCE,
        },
      }).eq('id', flowId).eq('organization_id', organizationId);
      if (developmentError) throw developmentError;

      const appliedRows = (data ?? []) as AppliedUnitRow[];
      const unit1601 = appliedRows.find((item) => item.unit_code === '1601');
      if (!unit1601 || Number(unit1601.list_price) !== 1_406_450) {
        throw new Error('A conferência final da unidade 1601 não retornou o valor esperado de R$ 1.406.450,00.');
      }

      setNotice(`${flowRows.length} unidades disponíveis do Flow atualizadas com os valores exatos. Recarregando…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setError(errorText(caught));
      setSaving(false);
    }
  }

  return <section className="card" style={{ marginBottom: 16 }}>
    <div className="card-head">
      <div>
        <h3>Aplicar tabela de vendas do Flow</h3>
        <small className="muted">Tabela vigente maio/2026 · valores copiados exatamente da imagem</small>
      </div>
      <span className="chip chip-orange">{flowRows.length} disponíveis</span>
    </div>
    <div className="card-body">
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="success-box" style={{ marginBottom: 12 }}>{notice}</div>}
      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <div className="kpi"><div className="kpi-label">Unidades da tabela</div><div className="kpi-value">{flowRows.length}</div></div>
        <div className="kpi"><div className="kpi-label">VGV disponível</div><div className="kpi-value" style={{ fontSize: 18 }}>{money.format(availableVgv)}</div></div>
        <div className="kpi"><div className="kpi-label">Novas no cadastro</div><div className="kpi-value">{missingUnits.length}</div></div>
        <div className="kpi"><div className="kpi-label">Disponíveis a ocultar</div><div className="kpi-value">{currentlyAvailableButUnlisted.length}</div></div>
      </div>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        Condição da tabela: 20% de entrada, 60 parcelas totalizando 30%, 5 reforços anuais totalizando 30% e 20% nas chaves. Nenhuma unidade vinculada a proposta será excluída.
      </p>
      {missingTypologies.length > 0 && <div className="error-box" style={{ marginBottom: 12 }}>
        Tipologias ausentes: {missingTypologies.join(', ')}.
      </div>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={saving || missingTypologies.length > 0}
        onClick={() => void applyTable()}
      >
        {saving ? 'Aplicando tabela…' : 'Aplicar valores na tabela do Flow'}
      </button>
    </div>
  </section>;
}
