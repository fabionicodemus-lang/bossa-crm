import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/components/DevelopmentsManager.tsx';
let source = await readFile(path, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) throw new Error(`Trecho não encontrado: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });",
  "const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });\nconst moneyNumber = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });",
  'formatador monetário',
);

replaceOnce(
  `function numberValue(value: unknown): number {\n  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : 0;\n}`,
  `function numberValue(value: unknown): number {\n  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : 0;\n}\n\nfunction localizedNumberValue(value: unknown): number {\n  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;\n  const text = String(value ?? '').trim();\n  if (!text) return 0;\n  const normalized = text.includes(',')\n    ? text.replace(/\\./g, '').replace(',', '.')\n    : text;\n  const parsed = Number(normalized);\n  return Number.isFinite(parsed) ? parsed : 0;\n}\n\nfunction formatMoneyNumber(value: unknown): string {\n  return moneyNumber.format(numberValue(value));\n}`,
  'conversão localizada',
);

for (const field of ['list_price', 'entry_amount', 'installment_amount', 'reinforcement_amount', 'keys_amount']) {
  replaceOnce(
    `      ${field}: numberValue(form.get('${field}')),`,
    `      ${field}: localizedNumberValue(form.get('${field}')),`,
    `leitura monetária ${field}`,
  );
}

replaceOnce(
  `    const payload = {\n      status: patch.status ?? item.status,\n      typology_id: patch.typology_id ?? item.typology_id,\n      private_area_m2: nullableNumber(patch.private_area_m2 ?? item.private_area_m2),`,
  `    const unitCode = String(patch.unit_code ?? item.unit_code).trim();\n    if (!unitCode) {\n      setError('Informe o número da unidade.');\n      return;\n    }\n    const payload = {\n      unit_code: unitCode,\n      floor: nullableNumber(patch.floor ?? item.floor),\n      status: patch.status ?? item.status,\n      typology_id: patch.typology_id ?? item.typology_id,\n      private_area_m2: nullableNumber(patch.private_area_m2 ?? item.private_area_m2),`,
  'edição de identificação da unidade',
);

replaceOnce(
  `    setUnits((current) => current.map((row) => row.id === item.id ? data as DevelopmentUnit : row));\n    setNotice(\`Unidade \${item.unit_code} atualizada.\`);\n  }\n\n  async function applyAdjustment()`,
  `    setUnits((current) => current.map((row) => row.id === item.id ? data as DevelopmentUnit : row));\n    setNotice(\`Unidade \${unitCode} atualizada.\`);\n  }\n\n  async function deleteUnit(item: DevelopmentUnit) {\n    if (!canEdit || !window.confirm(\`Excluir definitivamente a unidade \${item.unit_code}? Esta ação não pode ser desfeita.\`)) return;\n    clearMessages();\n\n    const { count, error: proposalsError } = await supabase.from('proposals')\n      .select('id', { count: 'exact', head: true })\n      .eq('organization_id', organizationId)\n      .eq('unit_id', item.id);\n    if (proposalsError) {\n      setError(proposalsError.message);\n      return;\n    }\n    if ((count ?? 0) > 0) {\n      setError(\`A unidade \${item.unit_code} está vinculada a uma proposta e não pode ser excluída. Altere o status ou a unidade da proposta antes.\`);\n      return;\n    }\n\n    const { error: deleteError } = await supabase.from('development_units')\n      .delete().eq('id', item.id).eq('organization_id', organizationId);\n    if (deleteError) {\n      setError(deleteError.message);\n      return;\n    }\n    setUnits((current) => current.filter((row) => row.id !== item.id));\n    setNotice(\`Unidade \${item.unit_code} excluída.\`);\n  }\n\n  async function applyAdjustment()`,
  'exclusão da unidade',
);

replaceOnce(
  `<thead><tr><th>Unidade</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Entrada</th><th>Parcelas</th><th>Valor parcela</th><th>Reforços</th><th>Valor reforço</th><th>Chaves</th><th></th></tr></thead>\n                <tbody>{selectedUnits.map((item) => <EditableUnitRow key={item.id} item={item} typologies={selectedTypologies} canEdit={canEdit} onSave={saveUnit} />)}</tbody>`,
  `<thead><tr><th>Unidade</th><th>Andar</th><th>Tipologia</th><th>Área m²</th><th>Status</th><th>Valor</th><th>Entrada</th><th>Parcelas</th><th>Valor parcela</th><th>Reforços</th><th>Valor reforço</th><th>Chaves</th><th>Observação</th><th></th></tr></thead>\n                <tbody>{selectedUnits.map((item) => <EditableUnitRow key={item.id} item={item} typologies={selectedTypologies} canEdit={canEdit} onSave={saveUnit} onDelete={deleteUnit} />)}</tbody>`,
  'cabeçalho da tabela',
);

for (const [field, label] of [
  ['list_price', 'Valor'],
  ['entry_amount', 'Entrada'],
  ['installment_amount', 'Valor parcela'],
  ['reinforcement_amount', 'Valor reforço'],
  ['keys_amount', 'Chaves'],
]) {
  replaceOnce(
    `<div className=\"field\"><label>${label}</label><input className=\"input\" name=\"${field}\" type=\"number\" step=\"0.01\" /></div>`,
    `<div className=\"field\"><label>${label}</label><MoneyInput name=\"${field}\" /></div>`,
    `campo monetário ${field}`,
  );
}

const oldRow = `function EditableUnitRow({\n  item,\n  typologies,\n  canEdit,\n  onSave,\n}: {\n  item: DevelopmentUnit;\n  typologies: DevelopmentTypology[];\n  canEdit: boolean;\n  onSave: (item: DevelopmentUnit, patch: Partial<DevelopmentUnit>) => Promise<void>;\n}) {\n  const [draft, setDraft] = useState(item);\n\n  useEffect(() => {\n    queueMicrotask(() => setDraft(item));\n  }, [item]);\n\n  function field<K extends keyof DevelopmentUnit>(key: K, value: DevelopmentUnit[K]) {\n    setDraft((current) => ({ ...current, [key]: value }));\n  }\n\n  const typology = typologies.find((row) => row.id === draft.typology_id);\n\n  return <tr>\n    <td><strong>{item.unit_code}</strong><div className=\"faint\">{item.floor ? \`\${item.floor}º andar\` : ''}</div></td>\n    <td>{canEdit ? <select className=\"select\" style={{ minWidth: 115 }} value={draft.typology_id ?? ''} onChange={(event) => field('typology_id', event.target.value || null)}><option value=\"\">—</option>{typologies.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select> : typology?.code ?? '—'}</td>\n    <td>{canEdit ? <select className=\"select\" style={{ minWidth: 120 }} value={draft.status} onChange={(event) => field('status', event.target.value as UnitStatus)}>{Object.entries(unitStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : unitStatusLabels[item.status]}</td>\n    <MoneyCell value={draft.list_price} disabled={!canEdit} onChange={(value) => field('list_price', value)} />\n    <MoneyCell value={draft.entry_amount} disabled={!canEdit} onChange={(value) => field('entry_amount', value)} />\n    <NumberCell value={draft.installment_count} disabled={!canEdit} onChange={(value) => field('installment_count', value)} />\n    <MoneyCell value={draft.installment_amount} disabled={!canEdit} onChange={(value) => field('installment_amount', value)} />\n    <NumberCell value={draft.reinforcement_count} disabled={!canEdit} onChange={(value) => field('reinforcement_count', value)} />\n    <MoneyCell value={draft.reinforcement_amount} disabled={!canEdit} onChange={(value) => field('reinforcement_amount', value)} />\n    <MoneyCell value={draft.keys_amount} disabled={!canEdit} onChange={(value) => field('keys_amount', value)} />\n    <td>{canEdit && <button className=\"btn btn-primary btn-sm\" onClick={() => void onSave(item, draft)}>Salvar</button>}</td>\n  </tr>;\n}\n\nfunction MoneyCell({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {\n  return <td>{disabled ? money.format(numberValue(value)) : <input className=\"input mono\" style={{ width: 128 }} type=\"number\" step=\"0.01\" value={numberValue(value)} onChange={(event) => onChange(numberValue(event.target.value))} />}</td>;\n}\n\nfunction NumberCell({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {\n  return <td>{disabled ? numberValue(value) : <input className=\"input mono\" style={{ width: 75 }} type=\"number\" value={numberValue(value)} onChange={(event) => onChange(numberValue(event.target.value))} />}</td>;\n}\n`;

const newRow = `function EditableUnitRow({\n  item,\n  typologies,\n  canEdit,\n  onSave,\n  onDelete,\n}: {\n  item: DevelopmentUnit;\n  typologies: DevelopmentTypology[];\n  canEdit: boolean;\n  onSave: (item: DevelopmentUnit, patch: Partial<DevelopmentUnit>) => Promise<void>;\n  onDelete: (item: DevelopmentUnit) => Promise<void>;\n}) {\n  const [draft, setDraft] = useState(item);\n\n  useEffect(() => {\n    queueMicrotask(() => setDraft(item));\n  }, [item]);\n\n  function field<K extends keyof DevelopmentUnit>(key: K, value: DevelopmentUnit[K]) {\n    setDraft((current) => ({ ...current, [key]: value }));\n  }\n\n  const typology = typologies.find((row) => row.id === draft.typology_id);\n\n  return <tr>\n    <td>{canEdit ? <input className=\"input mono\" style={{ width: 90 }} value={draft.unit_code} onChange={(event) => field('unit_code', event.target.value)} /> : <strong>{item.unit_code}</strong>}</td>\n    <NumberCell value={draft.floor ?? 0} disabled={!canEdit} onChange={(value) => field('floor', value || null)} />\n    <td>{canEdit ? <select className=\"select\" style={{ minWidth: 150 }} value={draft.typology_id ?? ''} onChange={(event) => field('typology_id', event.target.value || null)}><option value=\"\">Sem tipologia</option>{typologies.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select> : typology?.name ?? 'Sem tipologia'}</td>\n    <DecimalCell value={draft.private_area_m2} disabled={!canEdit} onChange={(value) => field('private_area_m2', value)} />\n    <td>{canEdit ? <select className=\"select\" style={{ minWidth: 120 }} value={draft.status} onChange={(event) => field('status', event.target.value as UnitStatus)}>{Object.entries(unitStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : unitStatusLabels[item.status]}</td>\n    <MoneyCell value={draft.list_price} disabled={!canEdit} onChange={(value) => field('list_price', value)} />\n    <MoneyCell value={draft.entry_amount} disabled={!canEdit} onChange={(value) => field('entry_amount', value)} />\n    <NumberCell value={draft.installment_count} disabled={!canEdit} onChange={(value) => field('installment_count', value)} />\n    <MoneyCell value={draft.installment_amount} disabled={!canEdit} onChange={(value) => field('installment_amount', value)} />\n    <NumberCell value={draft.reinforcement_count} disabled={!canEdit} onChange={(value) => field('reinforcement_count', value)} />\n    <MoneyCell value={draft.reinforcement_amount} disabled={!canEdit} onChange={(value) => field('reinforcement_amount', value)} />\n    <MoneyCell value={draft.keys_amount} disabled={!canEdit} onChange={(value) => field('keys_amount', value)} />\n    <td>{canEdit ? <input className=\"input\" style={{ minWidth: 150 }} value={draft.notes ?? ''} onChange={(event) => field('notes', event.target.value || null)} /> : item.notes ?? '—'}</td>\n    <td>{canEdit && <div style={{ display: 'flex', gap: 6 }}><button type=\"button\" className=\"btn btn-primary btn-sm\" onClick={() => void onSave(item, draft)}>Salvar</button><button type=\"button\" className=\"btn btn-danger btn-sm\" onClick={() => void onDelete(item)}>Excluir</button></div>}</td>\n  </tr>;\n}\n\nfunction MoneyInput({\n  name,\n  value = 0,\n  disabled = false,\n  onChange,\n  width = 128,\n}: {\n  name?: string;\n  value?: number;\n  disabled?: boolean;\n  onChange?: (value: number) => void;\n  width?: number;\n}) {\n  const [numericValue, setNumericValue] = useState(numberValue(value));\n\n  useEffect(() => {\n    queueMicrotask(() => setNumericValue(numberValue(value)));\n  }, [value]);\n\n  function change(rawValue: string) {\n    const digits = rawValue.replace(/\\D/g, '');\n    const nextValue = digits ? Number(digits) / 100 : 0;\n    setNumericValue(nextValue);\n    onChange?.(nextValue);\n  }\n\n  return <>\n    {name && <input type=\"hidden\" name={name} value={numericValue} />}\n    <input\n      className=\"input mono\"\n      style={{ width }}\n      type=\"text\"\n      inputMode=\"numeric\"\n      value={formatMoneyNumber(numericValue)}\n      disabled={disabled}\n      onChange={(event) => change(event.target.value)}\n    />\n  </>;\n}\n\nfunction MoneyCell({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {\n  return <td>{disabled ? formatMoneyNumber(value) : <MoneyInput value={value} onChange={onChange} />}</td>;\n}\n\nfunction NumberCell({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {\n  return <td>{disabled ? numberValue(value) : <input className=\"input mono\" style={{ width: 75 }} type=\"number\" value={numberValue(value)} onChange={(event) => onChange(numberValue(event.target.value))} />}</td>;\n}\n\nfunction DecimalCell({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: (value: number | null) => void }) {\n  return <td>{disabled ? (value === null ? '—' : decimal.format(value)) : <input className=\"input mono\" style={{ width: 90 }} type=\"number\" step=\"0.01\" value={value ?? ''} onChange={(event) => onChange(nullableNumber(event.target.value))} />}</td>;\n}\n`;

replaceOnce(oldRow, newRow, 'linha editável da unidade');

await writeFile(path, source);
console.log('Gestão de unidades atualizada.');
