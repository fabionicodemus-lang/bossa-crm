import { readFile } from 'node:fs/promises';

const rows = JSON.parse(await readFile(new URL('../src/data/alma-sales-table-2026-08.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

assert(rows.length === 48, `Esperadas 48 unidades, recebidas ${rows.length}.`);
assert(new Set(rows.map((row) => row.unitCode)).size === rows.length, 'Há unidades duplicadas na tabela do Alma.');
assert(!rows.some((row) => ['501', '502'].includes(row.unitCode)), 'As salas 501 e 502 não podem fazer parte desta importação.');

const counts = rows.reduce((result, row) => {
  result[row.sourceStatus] = (result[row.sourceStatus] ?? 0) + 1;
  return result;
}, {});
assert(counts.disponivel === 32, `Esperadas 32 disponíveis, recebidas ${counts.disponivel ?? 0}.`);
assert(counts.reservado === 11, `Esperadas 11 reservadas, recebidas ${counts.reservado ?? 0}.`);
assert(counts.permutante === 5, `Esperadas 5 permutantes, recebidas ${counts.permutante ?? 0}.`);

for (const row of rows) {
  assert(Number.isInteger(row.floor) && row.floor >= 6 && row.floor <= 29, `Andar inválido na unidade ${row.unitCode}.`);
  assert(['01', '02'].includes(row.typologyCode), `Tipologia inválida na unidade ${row.unitCode}.`);
  if (row.sourceStatus === 'disponivel') {
    assert(cents(row.listPrice) > 0, `Unidade disponível ${row.unitCode} está sem valor.`);
  } else {
    assert(cents(row.listPrice) === 0, `Unidade indisponível ${row.unitCode} deve permanecer com valor zerado.`);
  }
}

const unit2401 = rows.find((row) => row.unitCode === '2401');
const unit2901 = rows.find((row) => row.unitCode === '2901');
assert(unit2401?.sourceStatus === 'reservado' && cents(unit2401.listPrice) === 0, 'A unidade 2401 deve ser reservada e zerada.');
assert(unit2901?.sourceStatus === 'reservado' && cents(unit2901.listPrice) === 0, 'A unidade 2901 deve ser reservada e zerada.');

const availableVgvCents = rows
  .filter((row) => row.sourceStatus === 'disponivel')
  .reduce((total, row) => total + cents(row.listPrice), 0);
assert(availableVgvCents === 5_007_399_628, `VGV disponível divergente: ${(availableVgvCents / 100).toFixed(2)}.`);

const unit901 = rows.find((row) => row.unitCode === '901');
assert(cents(unit901?.listPrice) === 137_780_611, 'Valor atualizado da unidade 901 divergente.');
assert(cents(unit901.listPrice * 0.15) === 20_667_092, 'Entrada da unidade 901 divergente.');
assert(cents((unit901.listPrice * 0.32) / 80) === 551_122, 'Parcela mensal da unidade 901 divergente.');
assert(cents((unit901.listPrice * 0.43) / 7) === 8_463_666, 'Reforço da unidade 901 divergente.');
assert(cents(unit901.listPrice * 0.1) === 13_778_061, 'Chaves da unidade 901 divergentes.');

console.log('Tabela Alma validada: 48 unidades, 32 disponíveis, 11 reservadas, 5 permutantes e VGV de R$ 50.073.996,28.');
