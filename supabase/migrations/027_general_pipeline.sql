-- Pipeline geral: contatos do número compartilhado do Plantão que ainda não
-- são conhecidos como clientes ou corretores.

alter table public.leads drop constraint if exists lead_stage_by_kind;

alter table public.leads add constraint lead_stage_by_kind check (
  (kind = 'cliente'::lead_kind and stage = any (array[
    'novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente','humano_ativo','agendado','pos_reuniao','proposta_negociacao','futuro','fechado_ganho','encerrado'
  ]::text[]))
  or
  (kind = 'corretor'::lead_kind and stage = any (array[
    'novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente','humano_ativo','agendado','pos_reuniao','proposta_negociacao','futuro','encerrado'
  ]::text[]))
  or
  (kind = 'geral'::lead_kind and stage = any (array[
    'novo_triagem','humano_ativo','encerrado'
  ]::text[]))
) not valid;

-- O importador antigo assumia que qualquer conversa do número do Plantão era
-- de corretor. Apenas os cadastros que o próprio importador criou do zero são
-- movidos para Geral; corretores que já existiam antes permanecem intactos.
update public.leads
set kind = 'geral'::lead_kind,
    stage = 'novo_triagem',
    company = null,
    group_name = null,
    ai_enabled = false,
    automation_paused = true,
    owner_mode = 'human',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'general_pipeline_reason', 'Contato importado do número compartilhado do Plantão sem classificação prévia como cliente ou corretor',
      'general_pipeline_migrated_at', now()
    )
where kind = 'corretor'::lead_kind
  and coalesce(metadata->>'historical_pipeline_seed','false') = 'true'
  and exists (
    select 1
    from public.whatsapp_channels wc
    where wc.organization_id = leads.organization_id
      and wc.role = 'corretor'
      and wc.connection_mode = 'coexistence'
      and wc.id::text = leads.metadata->>'whatsapp_channel_id'
  );

alter table public.leads validate constraint lead_stage_by_kind;
