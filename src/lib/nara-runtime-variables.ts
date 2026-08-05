export const NARA_RUNTIME_VARIABLE_FIELDS = [
  { key: 'consultant_on_duty_name', label: 'Consultor de plantão agora', group: 'plantao', placeholder: 'Nome do consultor que assume os leads agora' },
  { key: 'partners_on_call_phone', label: 'Número do Plantão de parceiros', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'finance_phone', label: 'Contato do financeiro', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'post_construction_phone', label: 'Contato do pós-obra', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'technical_assistance_phone', label: 'Contato da assistência técnica', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'supplies_phone', label: 'Contato de suprimentos', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'hr_phone', label: 'Contato do RH', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'marketing_phone', label: 'Contato do marketing', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'administration_phone', label: 'Contato administrativo', group: 'contatos', placeholder: '(47) 00000-0000' },
  { key: 'flow_registry_number', label: 'Matrícula do Flow', group: 'flow', placeholder: 'Número da matrícula imobiliária' },
  { key: 'flow_notary_office', label: 'Cartório do Flow', group: 'flow', placeholder: 'Nome e cidade do Registro de Imóveis' },
  { key: 'partners_response_time', label: 'Prazo de retorno — Plantão de parceiros', group: 'prazos', placeholder: 'Ex.: até 15 minutos' },
  { key: 'finance_response_time', label: 'Prazo de retorno — Financeiro', group: 'prazos', placeholder: 'Ex.: até 1 dia útil' },
  { key: 'post_construction_response_time', label: 'Prazo de retorno — Pós-obra', group: 'prazos', placeholder: 'Ex.: até 1 dia útil' },
  { key: 'technical_assistance_response_time', label: 'Prazo de retorno — Assistência técnica', group: 'prazos', placeholder: 'Ex.: até 2 dias úteis' },
  { key: 'supplies_response_time', label: 'Prazo de retorno — Suprimentos', group: 'prazos', placeholder: 'Ex.: até 1 dia útil' },
  { key: 'hr_response_time', label: 'Prazo de retorno — RH', group: 'prazos', placeholder: 'Ex.: até 2 dias úteis' },
  { key: 'marketing_response_time', label: 'Prazo de retorno — Marketing', group: 'prazos', placeholder: 'Ex.: até 1 dia útil' },
  { key: 'administration_response_time', label: 'Prazo de retorno — Administrativo', group: 'prazos', placeholder: 'Ex.: até 1 dia útil' },
] as const;

export const NARA_RUNTIME_VARIABLE_GROUPS = [
  { key: 'plantao', label: 'Plantão atual', description: 'Como não existe uma escala automática no CRM, o nome abaixo representa manualmente quem está de plantão agora.' },
  { key: 'contatos', label: 'Contatos dos setores', description: 'Números oficiais que a Nara pode usar para direcionar cada tipo de atendimento.' },
  { key: 'flow', label: 'Documentação do Flow', description: 'Dados oficiais para perguntas sobre matrícula e Registro de Imóveis.' },
  { key: 'prazos', label: 'Prazos padrão de retorno', description: 'Prazo que pode ser informado ao contato para cada setor.' },
] as const;

export type NaraRuntimeVariableKey = typeof NARA_RUNTIME_VARIABLE_FIELDS[number]['key'];
export type NaraRuntimeVariableGroup = typeof NARA_RUNTIME_VARIABLE_GROUPS[number]['key'];
export type NaraRuntimeVariables = Record<NaraRuntimeVariableKey, string>;

export function emptyNaraRuntimeVariables(): NaraRuntimeVariables {
  return Object.fromEntries(
    NARA_RUNTIME_VARIABLE_FIELDS.map((field) => [field.key, '']),
  ) as NaraRuntimeVariables;
}

export function normalizeNaraRuntimeVariables(value: unknown): NaraRuntimeVariables {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const normalized = emptyNaraRuntimeVariables();
  for (const field of NARA_RUNTIME_VARIABLE_FIELDS) {
    normalized[field.key] = String(input[field.key] ?? '').trim().slice(0, 500);
  }
  return normalized;
}

export function missingNaraRuntimeVariables(value: NaraRuntimeVariables): NaraRuntimeVariableKey[] {
  return NARA_RUNTIME_VARIABLE_FIELDS
    .filter((field) => !value[field.key].trim())
    .map((field) => field.key);
}

export function naraRuntimeVariableLabel(key: NaraRuntimeVariableKey): string {
  return NARA_RUNTIME_VARIABLE_FIELDS.find((field) => field.key === key)?.label ?? key;
}
