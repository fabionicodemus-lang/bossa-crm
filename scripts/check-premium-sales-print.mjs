import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildPremiumSalesPrintHtml } from '../src/lib/premium-sales-table-print.ts';

const typologies = [
  { id: 'tipo-01', code: '01', name: 'Tipo 01', private_area_m2: 114, suites: 3 },
  { id: 'tipo-02', code: '02', name: 'Tipo 02', private_area_m2: 103, suites: 3 },
];

function unit(index, theme, status) {
  const isFlow = theme === 'flow';
  const list_price = (isFlow ? 1_000_000 : 1_500_000) + index * 23_000;
  const entryPart = isFlow ? .2 : .15;
  const parcelPart = isFlow ? .3 : .32;
  const reinforcePart = isFlow ? .3 : .43;
  const months = isFlow ? 60 : 80;
  const reinforcements = isFlow ? 5 : 7;
  return {
    id: String(index), development_id: theme, organization_id: 'qa',
    typology_id: index % 2 ? 'tipo-01' : 'tipo-02', unit_code: String(1000 + index),
    floor: Math.floor(index / 2), status, private_area_m2: index % 2 ? 114 : 103,
    list_price, entry_amount: list_price * entryPart, installment_count: months,
    installment_amount: list_price * parcelPart / months, reinforcement_count: reinforcements,
    reinforcement_amount: list_price * reinforcePart / reinforcements,
    keys_amount: list_price * (isFlow ? .2 : .1), payment_plan: {}, notes: null,
  };
}

const flowUnits = [
  ...Array.from({ length: 13 }, (_, i) => unit(i, 'flow', 'disponivel')),
  ...Array.from({ length: 44 }, (_, i) => unit(i + 13, 'flow', 'vendido')),
];
const almaUnits = [
  ...Array.from({ length: 12 }, (_, i) => unit(i, 'alma', 'disponivel')),
  ...Array.from({ length: 16 }, (_, i) => unit(i + 12, 'alma', 'reservado')),
];

function render(theme, units, base = 'https://exemplo.com') {
  return buildPremiumSalesPrintHtml({
    theme, name: theme === 'flow' ? 'Flow Aptos' : 'Alma Seahouses', units, typologies,
    assetBaseUrl: base, printedAt: new Date('2026-11-06T15:00:00Z'), autoPrint: false,
  });
}

for (const [theme, units] of [['flow', flowUnits], ['alma', almaUnits]]) {
  const html = render(theme, units);
  assert.equal((html.match(/<section class="page /g) ?? []).length, 3, `${theme}: precisa ter 3 páginas A4.`);
  assert.match(html, new RegExp(`${theme}-print/page-1\\.webp`));
  assert.match(html, new RegExp(`${theme}-print/page-2\\.webp`));
  assert.match(html, /NOVEMBRO 2026/);
  assert.match(html, /UNIDADES DISPONÍVEIS/);
  assert.match(html, /R\$\s*1\./);
  assert.match(html, /TABELA COMERCIAL/);
  assert.match(html, /13<\/strong> disponíveis|12<\/strong> disponíveis/);
}

const flowHtml = render('flow', flowUnits);
assert.match(flowHtml, /44<\/strong> vendidas/);
assert.match(flowHtml, /UNIDADES VENDIDAS/);
assert.match(flowHtml, /FlowSaira/);
assert.match(flowHtml, /FlowMichroma/);
assert.match(flowHtml, /60× \/ mês/);

const almaHtml = render('alma', almaUnits);
assert.match(almaHtml, /16<\/strong> reservadas/);
assert.match(almaHtml, /28 unidades nesta relação/);
assert.match(almaHtml, /UNIDADES RESERVADAS/);
assert.match(almaHtml, /AlmaLiterata/);
assert.match(almaHtml, /AlmaUrbanist/);
assert.match(almaHtml, /80× \/ mês/);

const changed = flowUnits.map((row) => row.unit_code === '1000'
  ? { ...row, installment_amount: 3_000 } : row);
assert.match(render('flow', changed), /1000\*/);
assert.match(render('flow', changed), /Condições preservadas do CRM/);

const reservedFlow = flowUnits.map((row) => row.unit_code === '1000'
  ? { ...row, status: 'reservado' } : row);
assert.match(render('flow', reservedFlow), /1 reservadas/);
assert.match(render('flow', reservedFlow), /UNIDADES COM VALORES/);

const permutanteAlma = almaUnits.map((row) => row.unit_code === '1000'
  ? { ...row, payment_plan: { source_status: 'permutante' } } : row);
assert.match(render('alma', permutanteAlma), /11<\/strong> disponíveis/);
assert.match(render('alma', permutanteAlma), /17<\/strong> reservadas/);

assert.throws(() => render('alma', Array.from({ length: 40 }, (_, i) => unit(i, 'alma', 'disponivel'))), /não cabe/);
console.log('Tabelas premium Flow e Alma: 3 páginas, dados dinâmicos, status, condições e limite de paginação validados.');

if (process.argv.includes('--write-previews')) {
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url)).replace(/\/$/, '');
  await writeFile('/tmp/flow-premium-qa.html', render('flow', flowUnits).replaceAll('https://exemplo.com', `file://${publicDir}`));
  await writeFile('/tmp/alma-premium-qa.html', render('alma', almaUnits).replaceAll('https://exemplo.com', `file://${publicDir}`));
  console.log('Prévias de teste geradas em /tmp.');
}
