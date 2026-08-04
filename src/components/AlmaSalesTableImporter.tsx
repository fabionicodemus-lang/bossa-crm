'use client';

import { useMemo, useState } from 'react';
import almaRowsData from '@/data/alma-sales-table-2026-08.json';
import { createClient } from '@/lib/supabase/client';
import type { Development, DevelopmentTypology, DevelopmentUnit } from './DevelopmentsManager';

type SourceStatus = 'disponivel' | 'reservado' | 'permutante';

type AlmaSalesTableRow = {
  floor: number;
  unitCode: string;
  typologyCode: string;
  sourceStatus: SourceStatus;
  listPrice: number;
};

const almaRows = almaRowsData as AlmaSalesTableRow[];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SOURCE_FILE = 'Tabela_Alma_Unidades_Valores(1).xlsx';
const TABLE_REFERENCE = '2026-08';

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function commercialValues(row: AlmaSalesTableRow) {
  if (row.sourceStatus !== 'disponivel') {
    return {
      list_price: 0,
      entry_amount: 0,
      installment_count: 0,
      installment_amount: 0,
      reinforcement_count: 0,
      reinforcement_amount: 0,
      keys_amount: 0,
    };
  }

  return {
    list_price: roundMoney(row.listPrice),
    entry_amount: roundMoney(row.listPrice * 0.15),
    installment_count: 80,
    installment_amount: roundMoney((row.listPrice * 0.32) / 80),
    reinforcement_count: 7,
    reinforcement_amount: roundMoney((row.listPrice * 0.43) / 7),
    keys_amount: roundMoney(row.listPrice * 0.1),
  };
}

function permutanteNote(current: string | null) {
  if (current && normalizeText(current).includes('permutante')) return current;
  return [current, 'Permutante'].filter(Boolean).join(' · ');
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Erro inesperado.');
  }
  return 'Erro inesperado.';
}

export function AlmaSalesTableImporter({
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

  const alma = developments.find((item) => normalizeText(item.name).includes('alma')) ?? null;
  const almaUnits = alma ? units.filter((item) => item.development_id === alma.id) : [];
  const unitsByCode = new Map(almaUnits.map((item) => [item.unit_code.trim(), item]));
  const almaTypologies = alma ? typologies.filter((item) => item.development_id === alma.id && item.active) : [];
  const typologyByCode = new Map(almaTypologies.map((item) => [item.code.trim(), item]));
  const missingRows = almaRows.filter((row) => !unitsByCode.has(row.unitCode));
  const availableCount = almaRows.filter((row) => row.sourceStatus === 'disponivel').length;
  const reservedCount = almaRows.filter((row) => row.sourceStatus === 'reservado').length;
  const exchangeCount = almaRows.filter((row) => row.sourceStatus === 'permutante').length;
  const availableVgv = almaRows.reduce((total, row) => total + (row.sourceStatus === 'disponivel' ? row.listPrice : 0), 0);

  if (!canEdit || !alma) return null;

  async function applyTable() {
    if (missingRows.length > 0) {
      setError(`Não foi possível aplicar: faltam no cadastro as unidades ${missingRows.map((row) => row.unitCode).join(', ')}.`);
      return;
    }
    if (!window.confirm(
      `Aplicar a tabela de agosto/2026 nas ${almaRows.length} unidades do Alma?\n\n` +
      'As disponíveis receberão 15% de entrada, 80 parcelas (32%), 7 reforços (43%) e 10% nas chaves. ' +
      'Reservadas e permutantes ficarão com todos os valores zerados. As unidades 501 e 502 não serão alteradas.',
    )) return;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const appliedAt = new Date().toISOString();
      const payload = almaRows.map((row) => {
        const unit = unitsByCode.get(row.unitCode)!;
        const typology = typologyByCode.get(row.typologyCode);
        const values = commercialValues(row);

        return {
          id: unit.id,
          organization_id: organizationId,
          development_id: alma.id,
          typology_id: typology?.id ?? unit.typology_id,
          unit_code: unit.unit_code,
          floor: row.floor,
          status: row.sourceStatus === 'permutante' ? 'oculto' : row.sourceStatus,
          private_area_m2: unit.private_area_m2,
          ...values,
          payment_plan: {
            ...(unit.payment_plan ?? {}),
            table_source: SOURCE_FILE,
            table_reference: TABLE_REFERENCE,
            source_status: row.sourceStatus,
            entry_percent: row.sourceStatus === 'disponivel' ? 15 : 0,
            installment_total_percent: row.sourceStatus === 'disponivel' ? 32 : 0,
            reinforcement_total_percent: row.sourceStatus === 'disponivel' ? 43 : 0,
            keys_percent: row.sourceStatus === 'disponivel' ? 10 : 0,
            imported_at: appliedAt,
          },
          notes: row.sourceStatus === 'permutante' ? permutanteNote(unit.notes) : unit.notes,
        };
      });

      const { data, error: upsertError } = await supabase.from('development_units')
        .upsert(payload, { onConflict: 'id' })
        .select('id');
      if (upsertError) throw upsertError;
      if ((data ?? []).length !== almaRows.length) {
        throw new Error(`O banco confirmou ${(data ?? []).length} de ${almaRows.length} unidades. A atualização foi interrompida para conferência.`);
      }

      setNotice(`${almaRows.length} unidades do Alma atualizadas. Recarregando a tabela…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setError(errorText(caught));
      setSaving(false);
    }
  }

  return <section className="card" style={{ marginBottom: 16 }}>
    <div className="card-head">
      <div>
        <h3>Aplicar tabela de vendas do Alma</h3>
        <small className="muted">Fonte: {SOURCE_FILE} · referência agosto/2026</small>
      </div>
      <span className="chip chip-orange">{almaRows.length} unidades</span>
    </div>
    <div className="card-body">
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="success-box" style={{ marginBottom: 12 }}>{notice}</div>}
      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <div className="kpi"><div className="kpi-label">Disponíveis</div><div className="kpi-value">{availableCount}</div></div>
        <div className="kpi"><div className="kpi-label">Reservadas</div><div className="kpi-value">{reservedCount}</div></div>
        <div className="kpi"><div className="kpi-label">Permutantes</div><div className="kpi-value">{exchangeCount}</div></div>
        <div className="kpi"><div className="kpi-label">VGV disponível</div><div className="kpi-value" style={{ fontSize: 18 }}>{money.format(availableVgv)}</div></div>
      </div>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        As unidades 2401 e 2901 serão mantidas como reservadas e com valores zerados. As unidades 501 e 502 não constam na planilha e permanecerão intactas.
      </p>
      {missingRows.length > 0 && <div className="error-box" style={{ marginBottom: 12 }}>
        Unidades da planilha ainda não encontradas no cadastro: {missingRows.map((row) => row.unitCode).join(', ')}.
      </div>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={saving || missingRows.length > 0}
        onClick={() => void applyTable()}
      >
        {saving ? 'Aplicando tabela…' : 'Aplicar valores na tabela do Alma'}
      </button>
    </div>
  </section>;
}
