'use client';

import { useMemo, useState } from 'react';
import { buildPremiumSalesPrintHtml, type PremiumPrintTheme } from '@/lib/premium-sales-table-print';
import { createClient } from '@/lib/supabase/client';
import type { DevelopmentTypology, DevelopmentUnit } from './DevelopmentsManager';

export type SalesTablePrintDevelopment = {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  active: boolean;
};

function themeFor(development: SalesTablePrintDevelopment): PremiumPrintTheme | null {
  const identity = `${development.name} ${development.slug}`.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (identity.includes('flow')) return 'flow';
  if (identity.includes('alma')) return 'alma';
  return null;
}

function isPrintable(unit: DevelopmentUnit) {
  const permutante = String(unit.payment_plan?.source_status ?? '').toLowerCase() === 'permutante'
    || (unit.notes ?? '').toLowerCase().includes('permutante');
  return permutante || ['disponivel', 'reservado', 'em_contrato', 'vendido'].includes(unit.status);
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function SalesTablePrintPanel({
  developments, units, organizationId,
}: {
  developments: SalesTablePrintDevelopment[];
  units: DevelopmentUnit[];
  organizationId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [printingId, setPrintingId] = useState('');
  const [error, setError] = useState('');
  const targets = developments.filter((development) => development.active && themeFor(development))
    .sort((a, b) => Number(themeFor(a) !== 'flow') - Number(themeFor(b) !== 'flow'));

  async function printDevelopment(development: SalesTablePrintDevelopment) {
    const theme = themeFor(development);
    if (!theme) return;
    const popup = window.open('', '_blank', 'width=900,height=1200');
    if (!popup) {
      setError('O navegador bloqueou a janela de impressão. Libere pop-ups para o Bossa CRM e tente novamente.');
      return;
    }
    popup.document.write('<!doctype html><title>Preparando impressão</title><body style="font-family:Arial;padding:32px">Consultando o estoque e preparando a impressão…</body>');
    popup.document.close();
    setPrintingId(development.id);
    setError('');

    try {
      // Requery on every click: another CRM user (or the manager above) may have
      // changed a price or unit status since this page was first loaded.
      const [unitsResult, typologiesResult] = await Promise.all([
        supabase.from('development_units').select('*').eq('organization_id', organizationId)
          .eq('development_id', development.id),
        supabase.from('development_typologies').select('*').eq('organization_id', organizationId)
          .eq('development_id', development.id),
      ]);
      if (unitsResult.error || typologiesResult.error) {
        throw unitsResult.error ?? typologiesResult.error ?? new Error('Não foi possível atualizar a tabela.');
      }
      const currentUnits = (unitsResult.data ?? []) as DevelopmentUnit[];
      if (!currentUnits.some(isPrintable)) throw new Error(`O ${development.name} ainda não possui unidades comerciais para impressão.`);
      const html = buildPremiumSalesPrintHtml({
        theme, name: development.name, units: currentUnits,
        typologies: (typologiesResult.data ?? []) as DevelopmentTypology[],
        assetBaseUrl: window.location.origin,
      });
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Não foi possível preparar a impressão.';
      setError(message);
      popup.document.open();
      popup.document.write(`<!doctype html><title>Erro</title><body style="font-family:Arial;padding:32px"><h2>Não foi possível imprimir</h2><p>${escapeHtml(message)}</p></body>`);
      popup.document.close();
    } finally {
      setPrintingId('');
    }
  }

  return <section className="card" style={{ marginBottom: 16 }}>
    <div className="card-head">
      <div><h3>Imprimir tabelas de vendas</h3><small className="muted">Apresentação premium de 3 páginas A4, com estoque atualizado no momento da impressão</small></div>
      <span className="chip">🖨️ A4 retrato</span>
    </div>
    <div className="card-body">
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="info-box" style={{ marginTop: 0, marginBottom: 14 }}>
        Em ambos os empreendimentos, as páginas 1 e 2 permanecem fixas. A terceira mostra os valores e as condições cadastradas no CRM, com a identidade visual própria do Flow ou do Alma. Permutantes são contadas como vendidas no Flow e reservadas no Alma.
      </div>
      <div className="grid grid-2">
        {targets.map((development) => {
          const printable = units.filter((unit) => unit.development_id === development.id && isPrintable(unit)).length;
          return <div className="card" key={development.id} style={{ boxShadow: 'none' }}>
            <div className="card-body" style={{ display: 'grid', gap: 8 }}>
              <strong>{development.name}</strong>
              <small className="muted">{printable} unidades cadastradas · 3 páginas no padrão premium</small>
              <button type="button" className="btn btn-primary" disabled={Boolean(printingId)}
                onClick={() => void printDevelopment(development)}>
                {printingId === development.id ? 'Preparando impressão…' : `🖨️ Imprimir ${development.name}`}
              </button>
            </div>
          </div>;
        })}
        {targets.length === 0 && <div className="empty-state">Cadastre os empreendimentos Flow e Alma para habilitar a impressão.</div>}
      </div>
    </div>
  </section>;
}
