import type { DevelopmentTypology, DevelopmentUnit } from '../components/DevelopmentsManager';

export type PremiumPrintTheme = 'flow' | 'alma';
type Status = 'disponivel' | 'reservado' | 'em_contrato' | 'vendido';
type Entry = { unit: DevelopmentUnit; status: Status };
type Group = { typology: DevelopmentTypology | null; entries: Entry[] };

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function money(value: unknown) {
  const n = numeric(value);
  return n > 0 ? currency.format(n) : '—';
}
function statusOf(unit: DevelopmentUnit, theme: PremiumPrintTheme): Status | null {
  const permutante = normalize(unit.payment_plan?.source_status) === 'permutante'
    || normalize(unit.notes).includes('permutante');
  if (permutante) return theme === 'alma' ? 'reservado' : 'vendido';
  return ['disponivel', 'reservado', 'em_contrato', 'vendido'].includes(unit.status) ? unit.status as Status : null;
}
function groupUnits(entries: Entry[], typologies: DevelopmentTypology[]) {
  const byId = new Map(typologies.map((t) => [t.id, t]));
  const byType = new Map<string, Entry[]>();
  for (const entry of entries) {
    const id = entry.unit.typology_id || '_sem_tipologia_';
    byType.set(id, [...(byType.get(id) ?? []), entry]);
  }
  return [...byType.entries()].map(([id, items]): Group => ({
    typology: byId.get(id) ?? null,
    entries: items.sort((a, b) => (b.unit.floor ?? 0) - (a.unit.floor ?? 0)
      || a.unit.unit_code.localeCompare(b.unit.unit_code, 'pt-BR', { numeric: true })),
  })).sort((a, b) => {
    const aDuplex = normalize(`${a.typology?.code} ${a.typology?.name}`).match(/duplex|dx/);
    const bDuplex = normalize(`${b.typology?.code} ${b.typology?.name}`).match(/duplex|dx/);
    if (Boolean(aDuplex) !== Boolean(bDuplex)) return aDuplex ? -1 : 1;
    return (a.typology?.code ?? 'ZZZ').localeCompare(b.typology?.code ?? 'ZZZ', 'pt-BR', { numeric: true });
  });
}
function typeName(group: Group) {
  return group.typology?.name?.trim().toLocaleUpperCase('pt-BR') || 'OUTRAS UNIDADES';
}
function typeMeta(group: Group, theme: PremiumPrintTheme) {
  const area = numeric(group.typology?.private_area_m2 ?? group.entries[0]?.unit.private_area_m2);
  const suites = numeric(group.typology?.suites);
  const parts = [area ? `${decimal.format(area)} m²` : ''];
  if (theme === 'alma' && suites) parts.push(`${suites} suítes`);
  return parts.filter(Boolean).join(' / ');
}
function hasDifference(unit: DevelopmentUnit) {
  const fields = [unit.list_price, unit.entry_amount, unit.installment_count, unit.installment_amount,
    unit.reinforcement_count, unit.reinforcement_amount, unit.keys_amount];
  if (fields.some((value) => numeric(value) <= 0)) return false;
  const total = numeric(unit.entry_amount) + numeric(unit.installment_count) * numeric(unit.installment_amount)
    + numeric(unit.reinforcement_count) * numeric(unit.reinforcement_amount) + numeric(unit.keys_amount);
  return Math.abs(total - numeric(unit.list_price)) > 1;
}
function priceCell(amount: number, count: number, showCount: boolean, suffix = '') {
  return `${escapeHtml(money(amount))}${showCount && numeric(amount) > 0 && numeric(count) > 0
    ? `<small>${escapeHtml(`${count}×${suffix}`)}</small>` : ''}`;
}

/** A4 portrait: fixed presentation pages plus a live CRM commercial page. */
export function buildPremiumSalesPrintHtml({
  theme, name, units, typologies, assetBaseUrl, printedAt = new Date(), autoPrint = true,
}: {
  theme: PremiumPrintTheme;
  name: string;
  units: DevelopmentUnit[];
  typologies: DevelopmentTypology[];
  assetBaseUrl: string;
  printedAt?: Date;
  autoPrint?: boolean;
}) {
  const included = units.map((unit) => ({ unit, status: statusOf(unit, theme) }))
    .filter((item): item is Entry => item.status !== null);
  const counts = included.reduce<Record<Status, number>>((a, item) => {
    a[item.status]++;
    return a;
  }, { disponivel: 0, reservado: 0, em_contrato: 0, vendido: 0 });
  // Alma's supplied model shows only available prices and lists reservations separately.
  // Flow's model prints values for all unsold commercial statuses.
  const priced = included.filter((item) => theme === 'flow' ? item.status !== 'vendido' : item.status === 'disponivel');
  const secondary = included.filter((item) => theme === 'flow' ? item.status === 'vendido' : item.status === 'reservado');
  const groups = groupUnits(priced, typologies);
  const otherGroups = groupUnits(secondary, typologies);
  const installmentCounts = [...new Set(priced.map(({ unit }) => numeric(unit.installment_count)).filter(Boolean))];
  const reinforcementCounts = [...new Set(priced.map(({ unit }) => numeric(unit.reinforcement_count)).filter(Boolean))];
  const sameInstallments = installmentCounts.length === 1;
  const sameReinforcements = reinforcementCounts.length === 1;
  const mismatches = priced.filter(({ unit }) => hasDifference(unit)).map(({ unit }) => unit.unit_code);
  const missingPlans = priced.some(({ unit }) => [unit.entry_amount, unit.installment_amount, unit.reinforcement_amount, unit.keys_amount]
    .some((amount) => numeric(amount) <= 0));
  const notes = [
    mismatches.length ? `* A composição das unidades ${mismatches.join(', ')} difere do valor total. Condições preservadas do CRM; confirmar com a Bossa.` : '',
    missingPlans ? 'Traço: condição de pagamento não cadastrada no CRM. Consulte a Bossa.' : '',
  ].filter(Boolean);
  const isFlow = theme === 'flow';
  const tableBudget = (isFlow ? 172 : 149) - (notes.length ? 8 : 0);
  const groupHeight = priced.length > 17 ? 6.3 : isFlow ? 7.4 : 8.1;
  const headerHeight = isFlow ? 11.5 : 12;
  const minimumHeight = headerHeight + groups.length * 6.3 + priced.length * 5.2;
  if (minimumHeight > tableBudget) {
    throw new Error(`A tabela do ${name} tem ${priced.length} unidades com preços e não cabe com legibilidade em três páginas. Revise o modelo antes de imprimir.`);
  }
  const rowHeight = Math.min(isFlow ? 8.3 : 9.8,
    (tableBudget - headerHeight - groups.length * groupHeight) / Math.max(1, priced.length));
  const monthLong = printedAt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  const monthHeader = monthLong.replace(/\s+de\s+/, ' ').toLocaleUpperCase('pt-BR');
  const printedDate = printedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const root = `${assetBaseUrl.replace(/\/$/, '')}/${theme}-print`;
  const fontRoot = `${assetBaseUrl.replace(/\/$/, '')}/flow-print`;

  let stripe = 0;
  const pricedRows = groups.map((group) => {
    const label = `<tr class="group-row"><td colspan="6"><div class="group-content"><strong>${escapeHtml(typeName(group))}</strong><span>${escapeHtml(typeMeta(group, theme))}</span></div></td></tr>`;
    const rows = group.entries.map(({ unit, status }) => {
      const flagged = mismatches.includes(unit.unit_code);
      const statusTag = status === 'reservado' ? 'RESERVADA' : status === 'em_contrato' ? 'EM CONTRATO' : '';
      const alternate = stripe++ % 2 ? ' alternate' : '';
      return `<tr class="price-row${alternate}"><td class="unit"><strong>${escapeHtml(unit.unit_code)}${flagged ? '*' : ''}</strong>${statusTag ? `<small>${statusTag}</small>` : ''}</td>
        <td class="total">${escapeHtml(money(unit.list_price))}</td><td>${escapeHtml(money(unit.entry_amount))}</td>
        <td>${priceCell(unit.installment_amount, unit.installment_count, !sameInstallments, ' / mês')}</td>
        <td>${priceCell(unit.reinforcement_amount, unit.reinforcement_count, !sameReinforcements)}</td>
        <td>${escapeHtml(money(unit.keys_amount))}</td></tr>`;
    }).join('');
    return label + rows;
  }).join('');
  const secondaryRows = otherGroups.map((group) => `<div class="secondary-line"><strong>${escapeHtml(typeName(group))}</strong><span>${escapeHtml(group.entries.map(({ unit }) => unit.unit_code).join(' · '))}</span></div>`).join('');
  const stats = isFlow
    ? `<span><strong>${counts.disponivel}</strong> disponíveis</span><span><strong>${counts.vendido}</strong> vendidas</span><span>${counts.reservado} reservadas</span><span>${counts.em_contrato} em contrato</span>`
    : `<span><strong>${counts.disponivel}</strong> disponíveis</span><span><strong>${counts.reservado}</strong> reservadas</span><span>${included.length} unidades nesta relação</span>`;
  const heading = isFlow
    ? `<h1>Tabela de vendas</h1>`
    : `<div class="mast-kicker">TABELA DE VENDAS</div><h1>Apartamentos disponíveis</h1>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>${escapeHtml(`Tabela de vendas · ${name}`)}</title>
<style>
@font-face{font-family:FlowOpen;src:url('${fontRoot}/OpenSans-Regular.ttf') format('truetype');font-weight:400}
@font-face{font-family:FlowOpen;src:url('${fontRoot}/OpenSans-Semibold.ttf') format('truetype');font-weight:600}
@font-face{font-family:FlowSaira;src:url('${fontRoot}/Saira-Thin.ttf') format('truetype');font-weight:100}
@font-face{font-family:FlowMichroma;src:url('${fontRoot}/Michroma-Regular.ttf') format('truetype')}
@font-face{font-family:AlmaUrbanist;src:url('${assetBaseUrl.replace(/\/$/, '')}/alma-print/Urbanist-Regular.ttf') format('truetype');font-weight:400}
@font-face{font-family:AlmaUrbanist;src:url('${assetBaseUrl.replace(/\/$/, '')}/alma-print/Urbanist-Semibold.ttf') format('truetype');font-weight:600}
@font-face{font-family:AlmaLiterata;src:url('${assetBaseUrl.replace(/\/$/, '')}/alma-print/Literata-Regular.ttf') format('truetype')}
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:${isFlow ? 'FlowOpen' : 'AlmaUrbanist'},Arial,sans-serif;color:${isFlow ? '#2b2a33' : '#343e37'};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:210mm;height:297mm;overflow:hidden;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}.fixed-page img{display:block;width:210mm;height:297mm}
.commercial-page{--row-height:${rowHeight.toFixed(3)}mm;--group-height:${groupHeight.toFixed(3)}mm;background:${isFlow ? '#fff' : '#f3f0eb'}}
.masthead{position:relative;height:${isFlow ? '44.6' : '48.9'}mm;background:${isFlow ? '#2b2a33' : '#343e37'};color:#fff}
.project-logo{position:absolute;left:${isFlow ? '9.3' : '9.2'}mm;top:${isFlow ? '7.6' : '4.6'}mm;width:${isFlow ? '46' : '47'}mm;height:auto}
.bossa-logo{position:absolute;right:7.4mm;top:2.3mm;width:30mm;height:auto}
.masthead h1{position:absolute;left:11.2mm;top:${isFlow ? '20.4' : '32.8'}mm;margin:0;font-family:${isFlow ? 'FlowSaira' : 'AlmaLiterata'},serif;font-weight:${isFlow ? '100' : '400'};font-size:${isFlow ? '32' : '25.5'}pt;line-height:1.15;white-space:nowrap}
.mast-kicker{position:absolute;left:11.2mm;top:26.7mm;font-size:6.2pt;letter-spacing:.24em}
.month{position:absolute;right:11.2mm;top:${isFlow ? '29.6' : '38.5'}mm;font-family:${isFlow ? 'FlowMichroma' : 'AlmaUrbanist'},sans-serif;font-size:6.8pt;letter-spacing:.09em}
.status-bar{height:${isFlow ? '10.2' : '11'}mm;background:${isFlow ? '#b0b5ac' : '#e0e3da'};display:grid;grid-template-columns:${isFlow ? '25% 31% 30% 14%' : '33% 48% 19%'};align-items:center;padding:0 11.2mm;font-size:${isFlow ? '7.25' : '8.4'}pt}
.status-bar span{white-space:nowrap}.status-bar strong{font-weight:600}
.section-heading{position:absolute;left:11.2mm;right:11.2mm;top:${isFlow ? '58.5' : '65.6'}mm;display:flex;justify-content:space-between;font-family:${isFlow ? 'FlowMichroma' : 'AlmaUrbanist'},sans-serif;font-size:${isFlow ? '5.75' : '6.2'}pt;letter-spacing:.08em;color:#777e78}
.table-area{position:absolute;top:${isFlow ? '64.1' : '71.2'}mm;left:11.2mm;right:11.2mm}
table{width:100%;border-collapse:collapse;table-layout:fixed}
col.unit{width:12%}col.total{width:19%}col.entry{width:20%}col.installment{width:17%}col.reinforcement{width:17%}col.keys{width:15%}
thead tr{height:${headerHeight}mm}thead th{background:${isFlow ? '#2b2a33' : '#343e37'};color:#fff;text-align:right;vertical-align:middle;font-size:${isFlow ? '6.35' : '6.45'}pt;font-weight:600;padding:0 2.5mm;line-height:1.5;white-space:nowrap}
thead th:first-child{text-align:left}thead small{display:block;font-size:5.7pt;font-weight:400}
tr{break-inside:avoid;page-break-inside:avoid}
.group-row{height:var(--group-height);background:${isFlow ? '#e4e6e1' : '#dfe3da'}}
.group-row td{padding:0 2.7mm;font-size:${isFlow ? '6.9' : '7.3'}pt}
.group-content{display:flex;align-items:center;justify-content:space-between;gap:3mm}.group-content strong{font-weight:600}.group-content span{color:#7b807b}
.price-row{height:var(--row-height);background:${isFlow ? '#fff' : '#fff'}}.price-row.alternate{background:${isFlow ? '#f4f4f3' : '#f7f6f3'}}
.price-row td{padding:0 2.5mm;font-size:${isFlow ? '7.7' : '8.0'}pt;line-height:1.18;text-align:right;vertical-align:middle;white-space:nowrap;color:#767c76;border-bottom:.12mm solid ${isFlow ? '#dededa' : '#dfdfda'}}
.price-row .unit{text-align:left;color:${isFlow ? '#2b2a33' : '#343e37'}}.price-row .unit strong{font-size:8.4pt;font-weight:600}.price-row .total{font-size:8.3pt;font-weight:600;color:${isFlow ? '#2b2a33' : '#343e37'}}
.price-row small{display:block;font-size:5.4pt;font-weight:400;margin-top:.25mm}.no-units td{text-align:center;padding:5mm;font-size:8pt}
.notes{margin-top:2.8mm;font-size:6.2pt;color:#7d817a;line-height:1.35}.notes div+div{margin-top:1.3mm}
.secondary-box{position:absolute;left:11.2mm;right:11.2mm;bottom:${isFlow ? '25' : '39.6'}mm;height:${isFlow ? '28.5' : '29'}mm;background:${isFlow ? '#f4f4f3' : '#fff'};padding:2.7mm 3.5mm;overflow:hidden}
.secondary-title{font-family:${isFlow ? 'FlowMichroma' : 'AlmaUrbanist'},sans-serif;letter-spacing:.1em;color:#778078;font-size:5.8pt;margin-bottom:2.5mm}
.secondary-line{display:grid;grid-template-columns:23mm 1fr;gap:1mm;font-size:6.4pt;color:#777e78;line-height:1.55}.secondary-line strong{font-weight:600;white-space:nowrap}.secondary-line span{overflow-wrap:anywhere}
.alma-status-note{position:absolute;left:11.2mm;bottom:31.3mm;font-size:6.7pt;color:#7e827b}
.alma-source-note{position:absolute;left:11.2mm;bottom:25.5mm;font-size:6.5pt;color:#7e827b}
.legal{position:absolute;left:11.2mm;right:11.2mm;bottom:${isFlow ? '18.8' : '17.2'}mm;font-size:6.1pt;color:#7d807b}
.printed{position:absolute;left:11.2mm;bottom:${isFlow ? '14.2' : '13.3'}mm;font-size:6.1pt;color:#7d807b}
.bottom{position:absolute;left:11.2mm;right:11.2mm;bottom:3.5mm;height:8.5mm;border-top:.2mm solid #c5c8c1;display:flex;justify-content:space-between;align-items:flex-end;color:#7b807b;font-size:5.3pt;letter-spacing:.05em;font-family:${isFlow ? 'FlowMichroma' : 'AlmaUrbanist'},sans-serif}
@media screen{body{background:#ddd}.page{margin:10mm auto;box-shadow:0 2mm 12mm #0002}}
@media print{.page{margin:0;box-shadow:none}}
</style></head><body>
<section class="page fixed-page" aria-label="Apresentação ${escapeHtml(name)}, página 1"><img src="${root}/page-1.webp" alt="Apresentação" /></section>
<section class="page fixed-page" aria-label="Plantas e ambientes, página 2"><img src="${root}/page-2.webp" alt="Plantas e ambientes" /></section>
<section class="page commercial-page" aria-label="Tabela comercial atualizada, página 3">
<header class="masthead"><img class="project-logo" src="${root}/${theme}-logo.png" alt="${escapeHtml(name)}" /><img class="bossa-logo" src="${root}/bossa-logo.png" alt="Bossa Empreendimentos" />
${heading}<div class="month">${escapeHtml(monthHeader)}</div></header>
<div class="status-bar">${stats}</div>
<div class="section-heading"><span>${isFlow && (counts.reservado || counts.em_contrato) ? 'UNIDADES COM VALORES' : 'UNIDADES DISPONÍVEIS'}</span><span>VALORES EM REAIS (R$)</span></div>
<div class="table-area"><table><colgroup><col class="unit"/><col class="total"/><col class="entry"/><col class="installment"/><col class="reinforcement"/><col class="keys"/></colgroup>
<thead><tr><th>UNIDADE</th><th>VALOR TOTAL</th><th>ENTRADA</th><th>PARCELAS<small>${sameInstallments ? `(${installmentCounts[0]}× / mês)` : '(por mês)'}</small></th>
<th>REFORÇO ANUAL<small>${sameReinforcements ? `(${reinforcementCounts[0]}×)` : '(por unidade)'}</small></th><th>CHAVES</th></tr></thead>
<tbody>${pricedRows || '<tr class="no-units"><td colspan="6">Nenhuma unidade disponível com valor cadastrado.</td></tr>'}</tbody></table>
<div class="notes">${notes.map((note) => `<div>${escapeHtml(note)}</div>`).join('')}</div></div>
<div class="secondary-box"><div class="secondary-title">UNIDADES ${isFlow ? 'VENDIDAS' : 'RESERVADAS'}</div>${secondaryRows || '<div class="secondary-line">Nenhuma unidade nesta condição.</div>'}</div>
${isFlow ? '' : `<div class="alma-status-note">${counts.em_contrato} em contrato e ${counts.vendido} vendidas entre as unidades desta relação.</div><div class="alma-source-note">Indicadores referentes às ${included.length} unidades cadastradas no CRM.</div>`}
<div class="legal">Tabela vigente em ${escapeHtml(monthLong)}. Valores sujeitos a alteração sem aviso prévio.</div><div class="printed">Impressa em ${escapeHtml(printedDate)}.</div>
<div class="bottom"><span>${isFlow ? 'FLOW APTOS' : 'ALMA SEAHOUSES'} / BOSSA EMPREENDIMENTOS</span><span>TABELA COMERCIAL &nbsp; 03</span></div>
</section>
${autoPrint ? `<script>window.addEventListener('load',function(){Promise.all([document.fonts.ready,...Array.from(document.images).map(function(image){return image.complete?Promise.resolve():new Promise(function(resolve){image.onload=resolve;image.onerror=resolve})})]).then(function(){setTimeout(function(){window.focus();window.print()},300)})});</script>` : ''}
</body></html>`;
}
