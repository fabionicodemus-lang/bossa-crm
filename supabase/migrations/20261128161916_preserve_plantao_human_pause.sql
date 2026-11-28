-- Corrige a reativação do Plantão após mensagem humana, inclusive áudio.
-- Não altera os horários configurados nem a elegibilidade das transmissões.
begin;

create or replace function public.apply_broker_plantao_schedule_on_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_automation_paused boolean;
  v_active boolean;
  v_schedule jsonb;
  v_timezone text;
  v_local timestamp;
  v_day integer;
  v_hour integer;
  v_schedule_on boolean := false;
begin
  if new.lead_id is null or new.direction::text <> 'in' or new.sender_kind::text <> 'lead' then
    return new;
  end if;

  -- A importação dos 180 dias não deve acionar nem alterar o Plantão.
  if coalesce(new.raw_payload ->> 'source', '') = 'whatsapp_business_app_history' then
    return new;
  end if;

  select kind::text, automation_paused
    into v_kind, v_automation_paused
  from public.leads
  where id = new.lead_id
    and organization_id = new.organization_id
  for update;

  if v_kind is distinct from 'corretor' then
    return new;
  end if;

  -- O aplicativo também pausa sem metadata. Uma mensagem recebida ou troca
  -- de horário nunca pode remover a pausa; somente a reativação explícita.
  if coalesce(v_automation_paused, false) then
    return new;
  end if;

  select active, schedule, schedule_timezone
    into v_active, v_schedule, v_timezone
  from public.ai_agent_configs
  where organization_id = new.organization_id
    and agent = 'plantao'
  limit 1;

  if coalesce(v_active, false) then
    v_timezone := coalesce(nullif(v_timezone, ''), 'America/Sao_Paulo');
    v_local := timezone(v_timezone, now());
    v_day := extract(dow from v_local)::integer;
    v_hour := extract(hour from v_local)::integer;

    if jsonb_typeof(v_schedule) = 'array' and jsonb_array_length(v_schedule) = 7 then
      begin
        v_schedule_on := coalesce((v_schedule -> v_day ->> v_hour)::boolean, false);
      exception when others then
        v_schedule_on := false;
      end;
    else
      v_schedule_on := (v_day in (0, 6)) or (v_hour >= 18) or (v_hour < 8);
    end if;
  end if;

  update public.leads
  set owner_mode = case when v_schedule_on then 'ai' else 'human' end,
      ai_enabled = v_schedule_on,
      automation_paused = false,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'plantao_schedule_checked_at', now(),
          'plantao_schedule_active', v_schedule_on,
          'plantao_schedule_timezone', coalesce(v_timezone, 'America/Sao_Paulo')
        )
  where id = new.lead_id;

  return new;
end;
$$;


create or replace function public.advance_broker_pipeline_for_human_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
 v_lead public.leads%rowtype;
 v_offer boolean := false;
 v_stage text;
 v_next_action text;
begin
 if new.lead_id is null or new.whatsapp_channel_id is null then return new; end if;
 if new.created_at < now() - interval '15 minutes' or new.created_at > now() + interval '2 minutes' then return new; end if;
 if coalesce(new.raw_payload ->> 'source', '') = 'whatsapp_business_app_history' then return new; end if;
 -- Campanhas aprovadas não são uma tomada humana. O recibo é gravado
 -- antes do espelho em messages, inclusive nas versões antigas do webhook.
 if coalesce(new.raw_payload ->> 'browser_campaign_echo', '') = 'true'
    or exists (select 1 from public.browser_campaign_echo_receipts r
      where r.wamid = new.whatsapp_message_id and r.organization_id = new.organization_id)
 then return new; end if;
 if not (new.direction::text = 'out' and new.sender_kind::text = 'humano'
       or new.direction::text = 'in' and new.sender_kind::text = 'lead') then return new; end if;
 if not exists (select 1 from public.whatsapp_channels c where c.id=new.whatsapp_channel_id and c.role='corretor') then return new; end if;
 select * into v_lead from public.leads where id=new.lead_id and kind='corretor' and archived_at is null;
 if not found then return new; end if;
 -- Não tocar em uma conversa ainda controlada pela IA.
 if new.direction::text = 'in' and v_lead.owner_mode <> 'human' and v_lead.ai_enabled and not v_lead.automation_paused then return new; end if;
 if v_lead.stage in ('encerrado','fechado_ganho') then return new; end if;
 select exists(select 1 from public.proposals p where p.lead_id=v_lead.id and p.status='enviada' and p.updated_at >= now()-interval '14 days') into v_offer;
 v_stage := case
   when v_lead.stage in ('agendado','pos_reuniao','proposta_negociacao') then v_lead.stage
   when v_offer then 'proposta_negociacao'
   when v_lead.stage in ('novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente','futuro') then 'humano_ativo'
   else v_lead.stage end;
 v_next_action := case when v_offer then 'Acompanhar com a corretora a proposta enviada e confirmar o retorno do cliente; visita somente quando combinada.'
 else 'Acompanhar o retorno do corretor e registrar o próximo passo comercial.' end;
 update public.leads set
   stage=v_stage,
   metadata=case when new.direction::text='out' then coalesce(metadata,'{}'::jsonb)
     || jsonb_build_object('whatsapp_manual_takeover',true,
       'whatsapp_manual_takeover_at',new.created_at) else metadata end,
   last_human_activity_at=case when new.direction::text='out' then
     greatest(last_human_activity_at,new.created_at) else last_human_activity_at end,
   owner_mode=case when new.direction::text='out' then 'human' else owner_mode end,
   ai_enabled=case when new.direction::text='out' then false else ai_enabled end,
   automation_paused=case when new.direction::text='out' then true else automation_paused end,
   priority_class=coalesce(priority_class,case when v_offer then 'A2' else 'B' end),
   temperature=greatest(temperature,case when v_offer then 65 else 35 end),
   next_action=case when next_action is null or btrim(next_action)='' then v_next_action else next_action end,
   next_action_type=coalesce(next_action_type,'followup_humano'),
   next_action_due_at=coalesce(next_action_due_at,now()+interval '1 day')
 where id=v_lead.id and kind='corretor' and archived_at is null;
 return new;
end $$;

commit;
