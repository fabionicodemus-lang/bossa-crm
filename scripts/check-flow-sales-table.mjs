import { readFile } from 'node:fs/promises';

const rows = JSON.parse(await readFile(new URL('../src/data/flow-sales-table-2026-05.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

assert(rows.length === 13, `Esperadas 13 unidades disponíveis, recebidas ${rows.length}.`);
assert(new Set(rows.map((row) => row.unitCode)).size === rows.length, 'Há unidades duplicadas na tabela do Flow.');
assert(rows.every((row) => row.installmentCount === 60), 'Todas as unidades devem ter 60 parcelas.');
assert(rows.every((row) => row.reinforcementCount === 5), 'Todas as unidades devem ter 5 reforços anuais.');

const expectedCodes = ['1601', '1602', '1403', '2301', '2201', '1901', '1001', '601', '2302', '1902', '1802', '2303', '2103'];
assert(expectedCodes.every((code) => rows.some((row) => row.unitCode === code)), 'A relação de unidades disponíveis está incompleta.');

const typologyCounts = rows.reduce((result, row) => {
  result[row.typologyCode] = (result[row.typologyCode] ?? 0) + 1;
  return result;
}, {});
assert(typologyCounts.DX01 === 1, 'Esperada 1 unidade Duplex 01.');
assert(typologyCounts.DX23 === 2, 'Esperadas 2 unidades Duplex 02/03.');
assert(typologyCounts['01'] === 5, 'Esperadas 5 unidades Tipo 01.');
assert(typologyCounts['02'] === 3, 'Esperadas 3 unidades Tipo 02.');
assert(typologyCounts['03'] === 2, 'Esperadas 2 unidades Tipo 03.');

for (const row of rows) {
  assert(cents(row.listPrice) > 0, `Unidade ${row.unitCode} está sem valor total.`);
  assert(cents(row.entryAmount) === cents(row.listPrice * 0.2), `Entrada da unidade ${row.unitCode} não corresponde a 20%.`);
  assert(Math.abs(cents(row.installmentAmount * 60) - cents(row.listPrice * 0.3)) <= 12, `Parcelas da unidade ${row.unitCode} não correspondem à tabela arredondada.`);
  assert(Math.abs(cents(row.reinforcementAmount * 5) - cents(row.listPrice * 0.3)) <= 2, `Reforços da unidade ${row.unitCode} não correspondem à tabela arredondada.`);
  assert(cents(row.keysAmount) === cents(row.listPrice * 0.2), `Chaves da unidade ${row.unitCode} não correspondem a 20%.`);
}

const unit1601 = rows.find((row) => row.unitCode === '1601');
assert(cents(unit1601?.listPrice) === 140_645_000, 'A unidade 1601 deve ter exatamente R$ 1.406.450,00.');
assert(cents(unit1601?.installmentAmount) === 703_225, 'A parcela da unidade 1601 deve ser exatamente R$ 7.032,25.');

const unit2301 = rows.find((row) => row.unitCode === '2301');
assert(unit2301?.typologyCode === '01', 'A unidade 2301 deve ser Tipo 01, não Duplex.');
assert(cents(unit2301?.listPrice) === 106_534_428, 'A unidade 2301 deve ter exatamente R$ 1.065.344,28.');

const unit601 = rows.find((row) => row.unitCode === '601');
assert(cents(unit601?.listPrice) === 98_235_228, 'A unidade 601 deve ter exatamente R$ 982.352,28.');

const availableVgvCents = rows.reduce((total, row) => total + cents(row.listPrice), 0);
assert(availableVgvCents === 1_418_259_012, `VGV disponível divergente: ${(availableVgvCents / 100).toFixed(2)}.`);

console.log('Tabela Flow validada: 13 unidades disponíveis e VGV de R$ 14.182.590,12.');
