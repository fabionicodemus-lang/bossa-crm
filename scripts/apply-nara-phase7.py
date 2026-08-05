from pathlib import Path
from textwrap import dedent
import json


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: trecho encontrado {count} vez(es), esperado 1.')
    file_path.write_text(source.replace(old, new, 1), encoding='utf-8')


runtime_variables = dedent(r'''
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
''').strip() + '\n'
Path('src/lib/nara-runtime-variables.ts').write_text(runtime_variables, encoding='utf-8')


dynamic_context = dedent(r'''
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  emptyNaraRuntimeVariables,
  missingNaraRuntimeVariables,
  NARA_RUNTIME_VARIABLE_FIELDS,
  normalizeNaraRuntimeVariables,
  type NaraRuntimeVariableKey,
  type NaraRuntimeVariables,
} from './nara-runtime-variables';

export const NARA_TIME_ZONE = 'America/Sao_Paulo';

export type NaraPriorOffer = {
  id: string;
  created_at: string;
  scope: string;
  development_name: string | null;
  unit_code: string | null;
  offered_value: number | null;
  entry_amount: number | null;
  installment_amount: number | null;
  range_min: number | null;
  range_max: number | null;
  range_entry_min: number | null;
  quoted_amounts: unknown;
  reply_text: string;
  whatsapp_message_id: string | null;
};

export type NaraRuntimeVariablesState = {
  values: NaraRuntimeVariables;
  missing: NaraRuntimeVariableKey[];
  schema_ready: boolean;
  updated_at: string | null;
  error?: string;
};

export type NaraDynamicTurnContext = NaraRuntimeVariablesState & {
  generated_at: string;
  local_date_time: string;
  timezone: string;
  prior_offers: NaraPriorOffer[];
  offer_log_ready: boolean;
  source_text: string;
};

type RuntimeVariableRow = {
  values: unknown;
  updated_at: string | null;
};

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) return String(error.message ?? '');
  return String(error);
}

function missingTable(error: unknown, table: string): boolean {
  const message = errorMessage(error).toLocaleLowerCase('pt-BR');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code ?? '') : '';
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes(`could not find the table 'public.${table}'`)
    || message.includes(`relation "${table}" does not exist`)
    || message.includes('schema cache');
}

export function formatNaraLocalDateTime(value: Date | string, timezone = NARA_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'data e hora inválidas';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

function formatBrl(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function variableLines(values: NaraRuntimeVariables): string[] {
  return NARA_RUNTIME_VARIABLE_FIELDS.flatMap((field) => {
    const value = values[field.key]?.trim();
    return value ? [`- ${field.label}: ${value}`] : [];
  });
}

function offerLine(offer: NaraPriorOffer): string {
  const identity = [
    offer.development_name,
    offer.unit_code ? `unidade ${offer.unit_code}` : null,
  ].filter(Boolean).join(' — ') || 'oferta sem unidade vinculada';
  const amounts = [
    formatBrl(offer.offered_value) ? `valor ${formatBrl(offer.offered_value)}` : null,
    formatBrl(offer.entry_amount) ? `entrada ${formatBrl(offer.entry_amount)}` : null,
    formatBrl(offer.installment_amount) ? `parcela ${formatBrl(offer.installment_amount)}` : null,
    formatBrl(offer.range_min) ? `faixa mínima ${formatBrl(offer.range_min)}` : null,
    formatBrl(offer.range_max) ? `faixa máxima ${formatBrl(offer.range_max)}` : null,
    formatBrl(offer.range_entry_min) ? `entrada mínima ${formatBrl(offer.range_entry_min)}` : null,
  ].filter(Boolean).join('; ');
  return `- ${formatNaraLocalDateTime(offer.created_at)} — ${identity}${amounts ? `; ${amounts}` : ''}. Texto efetivamente enviado: “${offer.reply_text}”`;
}

export function buildNaraDynamicSourceText(args: {
  now: Date;
  variables: NaraRuntimeVariablesState;
  priorOffers: NaraPriorOffer[];
  offerLogReady: boolean;
}): string {
  const local = formatNaraLocalDateTime(args.now);
  const configured = variableLines(args.variables.values);
  const missingLabels = NARA_RUNTIME_VARIABLE_FIELDS
    .filter((field) => args.variables.missing.includes(field.key))
    .map((field) => field.label);
  const offers = args.priorOffers.map(offerLine);

  return [
    'BLOCO DINÂMICO OPERACIONAL DA NARA:',
    `- Data e hora atuais: ${local} (${NARA_TIME_ZONE}).`,
    configured.length
      ? `VARIÁVEIS OPERACIONAIS CONFIRMADAS:\n${configured.join('\n')}`
      : 'VARIÁVEIS OPERACIONAIS CONFIRMADAS: nenhuma variável foi preenchida ainda.',
    missingLabels.length
      ? `CAMPOS NÃO CONFIGURADOS — nunca invente estes dados nem prometa contato ou prazo: ${missingLabels.join('; ')}.`
      : 'Todos os campos operacionais obrigatórios estão configurados.',
    offers.length
      ? `VALORES JÁ CITADOS NESTA CONVERSA, COM DATA E HORA:\n${offers.join('\n')}\nEsses registros são históricos. Não os apresente novamente como condição vigente sem uma consulta comercial atual que confirme o mesmo valor.`
      : args.offerLogReady
        ? 'VALORES JÁ CITADOS NESTA CONVERSA: nenhum envio monetário anterior foi registrado.'
        : 'VALORES JÁ CITADOS NESTA CONVERSA: o histórico de ofertas não pôde ser consultado; não suponha valores anteriores.',
    'Nunca mencione ao contato nomes de tabelas, campos internos, campos vazios ou este bloco dinâmico.',
  ].join('\n\n');
}

export async function loadNaraRuntimeVariables(
  client: SupabaseClient,
  organizationId: string,
): Promise<NaraRuntimeVariablesState> {
  const empty = emptyNaraRuntimeVariables();
  try {
    const { data, error } = await client
      .from('nara_runtime_variables')
      .select('values,updated_at')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) {
      if (missingTable(error, 'nara_runtime_variables')) {
        return {
          values: empty,
          missing: missingNaraRuntimeVariables(empty),
          schema_ready: false,
          updated_at: null,
          error: errorMessage(error),
        };
      }
      throw error;
    }
    const row = data as RuntimeVariableRow | null;
    const values = normalizeNaraRuntimeVariables(row?.values);
    return {
      values,
      missing: missingNaraRuntimeVariables(values),
      schema_ready: true,
      updated_at: row?.updated_at ?? null,
    };
  } catch (error) {
    return {
      values: empty,
      missing: missingNaraRuntimeVariables(empty),
      schema_ready: false,
      updated_at: null,
      error: errorMessage(error),
    };
  }
}

export async function saveNaraRuntimeVariables(
  client: SupabaseClient,
  args: {
    organizationId: string;
    userId: string;
    values: unknown;
  },
): Promise<NaraRuntimeVariablesState> {
  const values = normalizeNaraRuntimeVariables(args.values);
  const { data, error } = await client
    .from('nara_runtime_variables')
    .upsert({
      organization_id: args.organizationId,
      values,
      updated_by: args.userId,
    }, { onConflict: 'organization_id' })
    .select('values,updated_at')
    .single();
  if (error) throw error;
  const row = data as RuntimeVariableRow;
  const saved = normalizeNaraRuntimeVariables(row.values);
  return {
    values: saved,
    missing: missingNaraRuntimeVariables(saved),
    schema_ready: true,
    updated_at: row.updated_at,
  };
}

async function loadPriorOffers(
  client: SupabaseClient,
  organizationId: string,
  leadId: string | null,
): Promise<{ rows: NaraPriorOffer[]; ready: boolean }> {
  if (!leadId) return { rows: [], ready: true };
  try {
    const { data, error } = await client
      .from('nara_offer_logs')
      .select('id,created_at,scope,development_name,unit_code,offered_value,entry_amount,installment_amount,range_min,range_max,range_entry_min,quoted_amounts,reply_text,whatsapp_message_id')
      .eq('organization_id', organizationId)
      .eq('lead_id', leadId)
      .eq('delivery_status', 'sent')
      .order('created_at', { ascending: true })
      .limit(20);
    if (error) {
      if (missingTable(error, 'nara_offer_logs')) return { rows: [], ready: false };
      throw error;
    }
    return { rows: (data ?? []) as NaraPriorOffer[], ready: true };
  } catch (error) {
    console.error('[nara dynamic prior offers]', errorMessage(error));
    return { rows: [], ready: false };
  }
}

export async function loadNaraDynamicTurnContext(
  client: SupabaseClient,
  organizationId: string,
  leadId: string | null,
  now = new Date(),
): Promise<NaraDynamicTurnContext> {
  const [variables, offers] = await Promise.all([
    loadNaraRuntimeVariables(client, organizationId),
    loadPriorOffers(client, organizationId, leadId),
  ]);
  return {
    ...variables,
    generated_at: now.toISOString(),
    local_date_time: formatNaraLocalDateTime(now),
    timezone: NARA_TIME_ZONE,
    prior_offers: offers.rows,
    offer_log_ready: offers.ready,
    source_text: buildNaraDynamicSourceText({
      now,
      variables,
      priorOffers: offers.rows,
      offerLogReady: offers.ready,
    }),
  };
}
''').strip() + '\n'
Path('src/lib/nara-dynamic-context.ts').write_text(dynamic_context, encoding='utf-8')


migration = dedent(r'''
-- BOSSA CRM — bloco dinâmico e variáveis operacionais da Nara
-- Execute depois de 017_nara_offer_logs.sql.

create table if not exists public.nara_runtime_variables (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(values) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nara_runtime_variables enable row level security;

drop policy if exists nara_runtime_variables_select_member on public.nara_runtime_variables;
create policy nara_runtime_variables_select_member
  on public.nara_runtime_variables for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists nara_runtime_variables_insert_admin on public.nara_runtime_variables;
create policy nara_runtime_variables_insert_admin
  on public.nara_runtime_variables for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists nara_runtime_variables_update_admin on public.nara_runtime_variables;
create policy nara_runtime_variables_update_admin
  on public.nara_runtime_variables for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists nara_runtime_variables_delete_admin on public.nara_runtime_variables;
create policy nara_runtime_variables_delete_admin
  on public.nara_runtime_variables for delete to authenticated
  using (private.is_org_admin(organization_id));

drop trigger if exists nara_runtime_variables_set_updated_at on public.nara_runtime_variables;
create trigger nara_runtime_variables_set_updated_at
  before update on public.nara_runtime_variables
  for each row execute procedure public.set_updated_at();

grant select, insert, update, delete on public.nara_runtime_variables to authenticated;
''').strip() + '\n'
Path('supabase/migrations/018_nara_dynamic_context.sql').write_text(migration, encoding='utf-8')


# ai.ts
replace_once(
    'src/lib/ai.ts',
    "import { extractNaraPrompt } from './nara-prompt-config';\nimport { asksProtectedCommercialDetail, isGeneralPriceRangeReply } from './nara-price-levels';",
    "import { extractNaraPrompt } from './nara-prompt-config';\nimport type { NaraDynamicTurnContext } from './nara-dynamic-context';\nimport { asksProtectedCommercialDetail, isGeneralPriceRangeReply } from './nara-price-levels';",
    'Importação do contexto dinâmico em ai.ts',
)
replace_once(
    'src/lib/ai.ts',
    "  commercial?: NaraCommercialTurnContext | null;\n}",
    "  commercial?: NaraCommercialTurnContext | null;\n  dynamic?: NaraDynamicTurnContext | null;\n}",
    'Campo dynamic em AiTrainingContext',
)
replace_once(
    'src/lib/ai.ts',
    "function dynamicLeadContext(lead: Lead, context: AiTrainingContext): string {\n  const commercial = context.commercial?.source_text?.trim();\n  return `DADOS DINÂMICOS DESTA CONVERSA:\\nContato: ${lead.name}.\\nEtapa atual: ${lead.stage}.\\nDados atuais: ${JSON.stringify(lead.metadata || {})}.${commercial ? `\\n\\nCONSULTAS COMERCIAIS DESTE TURNO — FONTE ATUAL DO SISTEMA:\\n${commercial}\\n\\nUse somente esses retornos para preço e disponibilidade neste turno. Nunca mencione nomes internos de função ou banco. Resultado vazio significa que não há unidade disponível comprovada para informar, sem explicar o motivo.` : ''}`;\n}",
    "function dynamicLeadContext(lead: Lead, context: AiTrainingContext): string {\n  const commercial = context.commercial?.source_text?.trim();\n  const runtime = context.dynamic?.source_text?.trim();\n  return `DADOS DINÂMICOS DESTA CONVERSA:\\nContato: ${lead.name}.\\nEtapa atual: ${lead.stage}.\\nDados atuais: ${JSON.stringify(lead.metadata || {})}.${runtime ? `\\n\\n${runtime}` : ''}${commercial ? `\\n\\nCONSULTAS COMERCIAIS DESTE TURNO — FONTE ATUAL DO SISTEMA:\\n${commercial}\\n\\nUse somente esses retornos para preço e disponibilidade neste turno. Nunca mencione nomes internos de função ou banco. Resultado vazio significa que não há unidade disponível comprovada para informar, sem explicar o motivo.` : ''}`;\n}",
    'Bloco dinâmico de ai.ts',
)

# Enriquecer roteamento determinístico com contatos configurados.
replace_once(
    'src/lib/ai.ts',
    "function outsideBuyerReply(history: ChatMessage[]): string {\n  const destination = outsideBuyerDestination(history);\n  if (destination === 'plantao') {\n    return 'Vou direcionar você para o Plantão da Bossa, que atende corretores parceiros.';\n  }\n  if (destination === 'pos_venda') {\n    return 'Vou encaminhar você para o pós-venda da Bossa; por favor, diga em uma frase qual é o assunto para a equipe continuar.';\n  }\n  return 'Vou encaminhar você para a equipe responsável da Bossa; por favor, diga em uma frase qual atendimento precisa.';\n}",
    "function runtimeVariable(context: AiTrainingContext, key: keyof NonNullable<AiTrainingContext['dynamic']>['values']): string {\n  return context.dynamic?.values[key]?.trim() ?? '';\n}\n\nfunction outsideBuyerReply(history: ChatMessage[], context: AiTrainingContext): string {\n  const destination = outsideBuyerDestination(history);\n  const current = routingText(lastUserText(history));\n  const consultant = runtimeVariable(context, 'consultant_on_duty_name');\n  if (destination === 'plantao') {\n    const phone = runtimeVariable(context, 'partners_on_call_phone');\n    if (phone) return `O Plantão da Bossa atende pelo ${phone}. Vou direcionar você${consultant ? ` para ${consultant}` : ''} continuar.`;\n    return 'Vou direcionar você para o Plantão da Bossa, que atende corretores parceiros.';\n  }\n  if (destination === 'pos_venda') {\n    const phone = /\\b(boleto|financeiro|parcela|pagamento)\\b/.test(current)\n      ? runtimeVariable(context, 'finance_phone')\n      : /\\b(assistencia|problema|defeito|manutencao)\\b/.test(current)\n        ? runtimeVariable(context, 'technical_assistance_phone')\n        : runtimeVariable(context, 'post_construction_phone');\n    if (phone) return `O setor responsável atende pelo ${phone}. Vou encaminhar seu pedido para a equipe continuar.`;\n    return 'Vou encaminhar você para o pós-venda da Bossa; por favor, diga em uma frase qual é o assunto para a equipe continuar.';\n  }\n  const phone = /\\b(fornecedor|prestador|suprimento)\\b/.test(current)\n    ? runtimeVariable(context, 'supplies_phone')\n    : /\\b(curriculo|vaga|trabalhar)\\b/.test(current)\n      ? runtimeVariable(context, 'hr_phone')\n      : /\\b(imprensa|marketing|midia)\\b/.test(current)\n        ? runtimeVariable(context, 'marketing_phone')\n        : runtimeVariable(context, 'administration_phone');\n  if (phone) return `A equipe responsável atende pelo ${phone}. Vou encaminhar seu pedido para o setor correto.`;\n  return 'Vou encaminhar você para a equipe responsável da Bossa; por favor, diga em uma frase qual atendimento precisa.';\n}",
    'Roteamento com variáveis operacionais',
)
replace_once(
    'src/lib/ai.ts',
    "    turn.reply = ensureFirstTurnIntroduction(outsideBuyerReply(history), history, context);",
    "    turn.reply = ensureFirstTurnIntroduction(outsideBuyerReply(history, context), history, context);",
    'Chamada do roteamento com contexto',
)


# webhookProcessor.ts
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    "import { loadAiContext } from '@/lib/ai-context';\nimport { recordAiUsage } from '@/lib/ai-usage';",
    "import { loadAiContext } from '@/lib/ai-context';\nimport { recordAiUsage } from '@/lib/ai-usage';\nimport { loadNaraDynamicTurnContext } from '@/lib/nara-dynamic-context';",
    'Importação do contexto dinâmico no webhook',
)
replace_once(
    'src/lib/whatsapp/webhookProcessor.ts',
    "  if (lead.kind === 'cliente') {\n    context.commercial = await loadNaraCommercialTurnContext(\n      args.admin,\n      args.channel.organization_id,\n      lead,\n      history,\n    );\n  }",
    "  if (lead.kind === 'cliente') {\n    const [commercial, dynamic] = await Promise.all([\n      loadNaraCommercialTurnContext(\n        args.admin,\n        args.channel.organization_id,\n        lead,\n        history,\n      ),\n      loadNaraDynamicTurnContext(\n        args.admin,\n        args.channel.organization_id,\n        lead.id,\n      ),\n    ]);\n    context.commercial = commercial;\n    context.dynamic = dynamic;\n  }",
    'Carregamento dinâmico no webhook',
)


# API de treinamento
replace_once(
    'src/app/api/ai-training/route.ts',
    "import { buildAiInstructions, generateAiTurn, type AiFileOption, type AiTrainingContext } from '@/lib/ai';\nimport { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';",
    "import { buildAiInstructions, generateAiTurn, type AiFileOption, type AiTrainingContext } from '@/lib/ai';\nimport { loadNaraDynamicTurnContext, loadNaraRuntimeVariables, saveNaraRuntimeVariables } from '@/lib/nara-dynamic-context';\nimport { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';",
    'Importação dinâmica na API',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    || message.includes('ai_files')\n    || message.includes('schema cache');",
    "    || message.includes('ai_files')\n    || message.includes('nara_runtime_variables')\n    || message.includes('nara_offer_logs')\n    || message.includes('schema cache');",
    'Erros das tabelas dinâmicas',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    const [config, examples, files] = await Promise.all([\n      loadConfig(context.supabase, context.organizationId, agentRaw),\n      loadExamples(context.supabase, context.organizationId, agentRaw),\n      loadFiles(context.supabase, context.organizationId, agentRaw),\n    ]);",
    "    const [config, examples, files, runtimeVariables] = await Promise.all([\n      loadConfig(context.supabase, context.organizationId, agentRaw),\n      loadExamples(context.supabase, context.organizationId, agentRaw),\n      loadFiles(context.supabase, context.organizationId, agentRaw),\n      agentRaw === 'nara'\n        ? loadNaraRuntimeVariables(context.supabase, context.organizationId)\n        : Promise.resolve(null),\n    ]);",
    'Carregamento de variáveis no GET',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "      prompt: buildAiInstructions(lead, aiContext),\n      ai: aiStatus(files.length),",
    "      prompt: buildAiInstructions(lead, aiContext),\n      ai: aiStatus(files.length),\n      runtime_variables: runtimeVariables,",
    'Retorno das variáveis no GET',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "  const body = await request.json().catch(() => ({})) as { agent?: unknown; config?: unknown };\n  if (!isAgent(body.agent)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400 });\n  try {\n    const config = normalizeConfig(body.agent, body.config);",
    "  const body = await request.json().catch(() => ({})) as { agent?: unknown; config?: unknown; action?: unknown; variables?: unknown };\n  if (!isAgent(body.agent)) return NextResponse.json({ error: 'Agente inválido.' }, { status: 400 });\n  try {\n    if (body.action === 'variables') {\n      if (body.agent !== 'nara') return NextResponse.json({ error: 'Variáveis operacionais existem somente para a Nara.' }, { status: 400 });\n      const runtimeVariables = await saveNaraRuntimeVariables(context.supabase, {\n        organizationId: context.organizationId,\n        userId: context.user.id,\n        values: body.variables,\n      });\n      return NextResponse.json({ ok: true, runtime_variables: runtimeVariables });\n    }\n\n    const config = normalizeConfig(body.agent, body.config);",
    'Salvamento das variáveis no PUT',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    if (body.agent === 'nara') {\n      aiContext.commercial = await loadNaraCommercialTurnContext(\n        context.supabase,\n        context.organizationId,\n        lead,\n        messages,\n      );\n    }",
    "    if (body.agent === 'nara') {\n      const [commercial, dynamic] = await Promise.all([\n        loadNaraCommercialTurnContext(\n          context.supabase,\n          context.organizationId,\n          lead,\n          messages,\n        ),\n        loadNaraDynamicTurnContext(\n          context.supabase,\n          context.organizationId,\n          null,\n        ),\n      ]);\n      aiContext.commercial = commercial;\n      aiContext.dynamic = dynamic;\n    }",
    'Contexto dinâmico no simulador',
)


# Tela da Nara
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "import { PageTopbar } from '@/components/PageTopbar';",
    "import { PageTopbar } from '@/components/PageTopbar';\nimport {\n  emptyNaraRuntimeVariables,\n  NARA_RUNTIME_VARIABLE_FIELDS,\n  NARA_RUNTIME_VARIABLE_GROUPS,\n  type NaraRuntimeVariableKey,\n  type NaraRuntimeVariables,\n} from '@/lib/nara-runtime-variables';",
    'Importação das variáveis na tela',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "type Tab = 'simulador' | 'persona' | 'base' | 'correcoes' | 'prompt';",
    "type Tab = 'simulador' | 'persona' | 'base' | 'correcoes' | 'variaveis' | 'prompt';",
    'Nova aba de variáveis',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "type SimulationResult = {\n  classification: string;\n  score: number;\n  stage: string;\n  handoff: boolean;\n  attachments: Array<{ id: string; title: string; category: string; original_name: string }>;\n};",
    "type SimulationResult = {\n  classification: string;\n  score: number;\n  stage: string;\n  handoff: boolean;\n  attachments: Array<{ id: string; title: string; category: string; original_name: string }>;\n};\n\ntype RuntimeVariablesState = {\n  values: NaraRuntimeVariables;\n  missing: NaraRuntimeVariableKey[];\n  schema_ready: boolean;\n  updated_at: string | null;\n  error?: string;\n};",
    'Tipo do estado de variáveis',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "  const [lastSimulation, setLastSimulation] = useState<SimulationResult | null>(null);",
    "  const [lastSimulation, setLastSimulation] = useState<SimulationResult | null>(null);\n  const [runtimeVariables, setRuntimeVariables] = useState<NaraRuntimeVariables>(() => emptyNaraRuntimeVariables());\n  const [missingRuntimeVariables, setMissingRuntimeVariables] = useState<NaraRuntimeVariableKey[]>(() => NARA_RUNTIME_VARIABLE_FIELDS.map((field) => field.key));\n  const [runtimeVariablesSchemaReady, setRuntimeVariablesSchemaReady] = useState(true);\n  const [runtimeVariablesUpdatedAt, setRuntimeVariablesUpdatedAt] = useState<string | null>(null);\n  const [savingVariables, setSavingVariables] = useState(false);",
    'Estados das variáveis',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "        { key: 'correcoes', label: `✏️ Correções (${examples.length})` },\n        { key: 'prompt', label: '📄 Prompt final' },",
    "        { key: 'correcoes', label: `✏️ Correções (${examples.length})` },\n        { key: 'variaveis', label: `⚙️ Variáveis${missingRuntimeVariables.length ? ` (${missingRuntimeVariables.length})` : ''}` },\n        { key: 'prompt', label: '📄 Prompt final' },",
    'Aba de variáveis na navegação',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "        const data = await readJson<{ config: AgentConfig; examples: TrainingExample[]; ai?: AiStatus }>(response);",
    "        const data = await readJson<{ config: AgentConfig; examples: TrainingExample[]; ai?: AiStatus; runtime_variables?: RuntimeVariablesState | null }>(response);",
    'Resposta de carregamento com variáveis',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "        setExamples(data.examples);\n        setAi(data.ai ?? null);",
    "        setExamples(data.examples);\n        setAi(data.ai ?? null);\n        if (agent === 'nara' && data.runtime_variables) {\n          setRuntimeVariables(data.runtime_variables.values);\n          setMissingRuntimeVariables(data.runtime_variables.missing);\n          setRuntimeVariablesSchemaReady(data.runtime_variables.schema_ready);\n          setRuntimeVariablesUpdatedAt(data.runtime_variables.updated_at);\n        }",
    'Aplicação das variáveis carregadas',
)

insert_after_save = """  async function saveConfig() {
    if (isNara && !promptText.trim()) {
      setError('O prompt final da Nara não pode ficar vazio.');
      setTab('prompt');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    const configToSave = isNara ? naraConfigWithPrompt(config, promptText) : config;
    try {
      await readJson<{ ok: boolean }>(await fetch('/api/ai-training', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent, config: configToSave }),
      }));
      setConfig(configToSave);
      setNotice(isNara ? 'Prompt final da Nara salvo e aplicado ao simulador e ao atendimento.' : 'Configuração salva. O prompt final foi atualizado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }
"""
insert_with_variables = insert_after_save + """
  function updateRuntimeVariable(key: NaraRuntimeVariableKey, value: string) {
    setRuntimeVariables((current) => ({ ...current, [key]: value }));
    setMissingRuntimeVariables((current) => value.trim()
      ? current.filter((item) => item !== key)
      : current.includes(key) ? current : [...current, key]);
  }

  async function saveRuntimeVariables() {
    setSavingVariables(true);
    setError('');
    setNotice('');
    try {
      const data = await readJson<{ ok: boolean; runtime_variables: RuntimeVariablesState }>(await fetch('/api/ai-training', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent: 'nara', action: 'variables', variables: runtimeVariables }),
      }));
      setRuntimeVariables(data.runtime_variables.values);
      setMissingRuntimeVariables(data.runtime_variables.missing);
      setRuntimeVariablesSchemaReady(data.runtime_variables.schema_ready);
      setRuntimeVariablesUpdatedAt(data.runtime_variables.updated_at);
      setNotice(data.runtime_variables.missing.length
        ? `Variáveis salvas. Ainda existem ${data.runtime_variables.missing.length} campos vazios.`
        : 'Variáveis operacionais salvas. O bloco dinâmico da Nara está completo.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar as variáveis.');
    } finally {
      setSavingVariables(false);
    }
  }
"""
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    insert_after_save,
    insert_with_variables,
    'Funções de edição e salvamento das variáveis',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "      actions={<button className=\"btn btn-primary btn-sm\" onClick={saveConfig} disabled={saving || loading}>{saving ? 'Salvando...' : isNara ? 'Salvar prompt da Nara' : 'Salvar treinamento'}</button>}",
    "      actions={<button\n        className=\"btn btn-primary btn-sm\"\n        onClick={isNara && tab === 'variaveis' ? saveRuntimeVariables : saveConfig}\n        disabled={loading || (isNara && tab === 'variaveis' ? savingVariables || !runtimeVariablesSchemaReady : saving)}\n      >{isNara && tab === 'variaveis'\n          ? savingVariables ? 'Salvando...' : 'Salvar variáveis'\n          : saving ? 'Salvando...' : isNara ? 'Salvar prompt da Nara' : 'Salvar treinamento'}</button>}",
    'Botão principal sensível à aba',
)

variables_panel = dedent(r'''
      {!loading && isNara && tab === 'variaveis' && <div className="grid">
        {!runtimeVariablesSchemaReady && <div className="error-box">
          <strong>Estrutura pendente no Supabase:</strong> execute a migration <code>018_nara_dynamic_context.sql</code> antes de salvar estes campos.
        </div>}
        {runtimeVariablesSchemaReady && missingRuntimeVariables.length > 0 && <div className="info-box" style={{ borderColor: '#f59e0b' }}>
          <strong>Atenção:</strong> {missingRuntimeVariables.length} de {NARA_RUNTIME_VARIABLE_FIELDS.length} campos estão vazios. A Nara não inventará contato, documento ou prazo ausente.
        </div>}
        {runtimeVariablesSchemaReady && missingRuntimeVariables.length === 0 && <div className="success-box">
          Todos os campos operacionais obrigatórios estão preenchidos.
        </div>}
        {NARA_RUNTIME_VARIABLE_GROUPS.map((group) => {
          const fields = NARA_RUNTIME_VARIABLE_FIELDS.filter((field) => field.group === group.key);
          return <section className="card" key={group.key}>
            <div className="card-head">
              <div><h3>{group.label}</h3><small className="muted">{group.description}</small></div>
              <span className="chip">{fields.filter((field) => runtimeVariables[field.key].trim()).length}/{fields.length}</span>
            </div>
            <div className="card-body grid grid-2">
              {fields.map((field) => {
                const missing = !runtimeVariables[field.key].trim();
                return <div className="field" key={field.key}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{field.label}</span>
                    {missing && <span className="chip chip-orange">Pendente</span>}
                  </label>
                  <input
                    className="input"
                    value={runtimeVariables[field.key]}
                    placeholder={field.placeholder}
                    disabled={!runtimeVariablesSchemaReady}
                    onChange={(event) => updateRuntimeVariable(field.key, event.target.value)}
                  />
                </div>;
              })}
            </div>
          </section>;
        })}
        <section className="card">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {runtimeVariablesUpdatedAt ? `Última atualização: ${new Date(runtimeVariablesUpdatedAt).toLocaleString('pt-BR')}` : 'As variáveis ainda não foram salvas.'}
            </div>
            <button className="btn btn-primary" onClick={saveRuntimeVariables} disabled={savingVariables || !runtimeVariablesSchemaReady}>
              {savingVariables ? 'Salvando...' : 'Salvar variáveis operacionais'}
            </button>
          </div>
        </section>
      </div>}

''')
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "      {!loading && tab === 'prompt' && <section className=\"card\">",
    variables_panel + "      {!loading && tab === 'prompt' && <section className=\"card\">",
    'Painel de variáveis na tela',
)


# README de migrations
replace_once(
    'supabase/migrations/README.md',
    "17. `016_nara_prompt_final.sql`",
    "17. `016_nara_prompt_final.sql`\n18. `017_nara_offer_logs.sql`\n19. `018_nara_dynamic_context.sql`",
    'Ordem canônica das migrations',
)
replace_once(
    'supabase/migrations/README.md',
    "5. A partir da próxima migration, usar numeração única e crescente. O próximo número disponível é `017`.",
    "5. A partir da próxima migration, usar numeração única e crescente. O próximo número disponível é `019`.",
    'Próxima numeração de migration',
)


# Testes
check = dedent(r'''
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildNaraDynamicSourceText,
  formatNaraLocalDateTime,
  loadNaraDynamicTurnContext,
  loadNaraRuntimeVariables,
} from '../src/lib/nara-dynamic-context.ts';
import {
  emptyNaraRuntimeVariables,
  missingNaraRuntimeVariables,
  normalizeNaraRuntimeVariables,
  NARA_RUNTIME_VARIABLE_FIELDS,
} from '../src/lib/nara-runtime-variables.ts';

class Query {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.ordering = null;
    this.maxRows = null;
  }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  order(column, options = {}) { this.ordering = { column, ascending: options.ascending !== false }; return this; }
  limit(value) { this.maxRows = value; return this; }
  execute() {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      data = [...data].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
    }
    if (this.maxRows !== null) data = data.slice(0, this.maxRows);
    return Promise.resolve({ data, error: null });
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  maybeSingle() { return this.execute().then(({ data, error }) => ({ data: data[0] ?? null, error })); }
}

class FakeSupabase {
  constructor(tables) { this.tables = tables; }
  from(name) { return new Query(this.tables[name] ?? []); }
}

const complete = Object.fromEntries(NARA_RUNTIME_VARIABLE_FIELDS.map((field) => [field.key, `${field.label} preenchido`]));
const normalized = normalizeNaraRuntimeVariables({ ...complete, unknown: 'ignorado' });
assert.equal(missingNaraRuntimeVariables(normalized).length, 0);
assert.equal(Object.keys(normalized).length, NARA_RUNTIME_VARIABLE_FIELDS.length);
assert.equal(emptyNaraRuntimeVariables().consultant_on_duty_name, '');

const partial = normalizeNaraRuntimeVariables({ consultant_on_duty_name: 'Ana', finance_phone: '47999999999' });
assert.ok(missingNaraRuntimeVariables(partial).includes('partners_on_call_phone'));
assert.equal(formatNaraLocalDateTime('2026-08-04T23:00:00.000Z').includes('20:00'), true);

const variablesRow = {
  organization_id: 'org',
  values: normalized,
  updated_at: '2026-08-04T20:00:00Z',
};
const offerRows = [
  {
    id: 'sent-1', organization_id: 'org', lead_id: 'lead', delivery_status: 'sent',
    created_at: '2026-08-04T20:10:00Z', scope: 'unit', development_name: 'Flow Aptos', unit_code: '901',
    offered_value: 900000, entry_amount: 180000, installment_amount: 4500,
    range_min: null, range_max: null, range_entry_min: null, quoted_amounts: [],
    reply_text: 'A unidade 901 está por R$ 900 mil, com entrada de R$ 180 mil.', whatsapp_message_id: 'wamid-1',
  },
  {
    id: 'failed-1', organization_id: 'org', lead_id: 'lead', delivery_status: 'failed',
    created_at: '2026-08-04T20:20:00Z', scope: 'unit', development_name: 'Flow Aptos', unit_code: '1001',
    offered_value: 950000, entry_amount: 190000, installment_amount: null,
    range_min: null, range_max: null, range_entry_min: null, quoted_amounts: [],
    reply_text: 'Esta mensagem não chegou ao lead.', whatsapp_message_id: null,
  },
];
const client = new FakeSupabase({ nara_runtime_variables: [variablesRow], nara_offer_logs: offerRows });
const state = await loadNaraRuntimeVariables(client, 'org');
assert.equal(state.schema_ready, true);
assert.equal(state.values.consultant_on_duty_name, complete.consultant_on_duty_name);

const dynamic = await loadNaraDynamicTurnContext(client, 'org', 'lead', new Date('2026-08-04T23:00:00.000Z'));
assert.equal(dynamic.prior_offers.length, 1);
assert.equal(dynamic.prior_offers[0].unit_code, '901');
assert.match(dynamic.source_text, /Data e hora atuais:/);
assert.match(dynamic.source_text, /Consultor de plantão agora preenchido/);
assert.match(dynamic.source_text, /unidade 901/);
assert.match(dynamic.source_text, /R\$\s*900\.000,00/);
assert.match(dynamic.source_text, /Texto efetivamente enviado/);
assert.doesNotMatch(dynamic.source_text, /1001/);
assert.match(dynamic.source_text, /não os apresente novamente como condição vigente/i);

const emptyState = {
  values: emptyNaraRuntimeVariables(),
  missing: NARA_RUNTIME_VARIABLE_FIELDS.map((field) => field.key),
  schema_ready: false,
  updated_at: null,
};
const emptySource = buildNaraDynamicSourceText({
  now: new Date('2026-08-04T23:00:00.000Z'),
  variables: emptyState,
  priorOffers: [],
  offerLogReady: false,
});
assert.match(emptySource, /nunca invente/i);
assert.match(emptySource, /histórico de ofertas não pôde ser consultado/i);

const aiSource = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const webhookSource = await readFile(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../src/app/(crm)/treinamento/[agente]/page.tsx', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../supabase/migrations/018_nara_dynamic_context.sql', import.meta.url), 'utf8');

assert.match(aiSource, /context\.dynamic\?\.source_text/);
assert.match(aiSource, /outsideBuyerReply\(history, context\)/);
assert.match(webhookSource, /loadNaraDynamicTurnContext/);
assert.match(webhookSource, /const \[commercial, dynamic\] = await Promise\.all/);
assert.match(apiSource, /body\.action === 'variables'/);
assert.match(apiSource, /aiContext\.dynamic = dynamic/);
assert.match(pageSource, /Variáveis operacionais/);
assert.match(pageSource, /Pendente/);
assert.match(pageSource, /018_nara_dynamic_context\.sql/);
assert.match(migrationSource, /create table if not exists public\.nara_runtime_variables/);
assert.match(migrationSource, /private\.is_org_admin/);

console.log('Fase 7 validada: data e hora, histórico de ofertas, consultor e variáveis operacionais no contexto da Nara.');
''').strip() + '\n'
Path('scripts/check-nara-dynamic-context.mjs').write_text(check, encoding='utf-8')


# package.json
package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package['scripts']['test:nara-dynamic-context'] = 'node --experimental-strip-types scripts/check-nara-dynamic-context.mjs'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Fase 7 aplicada aos arquivos de trabalho.')
