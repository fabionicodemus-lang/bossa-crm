-- Pausa de 30 minutos desde a última resposta humana; etapa comercial preservada.
begin;
alter table public.leads add column if not exists plantao_human_pause_until timestamptz;
create index if not exists leads_plantao_human_pause_idx on public.leads(plantao_human_pause_until)
  where kind='corretor' and plantao_human_pause_until is not null;

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
   plantao_human_pause_until=case when new.direction::text='out' then
     greatest(plantao_human_pause_until,new.created_at + interval '30 minutes') else plantao_human_pause_until end,
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

create or replace function public.enforce_lead_ai_rules()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_timed_resume boolean := new.kind='corretor'
    and new.plantao_human_pause_until is not null and new.plantao_human_pause_until <= now()
    and new.owner_mode='ai' and not new.automation_paused and not new.opt_out;
begin
  -- humano_ativo + owner_mode=ai + nenhum owner é um estado inconsistente para
  -- corretores. Normalizamos para uma etapa de IA antes das demais proteções.
  if new.kind = 'corretor'
     and not v_timed_resume
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
     or new.stage in ('fechado_ganho','encerrado')
     or (not v_timed_resume and new.stage in ('humano_ativo','agendado','pos_reuniao','proposta_negociacao')) then
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


create or replace function public.resume_plantao_after_human_pause(p_lead_id uuid)
returns boolean language plpgsql set search_path = public as $$
declare
  l public.leads%rowtype;
  config public.ai_agent_configs%rowtype;
  local_time timestamp;
  active_now boolean := false;
begin
  select * into l from public.leads where id=p_lead_id for update;
  if not found or l.kind<>'corretor' or not l.automation_paused
    or l.plantao_human_pause_until is null or l.plantao_human_pause_until>now()
    or l.opt_out or l.archived_at is not null or l.stage in ('encerrado','fechado_ganho') then return false; end if;
  select * into config from public.ai_agent_configs where organization_id=l.organization_id and agent='plantao' limit 1;
  if not found or not config.active then return false; end if;
  local_time := timezone(coalesce(nullif(config.schedule_timezone,''),'America/Sao_Paulo'),now());
  if jsonb_typeof(config.schedule)='array' and jsonb_array_length(config.schedule)=7 then
    active_now := coalesce((config.schedule -> extract(dow from local_time)::int ->> extract(hour from local_time)::int)::boolean,false);
  else
    active_now := extract(dow from local_time)::int in (0,6) or extract(hour from local_time)::int>=18 or extract(hour from local_time)::int<8;
  end if;
  if not active_now then return false; end if;
  update public.leads set owner_mode='ai',ai_enabled=true,automation_paused=false,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('whatsapp_manual_takeover',false,
      'plantao_resumed_after_human_pause_at',now()), updated_at=now()
    where id=l.id;
  insert into public.activities(organization_id,lead_id,type,title,description,metadata)
    values(l.organization_id,l.id,'plantao_pausa_expirada','Plantão retomado após 30 minutos sem resposta humana',
      'O horário configurado foi respeitado e a etapa comercial foi preservada.',
      jsonb_build_object('pause_until',l.plantao_human_pause_until,'stage',l.stage));
  return true;
end $$;
revoke all on function public.resume_plantao_after_human_pause(uuid) from public,anon,authenticated;
grant execute on function public.resume_plantao_after_human_pause(uuid) to service_role;

-- Expiradas ainda pausadas, ou já retomadas com uma mensagem recente sem resposta.
-- Inclui o segundo caso para permitir retry após falha transitória, sem disparar follow-up.
create or replace function public.plantao_human_pause_candidates(p_limit integer default 3)
returns table(lead_id uuid) language sql stable set search_path = public as $$
  select l.id from public.leads l
  where l.kind='corretor' and l.plantao_human_pause_until<=now()
    and not l.opt_out and l.archived_at is null and l.stage not in ('encerrado','fechado_ganho')
    and (l.automation_paused or (l.owner_mode='ai' and l.ai_enabled and exists (
      select 1 from public.messages m join public.whatsapp_channels ch on ch.id=m.whatsapp_channel_id
      where m.lead_id=l.id and ch.role='corretor' and m.direction='in' and m.sender_kind='lead'
        and m.created_at>l.plantao_human_pause_until-interval '30 minutes'
        and m.created_at>now()-interval '24 hours'
        and coalesce(m.raw_payload->>'source','')<>'whatsapp_business_app_history'
        and not exists(select 1 from public.messages o where o.whatsapp_conversation_id=m.whatsapp_conversation_id
          and o.direction='out' and o.created_at>=m.created_at)
    )))
  order by l.plantao_human_pause_until,l.id limit greatest(1,least(p_limit,20));
$$;
revoke all on function public.plantao_human_pause_candidates(integer) from public,anon,authenticated;
grant execute on function public.plantao_human_pause_candidates(integer) to service_role;

-- Aplica a nova duração às pausas existentes causadas por mensagem real da equipe.
-- Um bloqueio manual posterior altera last_human_activity_at e não entra aqui.
update public.leads l set plantao_human_pause_until=m.created_at+interval '30 minutes'
from public.messages m join public.whatsapp_channels ch on ch.id=m.whatsapp_channel_id
where l.kind='corretor' and l.automation_paused and l.plantao_human_pause_until is null
  and l.id=m.lead_id and l.organization_id=m.organization_id and ch.role='corretor'
  and m.direction='out' and m.sender_kind='humano' and l.last_human_activity_at=m.created_at
  and coalesce(m.raw_payload->>'source','')<>'whatsapp_business_app_history'
  and coalesce(m.raw_payload->>'browser_campaign_echo','')<>'true'
  and not exists(select 1 from public.browser_campaign_echo_receipts r where r.wamid=m.whatsapp_message_id);
commit;
