import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiFileOption, AiTrainingContext } from './ai';
import { normalizeNaraKnowledge } from './nara-prompt-config';
import type { LeadKind } from './types';

export async function loadAiContext(
  admin: SupabaseClient,
  organizationId: string,
  kind: LeadKind,
): Promise<AiTrainingContext> {
  const agent = kind === 'cliente' ? 'nara' : 'plantao';
  const [configResult, examplesResult, filesResult] = await Promise.all([
    admin
      .from('ai_agent_configs')
      .select('persona,knowledge,first_message,active')
      .eq('organization_id', organizationId)
      .eq('agent', agent)
      .maybeSingle(),
    admin
      .from('ai_training_examples')
      .select('user_message,assistant_message,rating,correction,notes')
      .eq('organization_id', organizationId)
      .eq('agent', agent)
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('ai_files')
      .select('id,category,title,description,trigger_keywords,storage_bucket,storage_path,original_name,mime_type')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .in('agent', [agent, 'both'])
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  if (configResult.error) console.error('[ai config]', configResult.error.message);
  if (examplesResult.error) console.error('[ai examples]', examplesResult.error.message);
  if (filesResult.error) console.error('[ai files]', filesResult.error.message);

  const config = configResult.data
    ? {
        ...configResult.data,
        knowledge: agent === 'nara'
          ? normalizeNaraKnowledge(configResult.data.knowledge)
          : configResult.data.knowledge,
      }
    : null;

  return {
    config,
    examples: examplesResult.data ?? [],
    files: (filesResult.data ?? []) as AiFileOption[],
  };
}
