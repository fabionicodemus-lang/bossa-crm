import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

// Valida as APIs utilizadas pelo importador e pelas exportações do CRM após
// atualizar a distribuição oficial. A planilha é inteiramente sintética.
const linhas = [
  { Nome: 'Contato fictício', Telefone: '47999990000', Unidade: '0101', Valor: 12345.67 },
  { Nome: 'Segundo contato', Telefone: '5511999990000', Unidade: '0202', Valor: 0 },
];
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(linhas), 'Contatos');
for (const bookType of ['xlsx', 'xls']) {
  const bytes = XLSX.write(book, { type: 'array', bookType });
  const lido = XLSX.read(bytes, { type: 'array' });
  assert.deepEqual(XLSX.utils.sheet_to_json(lido.Sheets.Contatos), linhas);
}
assert.equal(XLSX.version, '0.20.3');
console.log('Spreadsheet security update: XLSX/XLS import and export fixtures passed.');
