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
