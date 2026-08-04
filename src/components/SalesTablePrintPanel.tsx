'use client';

import { useMemo, useState } from 'react';
import { BOSSA_LOGO_BASE64 } from '@/lib/brand-assets';
import { createClient } from '@/lib/supabase/client';
import type { DevelopmentTypology, DevelopmentUnit } from './DevelopmentsManager';

export type SalesTablePrintDevelopment = {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  active: boolean;
};

type ThemeKey = 'flow' | 'alma';
type PrintedStatus = 'disponivel' | 'reservado' | 'vendido';
type PrintableUnit = { unit: DevelopmentUnit; printedStatus: PrintedStatus };

type PrintTheme = {
  accent: string;
  pill: string;
  soft: string;
};

const themes: Record<ThemeKey, PrintTheme> = {
  flow: {
    accent: '#0697b7',
    pill: '#102130',
    soft: '#f1f4f8',
  },
  alma: {
    accent: '#59695C',
    pill: '#59695C',
    soft: '#f7f2ea',
  },
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function themeFor(development: SalesTablePrintDevelopment): ThemeKey | null {
  const identity = normalizeText(`${development.slug} ${development.name}`);
  if (identity.includes('flow')) return 'flow';
  if (identity.includes('alma')) return 'alma';
  return null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPermutante(unit: DevelopmentUnit) {
  const sourceStatus = typeof unit.payment_plan?.source_status === 'string'
    ? normalizeText(String(unit.payment_plan.source_status))
    : '';
  return sourceStatus === 'permutante' || normalizeText(unit.notes ?? '').includes('permutante');
}

function printedStatus(unit: DevelopmentUnit, theme: ThemeKey): PrintedStatus | null {
  if (isPermutante(unit)) return theme === 'alma' ? 'reservado' : 'vendido';
  if (unit.status === 'disponivel' || unit.status === 'reservado' || unit.status === 'vendido') return unit.status;
  return null;
}

function statusLabel(status: PrintedStatus) {
  if (status === 'disponivel') return 'Disponível';
  if (status === 'reservado') return 'Reservada';
  return 'Vendida';
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function moneyText(value: unknown) {
  const numericValue = numberValue(value);
  return numericValue > 0 ? money.format(numericValue) : '—';
}

function unitSort(first: PrintableUnit, second: PrintableUnit) {
  return (second.unit.floor ?? 0) - (first.unit.floor ?? 0)
    || first.unit.unit_code.localeCompare(second.unit.unit_code, 'pt-BR', { numeric: true });
}

function typologySort(first: DevelopmentTypology | null, second: DevelopmentTypology | null) {
  if (!first) return 1;
  if (!second) return -1;
  const firstDuplex = normalizeText(`${first.code} ${first.name}`).includes('duplex');
  const secondDuplex = normalizeText(`${second.code} ${second.name}`).includes('duplex');
  if (firstDuplex !== secondDuplex) return firstDuplex ? -1 : 1;
  return first.code.localeCompare(second.code, 'pt-BR', { numeric: true });
}

function typologyMeta(typology: DevelopmentTypology | null, group: PrintableUnit[]) {
  const firstUnit = group[0]?.unit;
  const area = typology?.private_area_m2 ?? firstUnit?.private_area_m2;
  const rooms = typology?.suites
    ? `${typology.suites} suítes`
    : typology?.bedrooms
      ? `${typology.bedrooms} dorms`
      : '';
  const description = typology?.description?.trim()
    ? typology.description.trim().slice(0, 90)
    : '';
  const codes = group.map(({ unit }) => unit.unit_code);
  const unitsText = codes.length <= 8 ? `Unids: ${codes.join(', ')}` : `${codes.length} unidades`;
  return [area ? `${decimal.format(area)} m²` : '', rooms, description, unitsText].filter(Boolean).join(' · ');
}

function printHtml({
  development,
  developmentLogoUrl,
  typologies,
  units,
  themeKey,
}: {
  development: SalesTablePrintDevelopment;
  developmentLogoUrl: string;
  typologies: DevelopmentTypology[];
  units: DevelopmentUnit[];
  themeKey: ThemeKey;
}) {
  const theme = themes[themeKey];
  const printableUnits = units
    .filter((unit) => unit.development_id === development.id)
    .map((unit) => ({ unit, printedStatus: printedStatus(unit, themeKey) }))
    .filter((item): item is PrintableUnit => Boolean(item.printedStatus))
    .sort(unitSort);
  const typologyById = new Map(typologies
    .filter((typology) => typology.development_id === development.id)
    .map((typology) => [typology.id, typology]));
  const grouped = new Map<string, PrintableUnit[]>();
  for (const item of printableUnits) {
    const key = item.unit.typology_id ?? '__sem_tipologia__';
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const groups = [...grouped.entries()]
    .map(([key, group]) => ({ typology: key === '__sem_tipologia__' ? null : typologyById.get(key) ?? null, group }))
    .sort((first, second) => typologySort(first.typology, second.typology));

  const installmentCounts = [...new Set(printableUnits
    .map(({ unit }) => numberValue(unit.installment_count))
    .filter((count) => count > 0))];
  const installmentHeader = installmentCounts.length === 1
    ? `PARCELAS (${installmentCounts[0]}×)`
    : 'PARCELAS';
  const statusCounts = printableUnits.reduce<Record<PrintedStatus, number>>((result, item) => {
    result[item.printedStatus] += 1;
    return result;
  }, { disponivel: 0, reservado: 0, vendido: 0 });
  const printedAt = new Date();
  const monthYear = printedAt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toLocaleUpperCase('pt-BR');
  const printedDate = printedAt.toLocaleDateString('pt-BR');

  const rows = groups.map(({ typology, group }) => {
    const typologyName = typology?.name ?? 'Outras unidades';
    const typologyIdentity = normalizeText(`${typology?.code ?? ''} ${typologyName}`);
    const pillColor = themeKey === 'flow' && typologyIdentity.includes('duplex') ? '#bd6c2c' : theme.pill;
    const heading = `<tr class="type-row"><td colspan="6"><span class="type-pill" style="background:${pillColor}">${escapeHtml(typologyName.toLocaleUpperCase('pt-BR'))}</span><span class="type-meta">${escapeHtml(typologyMeta(typology, group))}</span></td></tr>`;
    const unitRows = group.map(({ unit, printedStatus: status }) => `<tr class="unit-row status-${status}">
      <td class="unit-cell"><strong>${escapeHtml(unit.unit_code)}</strong><span class="status-badge">${escapeHtml(statusLabel(status))}</span></td>
      <td class="money total">${escapeHtml(moneyText(unit.list_price))}</td>
      <td class="money">${escapeHtml(moneyText(unit.entry_amount))}</td>
      <td class="money">${escapeHtml(moneyText(unit.installment_amount))}${numberValue(unit.installment_amount) > 0 ? '<small>/mês</small>' : ''}</td>
      <td class="money">${escapeHtml(moneyText(unit.reinforcement_amount))}</td>
      <td class="money">${escapeHtml(moneyText(unit.keys_amount))}</td>
    </tr>`).join('');
    return heading + unitRows;
  }).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Tabela de vendas · ${escapeHtml(development.name)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm 8mm 11mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #102130; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brand-head { display: grid; grid-template-columns: 1fr 1.4fr 1fr; align-items: center; gap: 8mm; padding: 0 1mm 4mm; border-bottom: 2px solid ${theme.accent}; margin-bottom: 4mm; }
  .logo { height: 18mm; display: flex; align-items: center; }
  .logo:last-child { justify-content: flex-end; }
  .logo img { max-width: 45mm; max-height: 16mm; object-fit: contain; }
  .title { text-align: center; }
  .title h1 { margin: 0; font-size: 15pt; letter-spacing: .08em; color: #102130; }
  .title p { margin: 1.2mm 0 0; font-size: 8pt; letter-spacing: .12em; color: ${theme.accent}; font-weight: 700; text-transform: uppercase; }
  .summary { display: flex; justify-content: flex-end; gap: 2.5mm; margin: 0 1mm 3mm; font-size: 7pt; }
  .summary span { border: 1px solid #d7e0e7; border-radius: 999px; padding: 1.1mm 2.2mm; background: #fff; }
  .summary strong { color: ${theme.accent}; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.unit { width: 16%; }
  col.total { width: 19%; }
  col.entry { width: 17%; }
  col.installment { width: 17%; }
  col.reinforcement { width: 17%; }
  col.keys { width: 14%; }
  thead { display: table-header-group; }
  thead th { background: #102130; color: #fff; padding: 1.92mm 2mm; font-size: 7.4pt; letter-spacing: .16em; font-weight: 700; line-height: 1.05; text-align: right; }
  thead th:first-child { text-align: left; border-radius: 1mm 0 0 0; }
  thead th:last-child { border-radius: 0 1mm 0 0; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .type-row td { background: ${theme.soft}; border-top: 1px solid #d9e1e8; border-bottom: 1px solid #d9e1e8; padding: 1.76mm 2mm; line-height: 1.05; white-space: nowrap; overflow: hidden; }
  .type-pill { display: inline-block; color: #fff; border-radius: 999px; padding: .88mm 3mm; font-size: 7.4pt; font-weight: 800; letter-spacing: .12em; vertical-align: middle; }
  .type-meta { margin-left: 2.5mm; font-size: 7.5pt; color: #314960; vertical-align: middle; }
  .unit-row td { border-bottom: 1px solid #d7e0e7; padding: 1.88mm 2mm; font-size: 8.6pt; line-height: 1.05; text-align: right; vertical-align: middle; }
  .unit-row.status-reservado td { background: #fffaf0; }
  .unit-row.status-vendido td { background: #f7f7f7; color: #697783; }
  .unit-cell { text-align: left !important; white-space: nowrap; }
  .unit-cell strong { font-size: 10.2pt; color: #102130; }
  .status-vendido .unit-cell strong { color: #596875; }
  .status-badge { display: inline-block; margin-left: 1.5mm; border-radius: 1mm; padding: .6mm 1.25mm; font-size: 5.7pt; font-weight: 800; letter-spacing: .05em; line-height: 1; text-transform: uppercase; background: #e8eef2; color: #526474; vertical-align: 1px; }
  .status-disponivel .status-badge { background: #e7f5f8; color: ${theme.accent}; }
  .status-reservado .status-badge { background: #f6e8c9; color: #8b6428; }
  .status-vendido .status-badge { background: #e5e7e9; color: #596875; }
  .money { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .money.total { color: ${theme.accent}; font-weight: 800; font-size: 9.2pt; }
  .status-vendido .money.total { color: #697783; }
  .money small { margin-left: .7mm; color: #7f8b95; font-size: 5.8pt; font-weight: 400; }
  .footer { margin-top: 7mm; border-top: 1px solid #cad5de; padding-top: 3.2mm; text-align: center; color: #5d7891; font-size: 7pt; letter-spacing: .13em; text-transform: uppercase; }
  .print-date { margin-top: 1.5mm; color: #8897a3; font-size: 6.2pt; letter-spacing: .08em; }
</style>
</head>
<body>
  <header class="brand-head">
    <div class="logo"><img src="data:image/jpeg;base64,${BOSSA_LOGO_BASE64}" alt="Bossa Empreendimentos" /></div>
    <div class="title"><h1>TABELA DE VENDAS</h1><p>${escapeHtml(development.name)}</p></div>
    <div class="logo"><img src="${escapeHtml(developmentLogoUrl)}" alt="${escapeHtml(development.name)}" /></div>
  </header>
  <div class="summary">
    <span><strong>${statusCounts.disponivel}</strong> disponíveis</span>
    <span><strong>${statusCounts.reservado}</strong> reservadas</span>
    <span><strong>${statusCounts.vendido}</strong> vendidas</span>
  </div>
  <table>
    <colgroup><col class="unit" /><col class="total" /><col class="entry" /><col class="installment" /><col class="reinforcement" /><col class="keys" /></colgroup>
    <thead><tr><th>UNIDADE</th><th>VALOR TOTAL</th><th>ENTRADA</th><th>${escapeHtml(installmentHeader)}</th><th>REFORÇO ANUAL</th><th>CHAVES</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer class="footer">${escapeHtml(development.name)} · BOSSA EMPREENDIMENTOS · TABELA VIGENTE ${escapeHtml(monthYear)} · VALORES SUJEITOS A ALTERAÇÃO SEM AVISO PRÉVIO<div class="print-date">Impressa em ${escapeHtml(printedDate)}</div></footer>
<script>
  window.addEventListener('load', function () {
    var images = Array.prototype.slice.call(document.images);
    Promise.all(images.map(function (image) {
      if (image.complete) return Promise.resolve();
      return new Promise(function (resolve) { image.onload = resolve; image.onerror = resolve; });
    })).then(function () { window.setTimeout(function () { window.focus(); window.print(); }, 250); });
  });
</script>
</body>
</html>`;
}

export function SalesTablePrintPanel({
  developments,
  typologies,
  units,
}: {
  developments: SalesTablePrintDevelopment[];
  typologies: DevelopmentTypology[];
  units: DevelopmentUnit[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [printingId, setPrintingId] = useState('');
  const [error, setError] = useState('');
  const targets = developments
    .filter((development) => development.active && themeFor(development))
    .sort((first, second) => {
      const firstTheme = themeFor(first);
      const secondTheme = themeFor(second);
      return (firstTheme === 'flow' ? 0 : 1) - (secondTheme === 'flow' ? 0 : 1);
    });

  async function printDevelopment(development: SalesTablePrintDevelopment) {
    const themeKey = themeFor(development);
    if (!themeKey) return;
    const popup = window.open('', '_blank', 'width=900,height=1200');
    if (!popup) {
      setError('O navegador bloqueou a janela de impressão. Libere pop-ups para o Bossa CRM e tente novamente.');
      return;
    }

    popup.document.write('<!doctype html><title>Preparando impressão</title><body style="font-family:Arial;padding:32px">Preparando a tabela para impressão…</body>');
    popup.document.close();
    setPrintingId(development.id);
    setError('');

    try {
      if (!development.logo_path) throw new Error(`Cadastre primeiro o logo do ${development.name} na área de marcas.`);
      const printableCount = units
        .filter((unit) => unit.development_id === development.id)
        .filter((unit) => Boolean(printedStatus(unit, themeKey))).length;
      if (printableCount === 0) throw new Error(`O ${development.name} não possui unidades disponíveis, reservadas ou vendidas para imprimir.`);

      const { data, error: signedError } = await supabase.storage
        .from('development-files')
        .createSignedUrl(development.logo_path, 600);
      if (signedError || !data?.signedUrl) throw signedError ?? new Error('Não foi possível carregar o logo do empreendimento.');

      popup.document.open();
      popup.document.write(printHtml({
        development,
        developmentLogoUrl: data.signedUrl,
        typologies,
        units,
        themeKey,
      }));
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
      <div><h3>Imprimir tabelas de vendas</h3><small className="muted">Layout comercial em A4 retrato, com mês atualizado no momento da impressão</small></div>
      <span className="chip">🖨️ A4 retrato</span>
    </div>
    <div className="card-body">
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="info-box" style={{ marginTop: 0, marginBottom: 14 }}>
        A impressão inclui unidades disponíveis, reservadas e vendidas. Permutantes aparecem como reservadas no Alma e como vendidas no Flow.
      </div>
      <div className="grid grid-2">
        {targets.map((development) => {
          const themeKey = themeFor(development)!;
          const printableCount = units
            .filter((unit) => unit.development_id === development.id)
            .filter((unit) => Boolean(printedStatus(unit, themeKey))).length;
          return <div className="card" key={development.id} style={{ boxShadow: 'none' }}>
            <div className="card-body" style={{ display: 'grid', gap: 8 }}>
              <strong>{development.name}</strong>
              <small className="muted">{printableCount} unidades na impressão · cores {themeKey === 'flow' ? 'originais do Flow' : 'verdes do Alma'}</small>
              {!development.logo_path && <small style={{ color: 'var(--danger)' }}>Cadastre o logo do empreendimento acima para habilitar.</small>}
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(printingId) || !development.logo_path || printableCount === 0}
                onClick={() => void printDevelopment(development)}
              >
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
