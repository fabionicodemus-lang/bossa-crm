from pathlib import Path
from textwrap import dedent
import json


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding='utf-8')
    if old not in source:
        raise SystemExit(f'{label}: trecho não encontrado.')
    file_path.write_text(source.replace(old, new, 1), encoding='utf-8')


prompt_versions = dedent(r'''
import type { SupabaseClient } from '@supabase/supabase-js';

export type NaraPromptVersionReason = 'save' | 'restore_backup';

export type NaraPromptVersion = {
  id: string;
  organization_id: string;
  prompt_text: string;
  reason: NaraPromptVersionReason;
  restored_from_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type NaraPromptVersionsState = {
  versions: NaraPromptVersion[];
  schema_ready: boolean;
  error?: string;
};

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) return String(error.message ?? '');
  return String(error);
}

function missingTable(error: unknown): boolean {
  const message = errorMessage(error).toLocaleLowerCase('pt-BR');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code ?? '') : '';
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes("could not find the table 'public.nara_prompt_versions'")
    || message.includes('relation "nara_prompt_versions" does not exist')
    || message.includes('schema cache');
}

const VERSION_FIELDS = 'id,organization_id,prompt_text,reason,restored_from_id,created_by,created_at';

export async function loadNaraPromptVersions(
  client: SupabaseClient,
  organizationId: string,
  limit = 50,
): Promise<NaraPromptVersionsState> {
  try {
    const { data, error } = await client
      .from('nara_prompt_versions')
      .select(VERSION_FIELDS)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)));
    if (error) {
      if (missingTable(error)) return { versions: [], schema_ready: false, error: errorMessage(error) };
      throw error;
    }
    return { versions: (data ?? []) as NaraPromptVersion[], schema_ready: true };
  } catch (error) {
    if (missingTable(error)) return { versions: [], schema_ready: false, error: errorMessage(error) };
    throw error;
  }
}

export async function getNaraPromptVersion(
  client: SupabaseClient,
  organizationId: string,
  versionId: string,
): Promise<NaraPromptVersion | null> {
  const { data, error } = await client
    .from('nara_prompt_versions')
    .select(VERSION_FIELDS)
    .eq('organization_id', organizationId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw error;
  return data as NaraPromptVersion | null;
}

export async function archiveNaraPromptVersion(
  client: SupabaseClient,
  args: {
    organizationId: string;
    promptText: string;
    createdBy: string;
    reason: NaraPromptVersionReason;
    restoredFromId?: string | null;
  },
): Promise<NaraPromptVersion> {
  const promptText = args.promptText.trim();
  if (!promptText) throw new Error('O prompt anterior da Nara está vazio e não pode ser versionado.');
  const { data, error } = await client
    .from('nara_prompt_versions')
    .insert({
      organization_id: args.organizationId,
      prompt_text: promptText,
      reason: args.reason,
      restored_from_id: args.restoredFromId ?? null,
      created_by: args.createdBy,
    })
    .select(VERSION_FIELDS)
    .single();
  if (error) throw error;
  return data as NaraPromptVersion;
}
''').strip() + '\n'
Path('src/lib/nara-prompt-versions.ts').write_text(prompt_versions, encoding='utf-8')


simulator_diagnostics = dedent(r'''
import type { NaraCommercialTurnContext } from './nara-unit-queries';

export type NaraSimulatorCommercialDiagnostics = {
  price_consulted: boolean;
  returned_units: string[];
  consultation_names: string[];
};

export function countReplyWords(reply: string): number {
  const normalized = reply.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function unitFromResult(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const unit = 'unidade' in value ? String(value.unidade ?? '').trim() : '';
  return unit || null;
}

export function naraCommercialDiagnostics(
  commercial: NaraCommercialTurnContext | null | undefined,
): NaraSimulatorCommercialDiagnostics {
  const calls = commercial?.calls ?? [];
  const units = new Set<string>();
  for (const call of calls) {
    if (Array.isArray(call.result)) {
      for (const row of call.result) {
        const unit = unitFromResult(row);
        if (unit) units.add(unit);
      }
      continue;
    }
    const unit = unitFromResult(call.result);
    if (unit) units.add(unit);
  }
  return {
    price_consulted: calls.length > 0,
    returned_units: [...units],
    consultation_names: calls.map((call) => call.name),
  };
}
''').strip() + '\n'
Path('src/lib/nara-simulator-diagnostics.ts').write_text(simulator_diagnostics, encoding='utf-8')


migration = dedent(r'''
-- BOSSA CRM — histórico versionado do Prompt final da Nara
-- Execute depois de 018_nara_dynamic_context.sql.

create table if not exists public.nara_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prompt_text text not null check (char_length(prompt_text) between 1 and 100000),
  reason text not null default 'save' check (reason in ('save', 'restore_backup')),
  restored_from_id uuid references public.nara_prompt_versions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists nara_prompt_versions_org_created_idx
  on public.nara_prompt_versions (organization_id, created_at desc);

alter table public.nara_prompt_versions enable row level security;

drop policy if exists nara_prompt_versions_select_admin on public.nara_prompt_versions;
create policy nara_prompt_versions_select_admin
  on public.nara_prompt_versions for select to authenticated
  using (private.is_org_admin(organization_id));

drop policy if exists nara_prompt_versions_insert_admin on public.nara_prompt_versions;
create policy nara_prompt_versions_insert_admin
  on public.nara_prompt_versions for insert to authenticated
  with check (private.is_org_admin(organization_id));

grant select, insert on public.nara_prompt_versions to authenticated;
''').strip() + '\n'
Path('supabase/migrations/019_nara_prompt_versions.sql').write_text(migration, encoding='utf-8')


# API de treinamento
replace_once(
    'src/app/api/ai-training/route.ts',
    "import { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';\nimport {\n  naraKnowledgeForEditor,\n  normalizeNaraKnowledge,\n} from '@/lib/nara-prompt-config';",
    "import { deriveHybridDecision } from '@/lib/hybrid';\nimport { loadNaraCommercialTurnContext } from '@/lib/nara-unit-queries';\nimport { countReplyWords, naraCommercialDiagnostics } from '@/lib/nara-simulator-diagnostics';\nimport { archiveNaraPromptVersion, getNaraPromptVersion, loadNaraPromptVersions } from '@/lib/nara-prompt-versions';\nimport {\n  extractNaraPrompt,\n  naraKnowledgeForEditor,\n  normalizeNaraKnowledge,\n} from '@/lib/nara-prompt-config';",
    'Imports da Fase 8 na API',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    || message.includes('nara_offer_logs')\n    || message.includes('schema cache');",
    "    || message.includes('nara_offer_logs')\n    || message.includes('nara_prompt_versions')\n    || message.includes('schema cache');",
    'Tabela de versões nos erros da API',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    const [config, examples, files, runtimeVariables] = await Promise.all([\n      loadConfig(context.supabase, context.organizationId, agentRaw),\n      loadExamples(context.supabase, context.organizationId, agentRaw),\n      loadFiles(context.supabase, context.organizationId, agentRaw),\n      agentRaw === 'nara'\n        ? loadNaraRuntimeVariables(context.supabase, context.organizationId)\n        : Promise.resolve(null),\n    ]);",
    "    const [config, examples, files, runtimeVariables, promptVersions] = await Promise.all([\n      loadConfig(context.supabase, context.organizationId, agentRaw),\n      loadExamples(context.supabase, context.organizationId, agentRaw),\n      loadFiles(context.supabase, context.organizationId, agentRaw),\n      agentRaw === 'nara'\n        ? loadNaraRuntimeVariables(context.supabase, context.organizationId)\n        : Promise.resolve(null),\n      agentRaw === 'nara'\n        ? loadNaraPromptVersions(context.supabase, context.organizationId)\n        : Promise.resolve(null),\n    ]);",
    'Carregamento do histórico no GET',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "      runtime_variables: runtimeVariables,\n    });",
    "      runtime_variables: runtimeVariables,\n      prompt_versions: promptVersions,\n    });",
    'Retorno do histórico no GET',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "  const body = await request.json().catch(() => ({})) as { agent?: unknown; config?: unknown; action?: unknown; variables?: unknown };",
    "  const body = await request.json().catch(() => ({})) as { agent?: unknown; config?: unknown; action?: unknown; variables?: unknown; version_id?: unknown };",
    'Tipo do PUT com versão',
)
restore_block = dedent(r'''
    if (body.action === 'restore_prompt') {
      if (body.agent !== 'nara') return NextResponse.json({ error: 'Somente o Prompt final da Nara possui histórico.' }, { status: 400 });
      const versionId = String(body.version_id ?? '').trim();
      if (!versionId) return NextResponse.json({ error: 'Versão não informada.' }, { status: 400 });
      const versionsState = await loadNaraPromptVersions(context.supabase, context.organizationId);
      if (!versionsState.schema_ready) {
        return NextResponse.json({ error: 'Execute a migration 019_nara_prompt_versions.sql antes de restaurar versões.' }, { status: 503 });
      }
      const selected = await getNaraPromptVersion(context.supabase, context.organizationId, versionId);
      if (!selected) return NextResponse.json({ error: 'A versão escolhida não foi encontrada.' }, { status: 404 });

      const currentConfig = await loadConfig(context.supabase, context.organizationId, 'nara');
      const currentPrompt = extractNaraPrompt(currentConfig.knowledge);
      if (currentPrompt && currentPrompt !== selected.prompt_text) {
        await archiveNaraPromptVersion(context.supabase, {
          organizationId: context.organizationId,
          promptText: currentPrompt,
          createdBy: context.user.id,
          reason: 'restore_backup',
          restoredFromId: selected.id,
        });
      }
      const restoredConfig = normalizeConfig('nara', {
        ...currentConfig,
        first_message: '',
        knowledge: {
          ...currentConfig.knowledge,
          prompt_final: selected.prompt_text,
        },
      });
      const { error } = await context.supabase.from('ai_agent_configs').upsert({
        organization_id: context.organizationId,
        agent: 'nara',
        persona: restoredConfig.persona,
        knowledge: restoredConfig.knowledge,
        first_message: restoredConfig.first_message,
        active: restoredConfig.active,
        updated_by: context.user.id,
      }, { onConflict: 'organization_id,agent' });
      if (error) throw error;
      return NextResponse.json({
        ok: true,
        config: configForEditor('nara', restoredConfig),
        prompt_versions: await loadNaraPromptVersions(context.supabase, context.organizationId),
      });
    }

''')
replace_once(
    'src/app/api/ai-training/route.ts',
    "  try {\n    if (body.action === 'variables') {",
    "  try {\n" + restore_block + "    if (body.action === 'variables') {",
    'Restauração de prompt no PUT',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    const config = normalizeConfig(body.agent, body.config);\n    const { error } = await context.supabase.from('ai_agent_configs').upsert({",
    "    const config = normalizeConfig(body.agent, body.config);\n    if (body.agent === 'nara') {\n      const versionsState = await loadNaraPromptVersions(context.supabase, context.organizationId);\n      if (!versionsState.schema_ready) {\n        return NextResponse.json({ error: 'Execute a migration 019_nara_prompt_versions.sql antes de salvar o Prompt final da Nara.' }, { status: 503 });\n      }\n      const { data: stored, error: storedError } = await context.supabase\n        .from('ai_agent_configs')\n        .select('knowledge')\n        .eq('organization_id', context.organizationId)\n        .eq('agent', 'nara')\n        .maybeSingle();\n      if (storedError) throw storedError;\n      const previousPrompt = extractNaraPrompt(stored?.knowledge);\n      const nextPrompt = extractNaraPrompt(config.knowledge);\n      if (previousPrompt && previousPrompt !== nextPrompt) {\n        await archiveNaraPromptVersion(context.supabase, {\n          organizationId: context.organizationId,\n          promptText: previousPrompt,\n          createdBy: context.user.id,\n          reason: 'save',\n        });\n      }\n    }\n    const { error } = await context.supabase.from('ai_agent_configs').upsert({",
    'Arquivamento antes do salvamento',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    if (error) throw error;\n    return NextResponse.json({ ok: true });",
    "    if (error) throw error;\n    if (body.agent === 'nara') {\n      return NextResponse.json({\n        ok: true,\n        config: configForEditor('nara', config),\n        prompt_versions: await loadNaraPromptVersions(context.supabase, context.organizationId),\n      });\n    }\n    return NextResponse.json({ ok: true });",
    'Retorno das versões após salvar',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "    const attachments = turn.attachment_ids\n      .map((id) => files.find((file) => file.id === id))",
    "    const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user')?.content ?? '';\n    const hybridDecision = deriveHybridDecision({ lead, turn, lastUserMessage });\n    const commercialDiagnostics = naraCommercialDiagnostics(aiContext.commercial);\n    const attachments = turn.attachment_ids\n      .map((id) => files.find((file) => file.id === id))",
    'Diagnóstico híbrido no simulador',
)
replace_once(
    'src/app/api/ai-training/route.ts',
    "      classification: turn.classification,\n      score: turn.score,\n      stage: turn.stage,\n      handoff: turn.handoff,\n      attachments,",
    "      classification: turn.classification,\n      score: turn.score,\n      stage: hybridDecision.stage,\n      handoff: hybridDecision.handoffRequired,\n      priority: hybridDecision.priorityClass,\n      word_count: countReplyWords(turn.reply),\n      price_consulted: commercialDiagnostics.price_consulted,\n      returned_units: commercialDiagnostics.returned_units,\n      consultation_names: commercialDiagnostics.consultation_names,\n      attachments,",
    'Campos novos do simulador',
)


# Tela da Nara
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "type Tab = 'simulador' | 'persona' | 'base' | 'correcoes' | 'variaveis' | 'prompt';",
    "type Tab = 'simulador' | 'persona' | 'base' | 'correcoes' | 'variaveis' | 'versoes' | 'prompt';",
    'Aba de versões no tipo Tab',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "type ChatMessage = { role: ChatRole; content: string };",
    "type ChatMessage = { role: ChatRole; content: string; diagnostics?: SimulationResult };",
    'Diagnóstico por mensagem',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "  handoff: boolean;\n  attachments: Array<{ id: string; title: string; category: string; original_name: string }>;\n};",
    "  handoff: boolean;\n  priority: string;\n  word_count: number;\n  price_consulted: boolean;\n  returned_units: string[];\n  consultation_names: string[];\n  attachments: Array<{ id: string; title: string; category: string; original_name: string }>;\n};\n\ntype PromptVersion = {\n  id: string;\n  prompt_text: string;\n  reason: 'save' | 'restore_backup';\n  restored_from_id: string | null;\n  created_at: string;\n};\n\ntype PromptVersionsState = {\n  versions: PromptVersion[];\n  schema_ready: boolean;\n  error?: string;\n};",
    'Tipos da Fase 8 na tela',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "  const [savingVariables, setSavingVariables] = useState(false);",
    "  const [savingVariables, setSavingVariables] = useState(false);\n  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);\n  const [promptVersionsSchemaReady, setPromptVersionsSchemaReady] = useState(true);\n  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);",
    'Estados do histórico',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "        { key: 'variaveis', label: `⚙️ Variáveis${missingRuntimeVariables.length ? ` (${missingRuntimeVariables.length})` : ''}` },\n        { key: 'prompt', label: '📄 Prompt final' },",
    "        { key: 'variaveis', label: `⚙️ Variáveis${missingRuntimeVariables.length ? ` (${missingRuntimeVariables.length})` : ''}` },\n        { key: 'versoes', label: `🕘 Versões (${promptVersions.length})` },\n        { key: 'prompt', label: '📄 Prompt final' },",
    'Aba de versões na navegação',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "        const data = await readJson<{ config: AgentConfig; examples: TrainingExample[]; ai?: AiStatus; runtime_variables?: RuntimeVariablesState | null }>(response);",
    "        const data = await readJson<{ config: AgentConfig; examples: TrainingExample[]; ai?: AiStatus; runtime_variables?: RuntimeVariablesState | null; prompt_versions?: PromptVersionsState | null }>(response);",
    'GET da tela com versões',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "        if (agent === 'nara' && data.runtime_variables) {\n          setRuntimeVariables(data.runtime_variables.values);\n          setMissingRuntimeVariables(data.runtime_variables.missing);\n          setRuntimeVariablesSchemaReady(data.runtime_variables.schema_ready);\n          setRuntimeVariablesUpdatedAt(data.runtime_variables.updated_at);\n        }",
    "        if (agent === 'nara' && data.runtime_variables) {\n          setRuntimeVariables(data.runtime_variables.values);\n          setMissingRuntimeVariables(data.runtime_variables.missing);\n          setRuntimeVariablesSchemaReady(data.runtime_variables.schema_ready);\n          setRuntimeVariablesUpdatedAt(data.runtime_variables.updated_at);\n        }\n        if (agent === 'nara' && data.prompt_versions) {\n          setPromptVersions(data.prompt_versions.versions);\n          setPromptVersionsSchemaReady(data.prompt_versions.schema_ready);\n        }",
    'Aplicação do histórico carregado',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "      await readJson<{ ok: boolean }>(await fetch('/api/ai-training', {\n        method: 'PUT',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ agent, config: configToSave }),\n      }));\n      setConfig(configToSave);",
    "      const data = await readJson<{ ok: boolean; config?: AgentConfig; prompt_versions?: PromptVersionsState }>(await fetch('/api/ai-training', {\n        method: 'PUT',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ agent, config: configToSave }),\n      }));\n      setConfig(data.config ? withNaraDefaults(data.config) : configToSave);\n      if (data.prompt_versions) {\n        setPromptVersions(data.prompt_versions.versions);\n        setPromptVersionsSchemaReady(data.prompt_versions.schema_ready);\n      }",
    'Atualização do histórico após salvar',
)
restore_function = dedent(r'''
  async function restorePromptVersion(version: PromptVersion) {
    const confirmed = window.confirm(`Restaurar a versão de ${new Date(version.created_at).toLocaleString('pt-BR')}? O prompt atual será guardado no histórico antes da troca.`);
    if (!confirmed) return;
    setRestoringVersionId(version.id);
    setError('');
    setNotice('');
    try {
      const data = await readJson<{ ok: boolean; config: AgentConfig; prompt_versions: PromptVersionsState }>(await fetch('/api/ai-training', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent: 'nara', action: 'restore_prompt', version_id: version.id }),
      }));
      const restoredConfig = withNaraDefaults(data.config);
      setConfig(restoredConfig);
      setPromptText(savedNaraPrompt(restoredConfig) || buildNaraPrompt(restoredConfig));
      setPromptVersions(data.prompt_versions.versions);
      setPromptVersionsSchemaReady(data.prompt_versions.schema_ready);
      setTab('prompt');
      setNotice('Versão restaurada. O prompt anterior também foi preservado no histórico.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível restaurar a versão.');
    } finally {
      setRestoringVersionId(null);
    }
  }

''')
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "  async function requestReply(nextMessages: ChatMessage[]) {",
    restore_function + "  async function requestReply(nextMessages: ChatMessage[]) {",
    'Função de restauração na tela',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "      const data = await readJson<{ reply: string; source: 'openai'; classification: string; score: number; stage: string; handoff: boolean; attachments: SimulationResult['attachments'] }>(await fetch('/api/ai-training', {",
    "      const data = await readJson<{ reply: string; source: 'openai'; classification: string; score: number; stage: string; handoff: boolean; priority: string; word_count: number; price_consulted: boolean; returned_units: string[]; consultation_names: string[]; attachments: SimulationResult['attachments'] }>(await fetch('/api/ai-training', {",
    'Resposta detalhada do simulador',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "      setMessages([...nextMessages, { role: 'assistant', content: data.reply }]);\n      setLastSimulation({\n        classification: data.classification,\n        score: data.score,\n        stage: data.stage,\n        handoff: data.handoff,\n        attachments: data.attachments ?? [],\n      });",
    "      const diagnostics: SimulationResult = {\n        classification: data.classification,\n        score: data.score,\n        stage: data.stage,\n        handoff: data.handoff,\n        priority: data.priority,\n        word_count: data.word_count,\n        price_consulted: data.price_consulted,\n        returned_units: data.returned_units ?? [],\n        consultation_names: data.consultation_names ?? [],\n        attachments: data.attachments ?? [],\n      };\n      setMessages([...nextMessages, { role: 'assistant', content: data.reply, diagnostics }]);\n      setLastSimulation(diagnostics);",
    'Diagnóstico anexado à resposta',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "      actions={<button\n        className=\"btn btn-primary btn-sm\"",
    "      actions={isNara && tab === 'versoes' ? null : <button\n        className=\"btn btn-primary btn-sm\"",
    'Oculta ação principal no histórico',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "        disabled={loading || (isNara && tab === 'variaveis' ? savingVariables || !runtimeVariablesSchemaReady : saving)}",
    "        disabled={loading || (isNara && tab === 'variaveis' ? savingVariables || !runtimeVariablesSchemaReady : saving || (isNara && !promptVersionsSchemaReady))}",
    'Bloqueia save sem migration 019',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "          : saving ? 'Salvando...' : isNara ? 'Salvar prompt da Nara' : 'Salvar treinamento'}</button>}",
    "          : saving ? 'Salvando...' : isNara ? 'Salvar prompt da Nara' : 'Salvar treinamento'}</button>}",
    'Mantém fechamento da ação principal',
)
# Fecha o ternário de actions acrescentando o fechamento correto.
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "          : saving ? 'Salvando...' : isNara ? 'Salvar prompt da Nara' : 'Salvar treinamento'}</button>}\n    />",
    "          : saving ? 'Salvando...' : isNara ? 'Salvar prompt da Nara' : 'Salvar treinamento'}</button>}\n    />",
    'Fechamento JSX da ação principal',
)
# O texto acima já é sintaticamente correto: `condition ? null : <button>...</button>`.

message_marker = """              {message.content}
              {message.role === 'assistant' && <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>"""
message_replacement = """              {message.content}
              {message.role === 'assistant' && message.diagnostics && <div className="info-box" style={{ marginTop: 9, fontSize: 11 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className="chip">{message.diagnostics.word_count} palavras</span>
                  <span className="chip">Preço consultado: {message.diagnostics.price_consulted ? 'sim' : 'não'}</span>
                  <span className="chip">Prioridade {message.diagnostics.priority}</span>
                  <span className="chip">Score {message.diagnostics.score}</span>
                </div>
                <div><strong>Classificação:</strong> {message.diagnostics.classification} · <strong>Etapa:</strong> {message.diagnostics.stage}</div>
                <div style={{ marginTop: 4 }}><strong>Unidades retornadas:</strong> {message.diagnostics.returned_units.length ? message.diagnostics.returned_units.join(', ') : 'nenhuma'}</div>
              </div>}
              {message.role === 'assistant' && <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>"""
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    message_marker,
    message_replacement,
    'Diagnóstico ao lado de cada resposta',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "            <div className=\"info-row\"><span>Etapa</span><strong>{lastSimulation.stage}</strong></div>\n            <div className=\"info-row\"><span>Transfere humano</span><strong>{lastSimulation.handoff ? 'Sim' : 'Não'}</strong></div>\n            <div className=\"info-row\"><span>Arquivos</span><strong>{lastSimulation.attachments.length}</strong></div>",
    "            <div className=\"info-row\"><span>Prioridade</span><strong>{lastSimulation.priority}</strong></div>\n            <div className=\"info-row\"><span>Etapa</span><strong>{lastSimulation.stage}</strong></div>\n            <div className=\"info-row\"><span>Palavras</span><strong>{lastSimulation.word_count}</strong></div>\n            <div className=\"info-row\"><span>Consultou preço</span><strong>{lastSimulation.price_consulted ? 'Sim' : 'Não'}</strong></div>\n            <div className=\"info-row\"><span>Unidades retornadas</span><strong>{lastSimulation.returned_units.length ? lastSimulation.returned_units.join(', ') : 'Nenhuma'}</strong></div>\n            <div className=\"info-row\"><span>Transfere humano</span><strong>{lastSimulation.handoff ? 'Sim' : 'Não'}</strong></div>\n            <div className=\"info-row\"><span>Arquivos</span><strong>{lastSimulation.attachments.length}</strong></div>",
    'Card lateral aprimorado',
)

versions_panel = dedent(r'''
      {!loading && isNara && tab === 'versoes' && <div className="grid">
        {!promptVersionsSchemaReady && <div className="error-box">
          <strong>Histórico indisponível:</strong> execute a migration <code>019_nara_prompt_versions.sql</code>. Enquanto ela não for aplicada, o salvamento do Prompt final fica bloqueado para evitar alterações sem versão de retorno.
        </div>}
        <section className="card">
          <div className="card-head">
            <div><h3>Versão atual</h3><small className="muted">Este é o texto que está ativo agora no atendimento e no simulador.</small></div>
            <span className="chip chip-green">Atual</span>
          </div>
          <div className="card-body">
            <div className="muted" style={{ fontSize: 12 }}>{promptText.length.toLocaleString('pt-BR')} caracteres</div>
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', fontSize: 12 }}>{promptText.slice(0, 1200)}{promptText.length > 1200 ? '…' : ''}</div>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><div><h3>Histórico do Prompt final</h3><small className="muted">Cada salvamento guarda a versão anterior. Restaurar exige o clique no botão e uma confirmação.</small></div><span className="chip">{promptVersions.length} versões</span></div>
          <div className="card-body">
            {promptVersions.length === 0
              ? <div className="empty-state">Nenhuma versão anterior foi registrada ainda.</div>
              : <div className="timeline">{promptVersions.map((version, index) => <div className="timeline-item" key={version.id}>
                  <div className="timeline-icon">{index + 1}</div>
                  <div style={{ minWidth: 0, width: '100%' }}>
                    <div className="timeline-title">{new Date(version.created_at).toLocaleString('pt-BR')} · {version.reason === 'restore_backup' ? 'Backup antes de restauração' : 'Versão anterior salva'}</div>
                    <div className="timeline-desc" style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{version.prompt_text.slice(0, 700)}{version.prompt_text.length > 700 ? '…' : ''}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                      <span className="muted" style={{ fontSize: 11 }}>{version.prompt_text.length.toLocaleString('pt-BR')} caracteres</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => restorePromptVersion(version)} disabled={restoringVersionId !== null || !promptVersionsSchemaReady}>
                        {restoringVersionId === version.id ? 'Restaurando...' : 'Restaurar esta versão'}
                      </button>
                    </div>
                  </div>
                </div>)}</div>}
          </div>
        </section>
      </div>}

''')
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "      {!loading && tab === 'prompt' && <section className=\"card\">",
    versions_panel + "      {!loading && tab === 'prompt' && <section className=\"card\">",
    'Painel de versões',
)
replace_once(
    'src/app/(crm)/treinamento/[agente]/page.tsx',
    "          {isNara && <div className=\"info-box\" style={{ marginTop: 12 }}>O botão <strong>Salvar prompt</strong> grava este conteúdo. O simulador usa o texto que está aberto agora, mesmo antes de salvar.</div>}",
    "          {isNara && !promptVersionsSchemaReady && <div className=\"error-box\" style={{ marginTop: 12 }}>Execute a migration <code>019_nara_prompt_versions.sql</code> para habilitar salvamento e restauração com histórico.</div>}\n          {isNara && <div className=\"info-box\" style={{ marginTop: 12 }}>O botão <strong>Salvar prompt</strong> guarda automaticamente a versão anterior. O simulador usa o texto aberto agora, mesmo antes de salvar.</div>}",
    'Aviso de versionamento no prompt',
)


# README e CI
replace_once(
    'supabase/migrations/README.md',
    "19. `018_nara_dynamic_context.sql`",
    "19. `018_nara_dynamic_context.sql`\n20. `019_nara_prompt_versions.sql`",
    'Migration 019 no README',
)
replace_once(
    'supabase/migrations/README.md',
    "O próximo número disponível é `019`.",
    "O próximo número disponível é `020`.",
    'Próximo número de migration',
)

check = dedent(r'''
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countReplyWords, naraCommercialDiagnostics } from '../src/lib/nara-simulator-diagnostics.ts';

assert.equal(countReplyWords('Oi, tudo bem?'), 3);
assert.equal(countReplyWords('  uma   resposta\ncom cinco palavras  '), 5);
assert.equal(countReplyWords(''), 0);

const diagnostics = naraCommercialDiagnostics({
  consulted_at: new Date().toISOString(),
  source_table: 'development_units',
  source_text: 'teste',
  calls: [
    { name: 'faixa_empreendimento', arguments: {}, result: { empreendimento: 'Flow', valor_minimo: 1, valor_maximo: 2, entrada_minima: 1, qtd_disponiveis: 3 } },
    { name: 'buscar_apartamentos', arguments: {}, result: [
      { empreendimento: 'Flow', unidade: '901' },
      { empreendimento: 'Flow', unidade: '1001' },
      { empreendimento: 'Flow', unidade: '901' },
    ] },
    { name: 'consultar_apartamento', arguments: {}, result: { empreendimento: 'Flow', unidade: '1201' } },
  ],
});
assert.equal(diagnostics.price_consulted, true);
assert.deepEqual(diagnostics.returned_units, ['901', '1001', '1201']);
assert.deepEqual(diagnostics.consultation_names, ['faixa_empreendimento', 'buscar_apartamentos', 'consultar_apartamento']);
assert.deepEqual(naraCommercialDiagnostics(null), { price_consulted: false, returned_units: [], consultation_names: [] });

const api = await readFile(new URL('../src/app/api/ai-training/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/(crm)/treinamento/[agente]/page.tsx', import.meta.url), 'utf8');
const helper = await readFile(new URL('../src/lib/nara-prompt-versions.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/019_nara_prompt_versions.sql', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');

assert.match(api, /archiveNaraPromptVersion/);
assert.match(api, /body\.action === 'restore_prompt'/);
assert.match(api, /deriveHybridDecision/);
assert.match(api, /word_count: countReplyWords/);
assert.match(api, /returned_units: commercialDiagnostics\.returned_units/);
assert.match(page, /Versões \(\$\{promptVersions\.length\}\)/);
assert.match(page, /window\.confirm/);
assert.match(page, /Restaurar esta versão/);
assert.match(page, /message\.diagnostics\.word_count/);
assert.match(page, /Preço consultado/);
assert.match(page, /Unidades retornadas/);
assert.match(helper, /loadNaraPromptVersions/);
assert.match(helper, /archiveNaraPromptVersion/);
assert.match(migration, /create table if not exists public\.nara_prompt_versions/);
assert.match(migration, /private\.is_org_admin/);
assert.match(migration, /char_length\(prompt_text\) between 1 and 100000/);
assert.match(workflow, /test:nara-phase8/);

console.log('Fase 8 validada: versionamento reversível e diagnósticos completos por resposta no simulador.');
''').strip() + '\n'
Path('scripts/check-nara-phase8.mjs').write_text(check, encoding='utf-8')

package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package['scripts']['test:nara-phase8'] = 'node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/check-nara-phase8.mjs'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

replace_once(
    '.github/workflows/validate.yml',
    "      - name: Test Nara dynamic context\n        run: npm run test:nara-dynamic-context",
    "      - name: Test Nara dynamic context\n        run: npm run test:nara-dynamic-context\n      - name: Test Nara prompt versions and simulator diagnostics\n        run: npm run test:nara-phase8",
    'Teste permanente no CI',
)

print('Fase 8 aplicada aos arquivos de trabalho.')
