-- Corrige o estado inconsistente em que um corretor fica marcado como
-- humano_ativo mesmo sem existir atendimento humano assumido.
--
-- Regra esperada:
-- - takeover humano real continua soberano (owner_mode=human, owner_id preenchido
--   ou automation_paused=true);
-- - corretor sem humano responsável permanece elegível para o Plantão;
-- - o horário de resposta continua sendo controlado por plantaoCanReplyNow().

create or replace function public.enforce_lead_ai_rules()
returns trigger
language plpgsql
as $function$
begin
  -- humano_ativo + owner_mode=ai + nenhum owner é um estado inconsistente para
  -- corretores. Normalizamos para uma etapa de IA antes das demais proteções.
  if new.kind = 'corretor'
     and new.stage = 'humano_ativo'
     and new.owner_mode = 'ai'
     and new.owner_id is null
     and coalesce(new.automation_paused, false) = false
     and coalesce(new.opt_out, false) = false then
    new.stage := 'nutricao_ativa';
    new.ai_enabled := true;
  end if;

  if new.opt_out = true or new.automation_paused = true then
    new.ai_enabled := false;
  end if;

  if new.owner_mode = 'human'
     or new.stage in ('humano_ativo','agendado','pos_reuniao','proposta_negociacao','fechado_ganho','encerrado') then
    new.ai_enabled := false;
  end if;

  if new.stage in ('fechado_ganho','encerrado') then
    new.owner_mode := 'none';
    new.next_action_due_at := null;
  end if;

  if new.owner_mode = 'ai'
     and new.stage in ('novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente','futuro')
     and new.opt_out = false
     and new.automation_paused = false then
    -- Preserva pausa manual quando ai_enabled já foi definido como false.
    new.ai_enabled := coalesce(new.ai_enabled, true);
  end if;

  return new;
end;
$function$;

-- Repara os registros já presos nesse estado. O filtro deliberadamente exclui
-- qualquer conversa com dono humano, pausa manual ou opt-out.
update public.leads
set
  stage = 'nutricao_ativa',
  ai_enabled = true,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'plantao_state_repaired_at', now(),
    'plantao_state_repair_reason', 'stale_humano_ativo_without_human_owner'
  ),
  updated_at = now()
where kind = 'corretor'
  and stage = 'humano_ativo'
  and owner_mode = 'ai'
  and owner_id is null
  and coalesce(automation_paused, false) = false
  and coalesce(opt_out, false) = false;
