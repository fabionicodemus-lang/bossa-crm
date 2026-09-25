-- Permite cliente -> corretor somente quando o próprio contato se identifica
-- como corretor em resposta a uma transmissão e o fluxo grava evidências.
-- Todas as demais tentativas continuam protegidas.

create or replace function public.protect_customer_kind_and_shared_history_routing()
returns trigger
language plpgsql
as $function$
begin
  -- Cliente continua sendo classificação protegida. A única exceção é uma
  -- transferência verificada pelo fluxo de resposta à transmissão.
  if tg_op = 'UPDATE'
     and old.kind = 'cliente'::lead_kind
     and new.kind <> 'cliente'::lead_kind then

    if new.kind = 'corretor'::lead_kind
       and lower(coalesce(new.metadata->>'client_broker_transfer_verified', 'false')) = 'true'
       and coalesce(new.metadata->>'client_broker_transfer_source_message_id', '') <> ''
       and coalesce(new.metadata->>'client_broker_transfer_broadcast_id', '') <> ''
       and coalesce(new.metadata->>'client_broker_transfer_detected_at', '') <> '' then
      -- Exceção intencional: o próprio contato declarou ser corretor / informou CRECI.
      null;
    else
      new.kind := 'cliente'::lead_kind;
    end if;
  end if;

  -- O histórico do número compartilhado do Plantão não prova que a pessoa é
  -- corretor. Se não havia cadastro anterior e o sincronizador tentar semear
  -- como corretor, nasce em GERAL para triagem posterior.
  if tg_op = 'INSERT'
     and new.kind = 'corretor'::lead_kind
     and coalesce(new.source, '') = 'WhatsApp Business · histórico'
     and coalesce((new.metadata->>'historical_pipeline_seed')::boolean, false) = true then
    new.kind := 'geral'::lead_kind;
    new.stage := case when new.stage = 'humano_ativo' then 'humano_ativo' else 'novo_triagem' end;
    new.company := null;
    new.ai_enabled := false;
    new.automation_paused := true;
    new.owner_mode := 'human';
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'general_pipeline_reason', 'Contato histórico do número compartilhado do Plantão; identidade ainda não confirmada',
      'plantao_triage_status', 'new'
    );
  end if;

  return new;
end;
$function$;
